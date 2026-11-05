import assert from "node:assert/strict";
import { test } from "node:test";
import { ZeroAddress } from "ethers";
import { compileFixtures, localChain, profiles } from "./helpers/local-chain.mjs";

const evidence = (id, stage) => [id, stage, "Delivered for testing", "https://example.com/demo"];
const event = (result, name) => {
  const matches = result.events.filter((entry) => entry.name === name);
  assert.equal(matches.length, 1, `Expected one ${name} event`);
  return matches[0].args;
};
async function payout(h, id, stage, amount) {
  const before = await h.balance(h.accounts.A.address);
  const result = await h.send("A", "withdrawMilestone", [id, stage]);
  assert.equal(event(result, "FundsWithdrawn").amount, amount);
  assert.equal(await h.balance(h.accounts.A.address), before + amount - result.fee);
  return result;
}
async function assertWindow(h, id, deadline, open) {
  const window = await h.read("getMilestoneWindow", [id]);
  assert.deepEqual(window.toArray(), [deadline, open]);
}

for (const profile of profiles) {
  const artifacts = compileFixtures(profile);

  test(`${profile.name}: two stages, strict majority, independent votes and 40/60 payments`, async () => {
    const h = await localChain(artifacts);
    const id = await h.create();
    await h.send("A", "contribute", [id], { value: 1n, revert: "Creator cannot contribute" });
    await h.send("B", "contribute", [id], { value: 40n });
    await h.send("B", "contribute", [id], { value: 10n });
    assert.equal(await h.read("contributions", [id, h.address("B")]), 50n);
    assert.equal((await h.read("getProject", [id])).status, 0n);
    await assertWindow(h, id, 0n, false);
    const funded = await h.send("C", "contribute", [id], { value: 50n });
    assert.equal(event(funded, "FundingSuccessful").totalRaised, 100n);
    const submissionDeadline = h.now() + await h.read("SUBMISSION_TIMEOUT");
    await assertWindow(h, id, submissionDeadline, true);
    await h.send("D", "contribute", [id], { value: 1n, revert: "Funding closed" });
    await h.send("B", "approveMilestone", [id, 0], { revert: "Approval not open" });
    await h.send("B", "submitEvidence", evidence(id, 0), { revert: "Creator only" });
    h.at(submissionDeadline - 1n);
    await h.send("A", "submitEvidence", evidence(id, 0));
    const approvalDeadline = h.now() + await h.read("APPROVAL_TIMEOUT");
    await assertWindow(h, id, approvalDeadline, true);
    await h.send("A", "submitEvidence", evidence(id, 0), { revert: "Evidence already submitted" });
    await h.send("D", "approveMilestone", [id, 0], { revert: "Backers only" });
    await h.send("B", "approveMilestone", [id, 0]);
    const half = await h.read("getMilestone", [id, 0]);
    assert.equal(half.approvalWeight, 50n);
    assert.equal(half.approved, false);
    await h.send("B", "approveMilestone", [id, 0], { revert: "Already approved" });
    await h.send("A", "withdrawMilestone", [id, 0], { revert: "Milestone not withdrawable" });
    await h.send("A", "submitEvidence", evidence(id, 1), { revert: "Wrong milestone" });
    h.at(approvalDeadline - 1n);
    const approved = await h.send("C", "approveMilestone", [id, 0]);
    assert.equal(event(approved, "MilestoneApproved").milestone, 0n);
    await assertWindow(h, id, 0n, false);
    h.at(approvalDeadline + 1n);
    await h.send("B", "withdrawMilestone", [id, 0], { revert: "Creator only" });
    await payout(h, id, 0, 40n);
    assert.equal(await h.balance(), 60n);
    assert.equal((await h.read("getProject", [id])).currentMilestone, 1n);
    await h.send("A", "withdrawMilestone", [id, 0], { revert: "Wrong milestone" });
    assert.equal((await h.read("getMilestone", [id, 1])).approvalWeight, 0n);
    assert.equal(await h.read("hasApproved", [id, 1, h.address("B")]), false);
    await h.send("A", "submitEvidence", evidence(id, 1));
    await h.send("B", "approveMilestone", [id, 1]);
    // This catches using remaining escrow (60) as the denominator instead of totalRaised (100).
    assert.equal((await h.read("getMilestone", [id, 1])).approved, false);
    await h.send("C", "approveMilestone", [id, 1]);
    const completed = await payout(h, id, 1, 60n);
    assert.equal(event(completed, "ProjectCompleted").projectId, id);
    const project = await h.read("getProject", [id]);
    assert.equal(project.status, 3n);
    assert.equal(project.currentMilestone, 2n);
    assert.equal(project.escrowBalance, 0n);
    assert.equal(project.totalRaised, 100n);
    assert.equal(await h.balance(), 0n);
    await assertWindow(h, id, 0n, false);
    await h.send("A", "withdrawMilestone", [id, 1], { revert: "Project not successful" });
    await h.send("B", "claimRefund", [id], { revert: "Project not failed" });
  });

  test(`${profile.name}: contributions cap at the target and refund the excess; zero first payout preserves every wei`, async () => {
    for (const scenario of [
      { target: 100n, contributions: [["B", 51n], ["C", 51n]], approver: "B", total: 100n, excess: 2n, payments: [40n, 60n] },
      { target: 1n, contributions: [["B", 1n]], approver: "B", total: 1n, excess: 0n, payments: [0n, 1n] },
    ]) {
      const h = await localChain(artifacts);
      const id = await h.create({ target: scenario.target });
      let accepted = 0n;
      let refunded = 0n;
      for (const [actor, value] of scenario.contributions) {
        const result = await h.send(actor, "contribute", [id], { value });
        const received = event(result, "ContributionReceived").amount;
        accepted += received;
        refunded += result.events
          .filter((entry) => entry.name === "ExcessRefunded")
          .reduce((sum, entry) => sum + entry.args.amount, 0n);
        assert.equal(
          await h.read("contributions", [id, h.address(actor)]),
          received,
          "Only the accepted amount may be recorded",
        );
      }
      assert.equal(accepted, scenario.total, "Accepted contributions must equal the target");
      assert.equal(refunded, scenario.excess, "Excess must be returned in the same transaction");
      assert.equal((await h.read("getProject", [id])).totalRaised, scenario.total);
      assert.equal(await h.balance(), scenario.total, "Contract keeps exactly the accepted amount");
      await h.send("B", "contribute", [id], { value: 1n, revert: "Funding closed" });
      for (const stage of [0, 1]) {
        await h.send("A", "submitEvidence", evidence(id, stage));
        await h.send(scenario.approver, "approveMilestone", [id, stage]);
        assert.equal((await h.read("getMilestone", [id, stage])).approved, true);
        await payout(h, id, stage, scenario.payments[stage]);
        assert.equal((await h.read("getMilestone", [id, stage])).withdrawnAmount, scenario.payments[stage]);
      }
      assert.equal((await h.read("getProject", [id])).status, 3n);
      assert.equal(await h.balance(), 0n);
    }
  });

  test(`${profile.name}: interleaved projects isolate escrow, cumulative contributions and refunds`, async () => {
    const h = await localChain(artifacts);
    const deadline = h.now() + 20n;
    const p = await h.create();
    const q = await h.create({ creator: "D", deadline });
    await h.send("B", "contribute", [p], { value: 100n });
    await h.send("B", "contribute", [q], { value: 10n });
    await h.send("B", "contribute", [q], { value: 15n });
    await h.send("C", "contribute", [q], { value: 25n });
    const escrow = async (pAmount, qAmount) => {
      assert.equal((await h.read("getProject", [p])).escrowBalance, pAmount);
      assert.equal((await h.read("getProject", [q])).escrowBalance, qAmount);
      assert.equal(await h.balance(), pAmount + qAmount);
    };
    await escrow(100n, 50n);
    await h.send("A", "submitEvidence", evidence(p, 0));
    await h.send("B", "approveMilestone", [p, 0]);
    await payout(h, p, 0, 40n);
    await escrow(60n, 50n);
    h.at(deadline);
    await h.send("A", "finalizeFunding", [q]);
    assert.equal((await h.read("getProject", [q])).status, 2n);
    await escrow(60n, 50n);
    for (const [actor, remaining] of [["B", 25n], ["C", 0n]]) {
      const before = await h.balance(h.accounts[actor].address);
      const refund = await h.send(actor, "claimRefund", [q]);
      assert.equal(event(refund, "RefundClaimed").amount, 25n);
      assert.equal(await h.balance(h.accounts[actor].address), before + 25n - refund.fee);
      assert.equal(await h.read("refunded", [q, h.address(actor)]), true);
      assert.equal(await h.read("refunded", [p, h.address(actor)]), false);
      assert.equal(await h.read("contributions", [q, h.address(actor)]), 25n);
      await h.send(actor, "claimRefund", [q], { revert: "No refund available" });
      await escrow(60n, remaining);
    }
    assert.equal((await h.read("getProject", [q])).totalRaised, 50n);
    await h.send("A", "submitEvidence", evidence(p, 1));
    await h.send("B", "approveMilestone", [p, 1]);
    await payout(h, p, 1, 60n);
    await escrow(0n, 0n);
  });

  test(`${profile.name}: exact deadline closes contributions and requires explicit finalization`, async () => {
    const h = await localChain(artifacts);
    const deadline = h.now() + 20n;
    const id = await h.create({ deadline });
    h.at(deadline - 1n);
    await h.send("D", "finalizeFunding", [id], { revert: "Deadline not reached" });
    await h.send("B", "contribute", [id], { value: 10n });
    h.at(deadline);
    assert.equal((await h.read("getProject", [id])).status, 0n);
    await h.send("B", "contribute", [id], { value: 1n, revert: "Deadline reached" });
    await h.send("B", "claimRefund", [id], { revert: "Project not failed" });
    const result = await h.send("D", "finalizeFunding", [id]);
    assert.equal(event(result, "FundingFailed").projectId, id);
    assert.equal((await h.read("getProject", [id])).status, 2n);
    assert.equal((await h.read("getProject", [id])).escrowBalance, 10n);
    await h.send("D", "claimRefund", [id], { revert: "No refund available" });
  });

  test(`${profile.name}: rejected ETH payments roll back withdrawal and refund accounting`, async () => {
    const h = await localChain(artifacts);
    const receiver = await h.deploy("A", artifacts.receiver, [h.fund.address.toString()]);
    await h.send("A", "create", [100n, h.now() + 100n], { target: receiver });
    const p = 0n;
    await h.send("B", "contribute", [p], { value: 100n });
    await h.send("A", "evidence", [p], { target: receiver });
    await h.send("B", "approveMilestone", [p, 0]);
    await h.send("A", "withdraw", [p], { target: receiver, revert: "ETH transfer failed" });
    assert.equal((await h.read("getMilestone", [p, 0])).withdrawn, false);
    assert.equal((await h.read("getProject", [p])).currentMilestone, 0n);
    assert.equal(await h.balance(receiver.address), 0n);
    const deadline = h.now() + 20n;
    const q = await h.create({ deadline });
    await h.send("B", "contribute", [q], { target: receiver, value: 30n });
    h.at(deadline);
    await h.send("D", "finalizeFunding", [q]);
    await h.send("B", "refund", [q], { target: receiver, revert: "ETH transfer failed" });
    assert.equal(await h.read("refunded", [q, receiver.address.toString()]), false);
    assert.equal((await h.read("getProject", [q])).escrowBalance, 30n);
    await h.send("A", "allowPayments", [], { target: receiver });
    await h.send("A", "withdraw", [p], { target: receiver });
    assert.equal(await h.balance(receiver.address), 40n);
    await h.send("B", "refund", [q], { target: receiver });
    assert.equal(await h.balance(receiver.address), 70n);
    assert.equal((await h.read("getProject", [q])).escrowBalance, 0n);
    assert.equal((await h.read("getProject", [p])).escrowBalance, 60n);
    assert.equal(await h.balance(), 60n);
  });

  test(`${profile.name}: anyone can release two approved milestones and only the creator can collect`, async () => {
    const h = await localChain(artifacts);
    const id = await h.create();
    const recipient = h.address("C");
    await h.send("B", "contribute", [id], { value: 100n });
    await h.send("D", "releaseMilestone", [id, 0], { revert: "Milestone not withdrawable" });
    await h.send("A", "submitEvidence", evidence(id, 0));
    await h.send("B", "approveMilestone", [id, 0]);
    h.at(h.now() + await h.read("APPROVAL_TIMEOUT"));
    const first = await h.send("D", "releaseMilestone", [id, 0]);
    assert.equal(event(first, "MilestoneReleased").amount, 40n);
    assert.equal((await h.read("getProject", [id])).escrowBalance, 60n);
    assert.equal(await h.read("claimablePayouts", [id]), 40n);
    assert.equal(await h.balance(), 100n, "Releasing must not send any ETH");
    await assertWindow(h, id, h.now() + await h.read("SUBMISSION_TIMEOUT"), true);
    await h.send("D", "releaseMilestone", [id, 0], { revert: "Wrong milestone" });
    await h.send("D", "claimPayout", [id, h.address("D")], { revert: "Creator only" });
    await h.send("A", "claimPayout", [id, ZeroAddress], { revert: "Invalid payout recipient" });

    await h.send("A", "submitEvidence", evidence(id, 1));
    await h.send("B", "approveMilestone", [id, 1]);
    const second = await h.send("D", "releaseMilestone", [id, 1]);
    assert.equal(event(second, "MilestoneReleased").amount, 60n);
    assert.equal(event(second, "ProjectCompleted").projectId, id);
    assert.equal((await h.read("getProject", [id])).escrowBalance, 0n);
    assert.equal((await h.read("getProject", [id])).status, 3n);
    assert.equal(await h.read("claimablePayouts", [id]), 100n);
    await h.send("D", "releaseMilestone", [id, 1], { revert: "Project not successful" });

    const before = await h.balance(h.accounts.C.address);
    const claim = await h.send("A", "claimPayout", [id, recipient]);
    const paid = event(claim, "PayoutClaimed");
    assert.equal(paid.amount, 100n);
    assert.equal(paid.recipient.toLowerCase(), recipient);
    assert.equal(await h.balance(h.accounts.C.address), before + 100n);
    assert.equal(await h.read("claimablePayouts", [id]), 0n);
    assert.equal(await h.balance(), 0n);
    await h.send("A", "claimPayout", [id, recipient], { revert: "No payout available" });
  });

  test(`${profile.name}: a rejecting creator can redirect released funds after the next stage expires`, async () => {
    const h = await localChain(artifacts);
    const receiver = await h.deploy("A", artifacts.receiver, [h.fund.address.toString()]);
    const receiverAddress = receiver.address.toString();
    await h.send("A", "create", [100n, h.now() + 100n], { target: receiver });
    const id = 0n;
    await h.send("B", "contribute", [id], { value: 100n });
    await h.send("A", "evidence", [id], { target: receiver });
    await h.send("B", "approveMilestone", [id, 0]);
    await h.send("A", "withdraw", [id], { target: receiver, revert: "ETH transfer failed" });

    await h.send("D", "releaseMilestone", [id, 0]);
    assert.equal(await h.balance(receiver.address), 0n);
    assert.equal(await h.read("claimablePayouts", [id]), 40n);
    await h.send("A", "claimPayoutTo", [id, receiverAddress], {
      target: receiver, revert: "ETH transfer failed",
    });
    assert.equal(await h.read("claimablePayouts", [id]), 40n);

    h.at(h.now() + await h.read("SUBMISSION_TIMEOUT"));
    assert.equal(await h.read("getExpiredRefundAmount", [id, h.address("B")]), 60n);
    const refund = await h.send("B", "claimExpiredRefund", [id]);
    assert.equal(event(refund, "RefundClaimed").amount, 60n);
    assert.equal((await h.read("getProject", [id])).status, 4n);
    assert.equal((await h.read("getProject", [id])).escrowBalance, 0n);
    assert.equal(await h.balance(), 40n);

    const before = await h.balance(h.accounts.C.address);
    const claim = await h.send("A", "claimPayoutTo", [id, h.address("C")], { target: receiver });
    assert.equal(event(claim, "PayoutClaimed").amount, 40n);
    assert.equal(await h.balance(h.accounts.C.address), before + 40n);
    assert.equal(await h.read("claimablePayouts", [id]), 0n);
    assert.equal(await h.balance(), 0n);
  });

  test(`${profile.name}: a direct payout leaves earlier credited funds available`, async () => {
    const h = await localChain(artifacts);
    const id = await h.create();
    await h.send("B", "contribute", [id], { value: 100n });
    await h.send("A", "submitEvidence", evidence(id, 0));
    await h.send("B", "approveMilestone", [id, 0]);
    await h.send("D", "releaseMilestone", [id, 0]);
    await h.send("A", "submitEvidence", evidence(id, 1));
    await h.send("B", "approveMilestone", [id, 1]);
    await payout(h, id, 1, 60n);
    assert.equal(await h.read("claimablePayouts", [id]), 40n);
    assert.equal(await h.balance(), 40n);
    await h.send("A", "claimPayout", [id, h.address("A")]);
    assert.equal(await h.balance(), 0n);
  });

  test(`${profile.name}: approval timeout refunds both backers in either claim order`, async () => {
    const h = await localChain(artifacts);
    const timeout = await h.read("APPROVAL_TIMEOUT");
    const contributions = { B: 60n, C: 40n };
    for (const [first, second] of [["B", "C"], ["C", "B"]]) {
      const id = await h.create({ target: 100n });
      for (const backer of ["B", "C"]) {
        await h.send(backer, "contribute", [id], { value: contributions[backer] });
      }
      await h.send("A", "submitEvidence", evidence(id, 0));
      const deadline = h.now() + timeout;
      const quote = (backer) => h.read("getExpiredRefundAmount", [id, h.address(backer)]);
      h.at(deadline - 1n);
      await h.send("C", "approveMilestone", [id, 0]);
      await assertWindow(h, id, deadline, true);
      assert.equal(await quote(first), 0n);
      await h.send(first, "claimExpiredRefund", [id], { revert: "Approval window still open" });

      h.at(deadline);
      await assertWindow(h, id, deadline, false);
      await h.send("B", "approveMilestone", [id, 0], { revert: "Approval window closed" });
      assert.equal(await quote("D"), 0n);
      await h.send("D", "claimExpiredRefund", [id], { revert: "No refund available" });
      assert.equal(await quote(second), contributions[second]);
      for (const backer of [first, second]) {
        const expected = contributions[backer];
        const before = await h.balance(h.accounts[backer].address);
        assert.equal(await quote(backer), expected);
        const refund = await h.send(backer, "claimExpiredRefund", [id]);
        assert.equal(event(refund, "RefundClaimed").amount, expected);
        assert.equal(await h.balance(h.accounts[backer].address), before + expected - refund.fee);
        assert.equal(await h.read("refunded", [id, h.address(backer)]), true);
        assert.equal(await quote(backer), 0n);
        if (backer === first) {
          assert.equal(event(refund, "ProjectExpired").projectId, id);
        } else {
          assert.equal(refund.events.some((entry) => entry.name === "ProjectExpired"), false);
        }
        await h.send(backer, "claimExpiredRefund", [id], { revert: "No refund available" });
      }
      const project = await h.read("getProject", [id]);
      assert.equal(project.status, 4n);
      assert.equal(project.escrowBalance, 0n);
      assert.equal(await h.balance(), 0n);
      await h.send("B", "approveMilestone", [id, 0], { revert: "Project not successful" });
      await h.send("A", "withdrawMilestone", [id, 0], { revert: "Project not successful" });
    }
  });

  test(`${profile.name}: stage-two submission expiry refunds fixed shares of the unpaid escrow`, async () => {
    const h = await localChain(artifacts);
    const timeout = await h.read("SUBMISSION_TIMEOUT");
    const id = await h.create({ target: 103n });
    await h.send("B", "contribute", [id], { value: 60n });
    await h.send("C", "contribute", [id], { value: 43n });
    await h.send("A", "submitEvidence", evidence(id, 0));
    await h.send("B", "approveMilestone", [id, 0]);
    h.at(h.now() + timeout + 1n);
    await payout(h, id, 0, 41n);
    assert.equal(await h.balance(), 62n);

    const deadline = h.now() + timeout;
    await assertWindow(h, id, deadline, true);
    h.at(deadline - 1n);
    assert.equal(await h.read("getExpiredRefundAmount", [id, h.address("B")]), 0n);
    await h.send("B", "claimExpiredRefund", [id], { revert: "Submission window still open" });
    h.at(deadline);
    await assertWindow(h, id, deadline, false);
    await h.send("A", "submitEvidence", evidence(id, 1), { revert: "Submission window closed" });
    for (const [backer, expected] of [["C", 25n], ["B", 36n]]) {
      assert.equal(await h.read("getExpiredRefundAmount", [id, h.address(backer)]), expected);
      const refund = await h.send(backer, "claimExpiredRefund", [id]);
      assert.equal(event(refund, "RefundClaimed").amount, expected);
    }
    assert.equal((await h.read("getProject", [id])).escrowBalance, 1n);
    assert.equal((await h.read("getProject", [id])).status, 4n);
    assert.equal(await h.balance(), 1n, "Only the integer rounding remainder stays in escrow");
  });

  test(`${profile.name}: an expiry refund that cannot be delivered can be retried`, async () => {
    const h = await localChain(artifacts);
    const receiver = await h.deploy("A", artifacts.receiver, [h.fund.address.toString()]);
    const id = await h.create({ target: 100n });
    const receiverAddress = receiver.address.toString();
    await h.send("B", "contribute", [id], { value: 40n });
    await h.send("C", "contribute", [id], { value: 60n, target: receiver });
    h.at(h.now() + await h.read("SUBMISSION_TIMEOUT"));

    await h.send("C", "expiredRefund", [id], { target: receiver, revert: "ETH transfer failed" });
    assert.equal((await h.read("getProject", [id])).status, 1n);
    assert.equal(await h.read("getExpiredRefundAmount", [id, receiverAddress]), 60n);
    assert.equal(event(await h.send("B", "claimExpiredRefund", [id]), "RefundClaimed").amount, 40n);

    await h.send("C", "allowPayments", [], { target: receiver });
    assert.equal(await h.read("getExpiredRefundAmount", [id, receiverAddress]), 60n);
    const retry = await h.send("C", "expiredRefund", [id], { target: receiver });
    assert.equal(event(retry, "RefundClaimed").amount, 60n);
    assert.equal(await h.balance(), 0n);
  });

  test(`${profile.name}: an approved milestone cannot be refunded`, async () => {
    const h = await localChain(artifacts);
    const timeout = await h.read("APPROVAL_TIMEOUT");
    const id = await h.create({ target: 100n });
    await h.send("B", "contribute", [id], { value: 100n });
    await h.send("A", "submitEvidence", evidence(id, 0));
    await h.send("B", "approveMilestone", [id, 0]);
    h.at(h.now() + timeout);
    assert.equal(await h.read("getExpiredRefundAmount", [id, h.address("B")]), 0n);
    await h.send("B", "claimExpiredRefund", [id], { revert: "Milestone already approved" });
  });

  test(`${profile.name}: submission timeout protects backers when the creator never submits`, async () => {
    const h = await localChain(artifacts);
    const timeout = await h.read("SUBMISSION_TIMEOUT");
    const id = await h.create({ target: 100n });
    await h.send("B", "contribute", [id], { value: 100n });
    const successfulAt = h.now();
    await h.send("B", "claimExpiredRefund", [id], { revert: "Submission window still open" });
    h.at(successfulAt + timeout);
    await assertWindow(h, id, successfulAt + timeout, false);
    await h.send("A", "submitEvidence", evidence(id, 0), { revert: "Submission window closed" });
    const refund = await h.send("B", "claimExpiredRefund", [id]);
    assert.equal(event(refund, "RefundClaimed").amount, 100n);
    assert.equal((await h.read("getProject", [id])).status, 4n);
    await assertWindow(h, id, successfulAt + timeout, false);
    assert.equal(await h.balance(), 0n);
  });

  test(`${profile.name}: a zero first-stage payout skips the ETH transfer`, async () => {
    const h = await localChain(artifacts);
    const receiver = await h.deploy("A", artifacts.receiver, [h.fund.address.toString()]);
    await h.send("A", "create", [1n, h.now() + 100n], { target: receiver });
    const id = 0n;
    await h.send("B", "contribute", [id], { value: 1n });
    await h.send("A", "evidence", [id], { target: receiver });
    await h.send("B", "approveMilestone", [id, 0]);

    // floor(1 * 40 / 100) = 0, and the receiver rejects ETH: success proves the call was skipped.
    await h.send("A", "withdraw", [id], { target: receiver });
    const stage0 = await h.read("getMilestone", [id, 0]);
    assert.equal(stage0.withdrawn, true);
    assert.equal(stage0.withdrawnAmount, 0n);
    assert.equal((await h.read("getProject", [id])).currentMilestone, 1n);
    assert.equal((await h.read("getProject", [id])).escrowBalance, 1n);
    assert.equal(await h.balance(receiver.address), 0n);

    // The second stage pays the remaining 1 wei, so the same rejecting receiver must fail.
    await h.send("A", "evidenceFor", [id, 1], { target: receiver });
    await h.send("B", "approveMilestone", [id, 1]);
    await h.send("A", "withdrawFor", [id, 1], { target: receiver, revert: "ETH transfer failed" });
    assert.equal((await h.read("getMilestone", [id, 1])).withdrawn, false);
    assert.equal((await h.read("getProject", [id])).escrowBalance, 1n);
  });

  test(`${profile.name}: timeouts come from the constructor, so a demo can expire quickly`, async () => {
    const h = await localChain(artifacts, { approvalTimeout: 60n, submissionTimeout: 120n });
    assert.equal(await h.read("APPROVAL_TIMEOUT"), 60n);
    assert.equal(await h.read("SUBMISSION_TIMEOUT"), 120n);

    const id = await h.create({ target: 1n });
    await h.send("B", "contribute", [id], { value: 1n });
    await h.send("A", "submitEvidence", evidence(id, 0));
    await h.send("B", "claimExpiredRefund", [id], { revert: "Approval window still open" });
    h.at(h.now() + 60n);
    const refund = await h.send("B", "claimExpiredRefund", [id]);
    assert.equal(event(refund, "RefundClaimed").amount, 1n);
    assert.equal((await h.read("getProject", [id])).status, 4n);
  });
}
