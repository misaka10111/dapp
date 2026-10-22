import assert from "node:assert/strict";
import { test } from "node:test";
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
    const funded = await h.send("C", "contribute", [id], { value: 50n });
    assert.equal(event(funded, "FundingSuccessful").totalRaised, 100n);
    await h.send("D", "contribute", [id], { value: 1n, revert: "Funding closed" });
    await h.send("B", "approveMilestone", [id, 0], { revert: "Approval not open" });
    await h.send("B", "submitEvidence", evidence(id, 0), { revert: "Creator only" });
    await h.send("A", "submitEvidence", evidence(id, 0));
    await h.send("A", "submitEvidence", evidence(id, 0), { revert: "Evidence already submitted" });
    await h.send("D", "approveMilestone", [id, 0], { revert: "Backers only" });
    await h.send("B", "approveMilestone", [id, 0]);
    const half = await h.read("getMilestone", [id, 0]);
    assert.equal(half.approvalWeight, 50n);
    assert.equal(half.approved, false);
    await h.send("B", "approveMilestone", [id, 0], { revert: "Already approved" });
    await h.send("A", "withdrawMilestone", [id, 0], { revert: "Milestone not withdrawable" });
    await h.send("A", "submitEvidence", evidence(id, 1), { revert: "Wrong milestone" });
    const approved = await h.send("C", "approveMilestone", [id, 0]);
    assert.equal(event(approved, "MilestoneApproved").milestone, 0n);
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
    await h.send("A", "withdrawMilestone", [id, 1], { revert: "Project not successful" });
    await h.send("B", "claimRefund", [id], { revert: "Project not failed" });
  });

  test(`${profile.name}: overshoot uses actual total; rounding and zero first payout preserve every wei`, async () => {
    for (const scenario of [
      { target: 100n, contributions: [["B", 50n], ["C", 51n]], approver: "C", total: 101n, payments: [40n, 61n] },
      { target: 1n, contributions: [["B", 1n]], approver: "B", total: 1n, payments: [0n, 1n] },
    ]) {
      const h = await localChain(artifacts);
      const id = await h.create({ target: scenario.target });
      for (const [actor, value] of scenario.contributions) await h.send(actor, "contribute", [id], { value });
      assert.equal((await h.read("getProject", [id])).totalRaised, scenario.total);
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
}
