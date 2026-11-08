# Sepolia End-to-End Test Record

> This page keeps separate records for the current and original contracts. Both runs used project ID `2`; distinguish them by **contract address and date**. Their transactions and screenshots must not be mixed.

## Current successful workflow (2026-11-07)

The successful workflow on the new version is complete: **13 successful transactions, 13 corresponding block-state snapshots, and 13 original screenshots supplied by the tester**. Every receipt has `status=1`; senders, target contract, functions, arguments, and events were checked through read-only queries. Both milestones demonstrated that exactly 50% approval weight does not approve a milestone, while 100% does. Each payout was first released to the claimable balance and then claimed separately. The final project status is Completed, with both project escrow and claimable payout at 0.

### Test baseline and evidence

| Item | Record |
| --- | --- |
| Test date / transaction period | 2026-11-07, 14:46:24–15:04:00 (Asia/Shanghai / UTC+8) |
| Network / chain ID | Ethereum Sepolia / `11155111` |
| Contract | `0x5A5AeaE5553Feb5c5b27FEe5ec8b24E3ED2B964F` |
| Project | `#002` / `Test Project 03` |
| Target / two contributions | 0.0001 ETH; B and C each contributed 0.00005 ETH |
| Funding deadline | 2026-11-08 18:00 (UTC+8) |
| Submission / approval windows | Both read as 600 seconds from the contract; the operations in this run were completed within the windows. Timeout paths were not tested |
| First / second milestone amounts | 0.00004 ETH / 0.00006 ETH |
| Block range | `12081978`–`12082066`; each transaction's block hash was checked again after collection |
| Local code reference | `4a77279`; at test time, the working tree also contained uncommitted verification, test, and documentation changes. The contract and frontend ABI were unchanged. See the [deployment verification record](deployment-verification.md) for the deployment match level |
| Web entry point | The test instructions used the [GitHub Pages demo](https://misaka10111.github.io/dapp/). The deployed frontend build's commit was not independently established, and the browser version was not recorded |

| Role | Transaction sender in this run |
| --- | --- |
| A / creator and payout recipient | `0x406799E512b14CbDfCCB7EF2Acea9e6bCFB218C4` |
| B / backer | `0x26791C26Fba3612Eb49FA763fA47CfEcd66b6a1E` |
| C / backer | `0x3851E2C69AE098447Adc8038dC71817aBaf39bc8` |

- [Raw on-chain transactions, receipts, decoded events, and reads at fixed blocks](evidence/2026-11-07-project-002/chain-evidence.json): all 13 steps are stored in `steps[0..12]`. Each contains `rawTransaction`, `rawReceipt`, `decodedCall`, `events`, `snapshot`, and `readCalls`. All amounts are stored as wei strings.
- [Screenshot manifest and SHA-256 hashes](evidence/2026-11-07-project-002/screenshots.json): the 13 uploaded PNGs were copied unchanged, without cropping, compression, or editing. The manifest retains their original attachment names, dimensions, byte counts, and visible states.
- The tester signed transactions using the web page and MetaMask. Evidence collection used read-only RPC calls; it did not send transactions, deploy contracts, or operate the wallet.

### Step-by-step results

The block states are read-only snapshots **at the end of each block**, not intra-transaction traces. The states and amounts below were cross-checked against the corresponding snapshots and screenshots. The tester separately confirmed the browser refresh.

| Operation | Block | Verification result | Evidence |
| --- | --- | --- | --- |
| 1. A creates the project | `12081978` | PASS: `ProjectCreated(2,A,…)`; Funding, with raised amount and escrow at 0 | [Transaction](https://sepolia.etherscan.io/tx/0xdae4720a2fef074f576e58196be44170c0b0b7d917b13f66e5f431fda9f87437) · [Screenshot](evidence/2026-11-07-project-002/01-project-created.png) |
| 2. B contributes 0.00005 ETH | `12082002` | PASS: `ContributionReceived`; Funding / 50%, with raised amount and escrow at 0.00005 ETH | [Transaction](https://sepolia.etherscan.io/tx/0xedac642f43028573ea475d58fb7bcfd44786a3025c46a6f099c51f182b379a44) · [Screenshot](evidence/2026-11-07-project-002/02-b-funded-50-percent.png) |
| 3. C contributes 0.00005 ETH | `12082012` | PASS: `ContributionReceived` + `FundingSuccessful`; Successful / 100%, with raised amount and escrow at 0.0001 ETH | [Transaction](https://sepolia.etherscan.io/tx/0x923e80b878d47111a62a2c0fc3d31cbc9618088563b9fef40b359e74aa2c40a2) · [Screenshot](evidence/2026-11-07-project-002/03-funded-100-percent.png) |
| 4. A submits evidence for the first milestone | `12082018` | PASS: `EvidenceSubmitted(2,0,…)`; submitted=true, approved=false, approval weight 0 | [Transaction](https://sepolia.etherscan.io/tx/0x204fb8a2f4f89ae7bfba84670f3e7f34d9893d44e5da143c209abd694442df0b) · [Screenshot](evidence/2026-11-07-project-002/04-milestone-1-in-review.png) |
| 5. B approves the first milestone | `12082025` | PASS: `ApprovalCast` weight 0.00005 ETH; exactly 50%, approved=false, with In review shown on the page | [Transaction](https://sepolia.etherscan.io/tx/0xbc76dde48a3cd6ef08cec196a38d34fb80e19497ee236e2e457fe28ffbd3b135) · [Screenshot](evidence/2026-11-07-project-002/05-milestone-1-b-approved-50-percent.png) |
| 6. C approves the first milestone | `12082028` | PASS: `ApprovalCast` + `MilestoneApproved`; weight 100%, approved=true | [Transaction](https://sepolia.etherscan.io/tx/0x23e8c1060d4c9801ba676bcff2ae11d630c19d600085597e861b6739693e0c5a) · [Screenshot](evidence/2026-11-07-project-002/06-milestone-1-approved-100-percent.png) |
| 7. A releases the first milestone | `12082036` | PASS: `MilestoneReleased` for 0.00004 ETH, with no `PayoutClaimed`; project escrow 0.00006 ETH, claimable payout 0.00004 ETH | [Transaction](https://sepolia.etherscan.io/tx/0x86b88633a205b2a362581028d21da3e7b23325ea637de915f1376624f31ebf9a) · [Screenshot](evidence/2026-11-07-project-002/07-milestone-1-released-payout-pending.png) |
| 8. A claims the first payout | `12082040` | PASS: `PayoutClaimed` records 0.00004 ETH paid to A; claimable payout returns to 0, while project escrow remains 0.00006 ETH | [Transaction](https://sepolia.etherscan.io/tx/0x370fabc64d77a8aced0470cfa195a4d7fe7c5e2f819781fd609249bfebbcbfec) · [Screenshot](evidence/2026-11-07-project-002/08-milestone-1-payout-claimed.png) |
| 9. A submits evidence for the second milestone | `12082045` | PASS: `EvidenceSubmitted(2,1,…)`; the second milestone starts with approval weight 0, while the first milestone's records are retained | [Transaction](https://sepolia.etherscan.io/tx/0xfaae62807e8ff377805dbb52ce49e1379fd5290c9213d85921d1663f24c664d4) · [Screenshot](evidence/2026-11-07-project-002/09-milestone-2-in-review.png) |
| 10. B approves the second milestone | `12082052` | PASS: `ApprovalCast` weight 0.00005 ETH; 50% of the original total contributions, approved=false | [Transaction](https://sepolia.etherscan.io/tx/0xcdb7134171df911933454aa6ef3156215d9e6e5aa4cfd7ca942c98d1262c7a91) · [Screenshot](evidence/2026-11-07-project-002/10-milestone-2-b-approved-50-percent.png) |
| 11. C approves the second milestone | `12082056` | PASS: `ApprovalCast` + `MilestoneApproved`; weight 100%, approved=true | [Transaction](https://sepolia.etherscan.io/tx/0x07cd037fa33f4a26f823e2a7ab5c6b3ffe0e5b13dc584859dbb71cc70ca7ab9a) · [Screenshot](evidence/2026-11-07-project-002/11-milestone-2-approved-100-percent.png) |
| 12. A releases the second milestone | `12082061` | PASS: `MilestoneReleased` for 0.00006 ETH + `ProjectCompleted`; Completed, project escrow 0, with 0.00006 ETH still claimable | [Transaction](https://sepolia.etherscan.io/tx/0x7614e7d2826c1d0e98e841e95fda7d933e9babab360596b23eb6e0311847d5e8) · [Screenshot](evidence/2026-11-07-project-002/12-completed-payout-pending.png) |
| 13. A claims the second payout and refreshes the page | `12082066` | PASS: `PayoutClaimed` records 0.00006 ETH paid to A; on-chain claimable payout and project escrow are 0. The tester confirmed that the screenshot was taken after refreshing | [Transaction](https://sepolia.etherscan.io/tx/0xe528db3575d57ebda35c078d75a3ea5eb8fda9178fd2fe367ac3a3f2fea4c345) · [Screenshot](evidence/2026-11-07-project-002/13-completed-after-refresh.png) |

### Key states and scope of the conclusions

- Block `12082036`: after the first milestone was released, project escrow was 0.00006 ETH and claimable payout was 0.00004 ETH. After the separate claim in block `12082040`, claimable payout was 0 and escrow remained 0.00006 ETH.
- Block `12082061`: after the second milestone was released, the project was already Completed, both milestones had `withdrawn=true`, and project escrow was 0, but `claimablePayouts(2)=0.00006 ETH`. Thus, `withdrawn` / `Released` means released from escrow; it does not by itself establish that the recipient has claimed the payout.
- Block `12082066`: the second `PayoutClaimed` event records A as the recipient and 0.00006 ETH as the amount. The total released across both milestones and the total claimed according to the events were each 0.0001 ETH. Final claimable payout and project escrow were 0. Historical `totalRaised` remained 0.0001 ETH, and B/C's original contributions remained 0.00005 ETH each.
- The tester explicitly confirmed that `13-completed-after-refresh.png` was taken "after refreshing." The image still shows Completed, two Released milestones, and 0 escrow; the claimable payout panel is absent. This is recorded as **manual refresh confirmation and screenshot verification**; the refresh event was not captured automatically.
- This run covered only the successful workflow and the default recipient A. It did not test excess contributions, timeout refunds, rejected signatures, wrong networks, alternative payout recipients, repeated operations, or permission rejections through direct calls. No transaction trace or independent wallet balance/gas reconciliation was performed. Claimed amounts were checked against successful receipts, `PayoutClaimed` events, and contract state. Outstanding scenarios are listed in the progress table at the end.

## Historical conclusions (2026-10-22)

- Project #002 passed the successful business workflow: creation, contributions from two backers, evidence submission and approval for both milestones, and 40% / 60% withdrawals. Receipts were obtained for all 11 successful transactions.
- The final status was `Completed`, project escrow was 0, and the two milestones released a total of `0.0001 ETH`. For each milestone, B's vote alone represented 50% and did not approve it; C's vote brought the weight to 100% and approved it.
- 7 rejection paths passed read-only simulation checks at fixed blocks: duplicate voting, withdrawal at 50%, repeated withdrawal of the first milestone, withdrawal after completion, early finalization, early refund, and duplicate refund. These simulations did not send transactions.
- A screenshot of the top of project #002's completion page was returned following the completion-page verification instructions. It showed Completed and 0 project escrow, consistent with subsequent state at a fixed block. This is manual screenshot evidence; the browser refresh event was not captured automatically.
- Independent refund project #003 passed: it raised only `0.00003 ETH`, below its `0.0002 ETH` target. It was finalized as Failed after the deadline; B claimed the original contribution, project escrow became 0, and a duplicate refund was rejected.
- The two manual business workflows produced a total of 15 successful transactions and 17 original screenshots, all retained.
- The continuous-state automated tests available at the time passed: 5 scenarios were compiled using both the repository-default and old Sepolia deployment configurations, for 10 passing tests. Transactions ran in a local in-memory EVM and were not sent to Sepolia. See the [automated testing guide](automated-testing.md) for current coverage.
- The original deployment was reproduced: the contract source at the baseline commit below, compiled with Solidity 0.8.34, optimization disabled, Osaka, source-unit name `MilestoneFund.sol`, and LF line endings, matched the full runtime code at the fixed block byte for byte, including metadata. The frontend `npm run build` also passed at the time. See the [deployment verification record](deployment-verification.md).

## Historical test baseline

- Date: 2026-10-22 (Beijing time, UTC+8).
- Working branch: `feat/e2e-and-deployment`.
- Tested source commit: `75e9190d277b573131d5018836af575cb8011fbc`.
- Network: Ethereum Sepolia, chain ID `11155111`.
- Contract: `0x9b824CA674432B390E30A5164a76c04EeAa8f686`.
- Project: `#002` / `HQC-E2E-Success-1022`.
- Target: `0.0001 ETH`; funding deadline: 2026-10-23 18:00 (Beijing time).
- Independent refund test project: `#003` / `HQC-E2E-Refund-1022`, target `0.0002 ETH`, deadline 2026-10-22 11:00 (Beijing time).
- The tester performed real transactions through the web page and MetaMask. Receipt and state verification in this record used read-only RPC calls only.
- The contract source remained at the baseline commit above; this work added tests, verification scripts, and documentation. The runtime code at fixed block `11966764` was fully matched, and the exact compiler input and original on-chain code were saved.

## Accounts

| Role | Address |
| --- | --- |
| A / project creator | `0x406799E512b14CbDfCCB7EF2Acea9e6bCFB218C4` |
| B / backer | `0x26791C26Fba3612Eb49FA763fA47CfEcd66b6a1E` |
| C / backer | `0x3851E2C69AE098447Adc8038dC71817aBaf39bc8` |

## Completed operations

| Operation | Expected result | Verification result | Transaction / evidence |
| --- | --- | --- | --- |
| A creates the project | Target 0.0001 ETH, initial raised amount and escrow 0 | PASS: receipt status=1 was retrieved retrospectively. A directly called createProject; the project ID, creator, target, and deadline in ProjectCreated matched the initial state at block 11966404. Funding, with neither milestone submitted | [Creation transaction](https://sepolia.etherscan.io/tx/0xd5fbd668c4046fcd56d19bbf2d9b8e77496f5fa2b8a1df2176938c93930f2ced); `01-project-created.png` |
| B contributes 0.00005 ETH | 50% funded, remains Funding | PASS: receipt status=1; the transaction called contribute(2), value=50000000000000 wei. The ContributionReceived event amount and address matched; the page showed 50% | [B's transaction](https://sepolia.etherscan.io/tx/0x6bc8c49885a02a4e09ca36963bbdfe402fcef420a55befaa879a7cd39fb04a19); `02-b-funded-50-percent.png` |
| C contributes 0.00005 ETH | Total 0.0001 ETH, immediately Successful | PASS: receipt status=1; contribute(2) had the correct amount. The same receipt contained ContributionReceived and FundingSuccessful(projectId=2,totalRaised=100000000000000) | [C's transaction](https://sepolia.etherscan.io/tx/0x69e08785c3725d6eed03cc69d74a983dd4a365456e9a72628f8397b2fed69c0b); `03-funded-100-percent.png` |
| A submits evidence for the first milestone | First milestone enters In review, initial approval weight 0 | PASS: receipt status=1; A called submitEvidence(2,0,...). EvidenceSubmitted text and URL matched the page; submitted=true, approved=false, approvalWeight=0 | [Evidence submission transaction](https://sepolia.etherscan.io/tx/0xd70e3aff6fd5adc3f9d18c1b6a44945ddc98fc7dbe39ced86eb67cd7517fef04); `04-milestone-1-in-review.png` |
| B alone approves the first milestone | Exactly 50% weight, milestone not yet approved | PASS: receipt status=1; B called approveMilestone(2,0), with ApprovalCast weight 50000000000000 wei. approved=false; the page remained In review | [B's first approval transaction](https://sepolia.etherscan.io/tx/0x2891bf404058a864dc474237fb5f99a94e02ce75df972e32ff4b42b11646f4f3); `05-milestone-1-b-approved-50-percent.png` |
| A attempts withdrawal at 50% (read-only simulation) | Contract rejects withdrawal | PASS: at block 11966534, eth_call withdrawMilestone(2,0) with from=A reverted with Milestone not withdrawable. No transaction was sent and no gas was paid | readOnlyChecks in `milestone-1-b-approval-11966534.json` |
| B approves again (read-only simulation) | Contract rejects a duplicate vote by the same backer | PASS: at the same block, eth_call approveMilestone(2,0) with from=B reverted with Already approved. No transaction was sent and no gas was paid | readOnlyChecks in `milestone-1-b-approval-11966534.json` |
| C approves the first milestone | Combined weight reaches 100%, milestone approved | PASS: receipt status=1; C called approveMilestone(2,0), emitting ApprovalCast and MilestoneApproved(2,0). approvalWeight=100000000000000 wei, approved=true; no withdrawal yet | [C's first approval transaction](https://sepolia.etherscan.io/tx/0xc5f2356e29f4e3efa651d1f418d6ab52132d174005d6b7cf9005ce9fe8e72253); `06-milestone-1-approved-100-percent.png` |
| A withdraws the first milestone | Releases 0.00004 ETH, leaves 0.00006 ETH in escrow, advances to the second milestone | PASS: receipt status=1; A called withdrawMilestone(2,0), with FundsWithdrawn amount 40000000000000 wei. First milestone withdrawn=true; project currentMilestone=1, escrowBalance=60000000000000 wei | [First withdrawal transaction](https://sepolia.etherscan.io/tx/0x9cfb87e7bfd0b00af3f42dd8f80cdbecaff96c38200684ad7fbc7023a62e941f); `07-milestone-1-released.png` |
| A withdraws the first milestone again (read-only simulation) | Contract rejects repeated withdrawal | PASS: at block 11966558, eth_call withdrawMilestone(2,0) with from=A reverted with Wrong milestone because the current milestone had advanced to index 1. No transaction was sent and no gas was paid | readOnlyChecks in `milestone-1-withdrawal-11966558.json` |
| A submits evidence for the second milestone | Second milestone enters In review, approval weight 0 | PASS: receipt status=1; A called submitEvidence(2,1,...). EvidenceSubmitted text and URL matched the page. Second milestone submitted=true, approved=false, approvalWeight=0; escrow remained 0.00006 ETH | [Second evidence submission transaction](https://sepolia.etherscan.io/tx/0x0b101e99c5b2086f924422243404536a73bc041f14e3869daf30eaba9f0979fb); `08-milestone-2-in-review.png` |
| B alone approves the second milestone | Exactly 50% weight, milestone not yet approved | PASS: receipt status=1; this contract's ApprovalCast recorded projectId=2, milestone=1, backer=B, weight=50000000000000 wei. Second milestone approved=false; B had voted and C had not. This used a wrapped call; the top-level target was not this contract | [B's second approval transaction](https://sepolia.etherscan.io/tx/0x936b5a5f82a32d9eb1ca0d0ddc6e1d2eb5c1629793210530825cc85f72331517); `09-milestone-2-b-approved-50-percent.png` |
| C approves the second milestone | Combined weight reaches 100%, milestone approved | PASS: receipt status=1; C called approveMilestone(2,1), emitting ApprovalCast and MilestoneApproved(2,1). approvalWeight=100000000000000 wei, approved=true; the remaining 0.00006 ETH had not been withdrawn | [C's second approval transaction](https://sepolia.etherscan.io/tx/0x4a39eac1c34b8498d21abda8c8eb102fedb0f2f419a3d2d3432446d9740a28a8); `10-milestone-2-approved-100-percent.png` |
| A withdraws the second milestone | Releases the remaining 0.00006 ETH; Completed; project escrow becomes 0 | PASS: receipt status=1; A called withdrawMilestone(2,1), emitting FundsWithdrawn for 60000000000000 wei and ProjectCompleted(2). status=3, currentMilestone=2, escrowBalance=0; total released across both milestones equaled total raised | [Final withdrawal transaction](https://sepolia.etherscan.io/tx/0x96c60c2f0f292f642c966216b7f027127024da7f14d363b5e7523b4557f39569); `11-milestone-2-ready-to-withdraw.png`, `12-milestone-2-released.png` |
| Withdrawal after completion (read-only simulation) | Contract rejects another withdrawal | PASS: at block 11966612, eth_call withdrawMilestone(2,1) with from=A reverted with Project not successful. No transaction was sent and no gas was paid | readOnlyChecks in `milestone-2-withdrawal-11966612.json` |
| Completion-page recheck (manual screenshot) | Page shows Completed and project escrow 0 | PASS (manual screenshot check): the screenshot returned following the refresh instructions showed Completed, Held in escrow=0 ETH, and the message that both milestones had been released. It matched project #002's state at block 11966656; the refresh event was not captured automatically | `13-completed-overview.png`; subsequent state is in latestObservation.completedProject2 within project #003's contribution evidence |

Project #002 images are in `docs/evidence/2026-10-22-project-002/`; project #003 images are in `docs/evidence/2026-10-22-project-003/`. All are copies of original screenshots supplied by the tester.

## Snapshots at fixed blocks

### After creation (creation transaction retrieved retrospectively)

- Block: `11966404`, block time: 2026-10-22 09:55:00 (Beijing time).
- Block hash: `0x8b7daba16642bf10fd98a850d8806c0ca2fb2db73d286ab72d35f816c2fc813c`.
- Project `Funding`, `currentMilestone=0`, `totalRaised=escrowBalance=0`; target `0.0001 ETH`, deadline `1792749600`. Neither milestone had been submitted, approved, or withdrawn.
- Full transaction, receipt, events, and state at the fixed block: [raw JSON](evidence/2026-10-22-project-002/project-creation-11966404.json).

### After successful funding

- Block: `11966479`, block time: 2026-10-22 10:10:00 (Beijing time).
- Block hash: `0x1b0e7dc9e4967863341b602b3059677f8cb0f52eead01a92c9b189941d323726`.
- B's contribution transaction block: `11966421`; C's contribution transaction block: `11966443`.
- Status: `Successful` (enum value 1); current milestone index 0, the first milestone.
- `totalRaised = escrowBalance = 0.0001 ETH`.
- B and C each had a recorded contribution of `0.00005 ETH`, representing 50% of the total each.
- Neither milestone had evidence submitted, approval, or a withdrawal; approvalWeight and withdrawnAmount were both 0.
- Full transactions, receipts, events, and state at the fixed block: [raw JSON](evidence/2026-10-22-project-002/contributions-11966479.json).

### After evidence submission for the first milestone

- Block: `11966501` (the evidence submission transaction's block), block time: 2026-10-22 10:14:24 (Beijing time).
- Block hash: `0x39d2a66ab3fe32463209857a55dbc88e111dbf8d530e5f7065957b970f21b430`.
- First milestone: `submitted=true`, `approved=false`, `withdrawn=false`; approval weight and withdrawn amount were both 0. The page showed `In review`, `0%`.
- First milestone evidence URL: `https://github.com/misaka10111/dapp`.
- The project remained `Successful`, current milestone index 0; `totalRaised = escrowBalance = 0.0001 ETH`. The second milestone had not yet been submitted.
- Full transaction, receipt, events, and state at the fixed block: [raw JSON](evidence/2026-10-22-project-002/milestone-1-evidence-11966501.json).

### After B's first approval: the exact 50% boundary

- Block: `11966534` (B's first approval transaction's block), block time: 2026-10-22 10:21:00 (Beijing time).
- Block hash: `0xb5f6ad90e8902fdb72b7bb681f8897cca689bb12ad66ddeb09dd1b36dd0146f7`.
- First milestone: `approvalWeight = 0.00005 ETH`, 50% of `totalRaised = 0.0001 ETH`; `submitted=true`, `approved=false`, `withdrawn=false`, `withdrawnAmount=0`.
- B had `hasApproved=true`, C had `hasApproved=false`; their contribution weights remained `0.00005 ETH` each.
- The project remained `Successful`, current milestone index 0, with escrow still at `0.0001 ETH`.
- Read-only `eth_call` checks at the same block confirmed that A's withdrawal reverted with `Milestone not withdrawable` and B's duplicate approval reverted with `Already approved`. Both were simulated calls against real on-chain state; neither produced a transaction receipt or changed on-chain state.
- Full transaction, receipt, events, state at the fixed block, and both revert results: [raw JSON](evidence/2026-10-22-project-002/milestone-1-b-approval-11966534.json).

### After C's approval: first milestone approved

- Block: `11966546` (C's first approval transaction's block), block time: 2026-10-22 10:23:24 (Beijing time).
- Block hash: `0x13e0d65e832210c1b993abde23f1b2e10dc28a69b812e7bda8159588d6428fe2`.
- Compared with the preceding block `11966545`, the first milestone changed from weight `0.00005 ETH`, `approved=false` to weight `0.0001 ETH`, `approved=true`. The page showed `100%` and `Approved`.
- Both B and C had `hasApproved` set to true; the first milestone still had `withdrawn=false`, `withdrawnAmount=0`.
- The project remained `Successful`, current milestone index 0; escrow remained `0.0001 ETH`. Approval itself did not release funds. The second milestone had not been submitted, approved, or withdrawn.
- Full transaction, receipt, events, and states at the transaction block and the preceding block: [raw JSON](evidence/2026-10-22-project-002/milestone-1-c-approval-11966546.json).

### After the first withdrawal: 40% released, second milestone opened

- Block: `11966558` (the first withdrawal transaction's block), block time: 2026-10-22 10:25:48 (Beijing time).
- Block hash: `0x0c581d6319f59797cc21b51442fb407881424b3d2a5a91ed71d93959867a2b99`.
- Compared with the preceding block `11966557`, escrow decreased from `0.0001 ETH` to `0.00006 ETH`. The decrease matched the FundsWithdrawn event and the first milestone's `withdrawnAmount = 0.00004 ETH`.
- The first milestone had `withdrawn=true`; the page showed `Released: 0.00004 ETH`. The project had `currentMilestone=1`, advancing to the second milestone, and remained `Successful`.
- `totalRaised` remained `0.0001 ETH`. The second milestone had `submitted=false`, `approved=false`, `withdrawn=false`, `approvalWeight=0`. B and C both had `hasApproved` set to false for the second milestone and needed to vote separately again.
- A read-only simulation at the same block of A withdrawing the first milestone again reverted with `Wrong milestone`. No second withdrawal transaction was sent.
- Full transaction, receipt, events, states at the transaction block and the preceding block, and the repeated-withdrawal revert result: [raw JSON](evidence/2026-10-22-project-002/milestone-1-withdrawal-11966558.json).

### After evidence submission for the second milestone

- Block: `11966571` (the second evidence submission transaction's block), block time: 2026-10-22 10:28:24 (Beijing time).
- Block hash: `0x3e7050462d78a71d2221591e543a8a84bed800094b68c265c8228789010f9930`.
- Second milestone: `submitted=true`, `approved=false`, `withdrawn=false`, `approvalWeight=0`, `withdrawnAmount=0`. The page showed `In review`, `0%`, with a milestone budget of `0.00006 ETH`.
- B and C both had `hasApproved` set to false for the second milestone; first-milestone votes were not automatically carried over.
- The first milestone remained released, with a withdrawn amount of `0.00004 ETH`. The project had `currentMilestone=1`, status `Successful`, `totalRaised=0.0001 ETH`, `escrowBalance=0.00006 ETH`.
- Full transaction, receipt, events, and state at the fixed block: [raw JSON](evidence/2026-10-22-project-002/milestone-2-evidence-11966571.json).

### After B's second approval: 50% still based on original contributions

- Block: `11966583` (B's second approval transaction's block), block time: 2026-10-22 10:30:48 (Beijing time).
- Block hash: `0x11bb47d1551926beae309aece12993d9ed6ff0a7d307d3cdf3e77ec8faee7f23`.
- Second milestone: `approvalWeight=0.00005 ETH`, `approved=false`, `withdrawn=false`; B had `hasApproved=true`, C had `hasApproved=false`. The page showed `50%`, `In review`.
- The denominator remained `totalRaised=0.0001 ETH`; the remaining escrow of `0.00006 ETH` did not change voting weight. The first milestone's withdrawn amount remained `0.00004 ETH`.
- B sent this transaction with value=0 to top-level target `0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3`, not the MilestoneFund contract. This contract's ApprovalCast event and state at the fixed block confirmed that the approval took effect; the transaction must not be described as a direct top-level call to approveMilestone.
- The top-level calldata matched the selector and ABI encoding of `redeemDelegations(bytes[],bytes32[],bytes[])`. The decoded executionCallData contained one call with the MilestoneFund target address, value=0, and `approveMilestone(2,1)`. This was calldata decoding verification; no transaction trace was performed.
- Full transaction, receipt, events, and state at the fixed block: [raw JSON](evidence/2026-10-22-project-002/milestone-2-b-approval-11966583.json).

### After C's approval: second milestone approved

- Block: `11966586` (C's second approval transaction's block), block time: 2026-10-22 10:31:24 (Beijing time).
- Block hash: `0xc100ca08082e61a4c9f774bf6923ddc17446ed8db41784ab7cbbf74e1b6c2385`.
- Compared with the preceding block `11966585`, the second milestone changed from weight `0.00005 ETH`, `approved=false` to weight `0.0001 ETH`, `approved=true`. The page showed `100%`, `Approved`.
- Both B and C had `hasApproved` set to true for the second milestone. The second milestone had `withdrawn=false`, `withdrawnAmount=0`; the first milestone's withdrawn amount remained `0.00004 ETH`.
- The project remained `Successful`, with `currentMilestone=1`, `totalRaised=0.0001 ETH`, `escrowBalance=0.00006 ETH`. The final withdrawal had not occurred, and the project had not entered Completed.
- Full transaction, receipt, events, and states at the transaction block and the preceding block: [raw JSON](evidence/2026-10-22-project-002/milestone-2-c-approval-11966586.json).

### After the second withdrawal: project completed

- Block: `11966612` (the final withdrawal transaction's block), block time: 2026-10-22 10:36:48 (Beijing time).
- Block hash: `0x995e5144983aaf9ff686a9ad50a48fb3793ba96aa8694702410074af381c8dc6`.
- Compared with the preceding block `11966611`, status changed from `Successful` to `Completed` (enum value 3), `currentMilestone` advanced from 1 to 2, and project escrow fell from `0.00006 ETH` to 0.
- First milestone `withdrawnAmount=0.00004 ETH`, second milestone `withdrawnAmount=0.00006 ETH`, with `withdrawn=true` for both. Total released was `0.0001 ETH`, equal to `totalRaised`.
- The receipt contained both `FundsWithdrawn(2,1,60000000000000)` and `ProjectCompleted(2)`. The second milestone showed `Released: 0.00006 ETH` on the page.
- Balance observations at adjacent block ends: A's balance change plus the gas paid for this transaction was `60000000000000 wei`, matching the withdrawal; the entire contract balance decreased by the same amount. The contract's total balance remained `0.0005 ETH`, while this project's escrow was 0; these are distinct balances. Other transactions can affect comparisons across adjacent blocks, but the observed amounts matched in this case.
- A read-only simulation at the same block of A withdrawing again reverted with `Project not successful`; no transaction was sent.
- The tester initially supplied screenshots of the withdrawal button before execution and the milestone after withdrawal. A later screenshot, `13-completed-overview.png`, showed Completed and 0 escrow at the top of the project page, passing the completion-page recheck. The refresh action was not independently captured by automation.
- Full transaction, receipt, events, states at the transaction block and the preceding block, balance observations, and the repeated-withdrawal revert result: [raw JSON](evidence/2026-10-22-project-002/milestone-2-withdrawal-11966612.json).

## Independent refund project #003

- Project name: `HQC-E2E-Refund-1022`; creator A; target `0.0002 ETH`; deadline `1792638000`, or 2026-10-22 11:00:00 (Beijing time).
- Milestone goals: `Deliver the prototype.` and `Deliver the final demo.`.

| Operation | Expected result | Verification result | Transaction / evidence |
| --- | --- | --- | --- |
| A creates the refund test project | Funding, target 0.0002 ETH, initial raised amount and escrow 0 | PASS: receipt status=1; ProjectCreated recorded project 3, A, target, and deadline. State at the creation block matched the arguments. The top-level call was wrapped; decoded inner createProject arguments matched | [Creation transaction](https://sepolia.etherscan.io/tx/0x91a97815ddb95f1568707dd3bc7c8537b85ba5770dd59058bb6ca19c898e3ca1); `project-creation-11966641.json` |
| B contributes 0.00003 ETH | 15% funded, remains Funding | PASS: receipt status=1; B directly called contribute(3), value=30000000000000 wei. ContributionReceived matched, with no FundingSuccessful event. Contribution, total raised, and escrow were all 0.00003 ETH; refunded=false | [B's contribution transaction](https://sepolia.etherscan.io/tx/0x0aab5ef7f63041f863e6b942ce80f286eda016d46fba5a1dc42721c853718fb4); `01-funded-15-percent.png`, `contribution-11966646.json` |
| Finalization before the deadline (read-only simulation) | Contract rejects early finalization | PASS: at block 11966646, eth_call finalizeFunding(3) with from=B reverted with Deadline not reached. No transaction was sent and no gas was paid | readOnlyChecks in the contribution evidence |
| Refund before the project has failed (read-only simulation) | Contract rejects early refund | PASS: at the same block, eth_call claimRefund(3) with from=B reverted with Project not failed. No transaction was sent and no gas was paid | readOnlyChecks in the contribution evidence |
| B finalizes after the deadline | Funding changes to Failed; refunds open, escrow initially unchanged | PASS: receipt status=1; B directly called finalizeFunding(3), emitting FundingFailed(3). The receipt block's timestamp was after the deadline; status changed from 0 to 2, escrow remained 0.00003 ETH, and B had not yet claimed a refund | [Finalization transaction](https://sepolia.etherscan.io/tx/0x067497600a670f6660090ee4b23334beb8ca3e5a3d10dbdc2e6332244bb3af83); `02-awaiting-finalization.png`, `03-failed-refund-available.png` |
| B claims a refund | Original contribution of 0.00003 ETH returned to B, project escrow becomes 0 | PASS: receipt status=1; the decoded inner call of the wrapped transaction was claimRefund(3). RefundClaimed recorded B and 30000000000000 wei; refunded=true, escrowBalance=0, with historical totalRaised and contribution retained | [Refund transaction](https://sepolia.etherscan.io/tx/0xcb774a9adad688000b85c79246ce497e01321dbdb926632ff7892f5109bb3842); `04-refunded-escrow-zero.png` |
| B claims a refund again (read-only simulation) | Contract rejects duplicate refund | PASS: at block 11966731, eth_call claimRefund(3) with from=B reverted with No refund available. No transaction was sent and no gas was paid | readOnlyChecks in `claim-refund-11966731.json` |

### Creation and contribution snapshots

- Creation block `11966641`, 2026-10-22 10:42:48 (Beijing time); block hash `0x101a82359cbf7c243c5e0ffe8dbb5b51f867c80f389af41b7f14120edf4ef0af`. Status Funding, initial total raised and escrow both 0, neither milestone submitted.
- B's contribution block `11966646`, 2026-10-22 10:43:48 (Beijing time); block hash `0xe2703aaa42a679df6beb114df965ea0dfbea2e8671851548dfe203a880be2a5a`.
- After contribution: `totalRaised=escrowBalance=0.00003 ETH`, `target=0.0002 ETH`, `status=Funding`, `currentMilestone=0`; B's recorded contribution was 0.00003 ETH, `refunded=false`.
- Subsequent verification block `11966656`, 2026-10-22 10:45:48 (Beijing time); block hash `0x65ababefb984ee4656d82051dc36d6493348e9afb30892c2275fe8f8406940d2`. The deadline was still 852 seconds away; neither finalization nor refund had occurred. At the same block, project #002 remained Completed with 0 escrow.
- Evidence: [creation JSON](evidence/2026-10-22-project-003/project-creation-11966641.json), [contribution, rejection checks, and subsequent state JSON](evidence/2026-10-22-project-003/contribution-11966646.json).

### After finalization at expiry: refunds opened

- Block: `11966728`, 2026-10-22 11:00:24 (Beijing time), 24 seconds after the deadline.
- Block hash: `0x73a74e96e116828b037afae3ed47f4346898662f022fbc76780e9107810c433f`.
- Compared with the preceding block `11966727`, the project changed from `Funding` (0) to `Failed` (2); `target=0.0002 ETH`, `totalRaised=0.00003 ETH`, and `escrowBalance=0.00003 ETH` were unchanged.
- B had `contribution=0.00003 ETH`, `refunded=false`. Finalization only opened refunds; it did not return funds automatically. The page showed `Failed` and `Claim refund · 0.00003 ETH`.
- Evidence: [finalization JSON](evidence/2026-10-22-project-003/finalize-funding-11966728.json).

### After claiming the refund: original amount returned, escrow zero

- Block: `11966731`, 2026-10-22 11:01:00 (Beijing time).
- Block hash: `0x82d86f311854bb1c41c83c6ddbde189eec30fb9400bc18f655ea1fbc63b34443`.
- Compared with the preceding block `11966730`, project escrow fell from `0.00003 ETH` to 0; B's `refunded` changed from false to true. Status remained `Failed`, and historical `totalRaised` and B's `contribution` remained `0.00003 ETH`.
- The contract event `RefundClaimed(3,B,30000000000000)` confirmed the refund amount. B's balance change between adjacent block ends plus the gas paid for this transaction was `30000000000000 wei`; the contract balance decreased by the same amount. Other transactions in those blocks could affect the balance difference, but the observed amounts matched in this case.
- The top-level call used the `redeemDelegations(bytes[],bytes32[],bytes[])` wrapper. Decoding with the matching ABI produced one inner call targeting MilestoneFund, with value=0 and `claimRefund(3)`. No transaction trace was requested, and no wallet configuration was inferred.
- A read-only simulation at the fixed block of B calling `claimRefund(3)` again reverted with `No refund available`, confirming duplicate-refund protection.
- Neither milestone had been submitted, approved, or withdrawn. The screenshot showed `Your original contribution has been refunded.` and Held in escrow at 0.
- Evidence: [refund, balance observations, and duplicate-refund rejection JSON](evidence/2026-10-22-project-003/claim-refund-11966731.json).

## Historical automated tests and deployment verification

| Test | Expected result | Status |
| --- | --- | --- |
| Continuous-state automated tests | Assert balances, weights, and milestone changes at each step | PASS: 5 scenarios under each of two compiler configurations, 10/10 in total; covering complete payouts, excess funding and rounding, project isolation and refunds, deadline boundaries, and failed-payment rollback and retry. See the [actual run output](evidence/automated/continuous-state.tap) |
| Deployment reproduction | Record the full compiler version, optimization settings, and EVM version, then compare against the deployment | PASS: `0.8.34+commit.80d5c536.Emscripten.clang`, optimization disabled, Osaka. The full 15,664-byte runtime matched block 11966764; recompiling the saved input offline also matched. See the [verification result](evidence/deployment/verification-11966764.json) |
| Frontend build | Production build still works after adding the test tools | PASS: `npm run build` exited with code 0 |

Tests for both compiler configurations ran in a local Osaka EVM. These are business-logic tests of two compiled outputs, not coverage of two execution hardfork environments. See the [automated testing guide](automated-testing.md) for commands and assertion scope.

## Operational observations and limitations

- A `could not coalesce error` message appeared during creation; the successfully created project #002 appeared on the page afterward. The successful creation transaction was subsequently retrieved, but the underlying details of the error were not obtained. Its cause, and whether it belonged to the same attempt as the successful creation, remain unknown.
- After switching to B, MetaMask initially indicated that B was not connected to localhost:5173. Once the connection was authorized, the page switched to B and the contribution succeeded.
- A hidden or disabled button only verifies the UI permission state. Proving that a direct contract call is rejected requires a separate call result or receipt.
- The two manual business workflows, successful payout and failed-funding refund, passed, as did the local continuous-state tests, deployment runtime reproduction, and frontend build described above. The completion page was checked through a manual screenshot; no automated browser-refresh test was performed. These results do not establish coverage of every possible input or constitute a security audit.

## Current-version acceptance progress (2026-11-07)

The #002 successful workflow above is complete, with evidence for 13 additional transactions and 13 screenshots. Other scenarios are marked separately below; a successful workflow does not mean that all acceptance testing has passed. Use new projects for subsequent tests and retain this run's evidence and the historical evidence. The current contract is Sepolia `0x5A5AeaE5553Feb5c5b27FEe5ec8b24E3ED2B964F`; both approval and submission windows read as 600 seconds in this run.

The local automated run on 2026-11-07 passed **124/124** tests (0 failures, 0 skipped), and the production build passed. See the [TAP record for this run](evidence/automated/regression-2026-11-07.tap) and [test coverage](automated-testing.md). Automated results and this manual acceptance evidence are recorded separately.

| Scenario | Operation and acceptance criteria | Status |
| --- | --- | --- |
| Capped contributions | Submit a contribution exceeding the remaining target. Check that `ContributionReceived` records only the accepted amount, `ExcessRefunded` records the excess, and contributions close at the target. Amounts must agree with the page and account balance changes after accounting for gas. | Not run |
| Separate release and claim | For each milestone, call `releaseMilestone` before `claimPayout`. Confirm that escrow decreases, claimable payout increases, and claims remain possible after Completed. | PASS: both milestones passed in this run, with the default recipient A. Alternative recipients were not tested |
| Evidence submission timeout | After successful funding, do not submit evidence; wait for the on-chain deadline. Late submission must be rejected, backers must be able to claim the quoted refund, and the first successful refund must change status to Expired. | Not run |
| Approval timeout | Submit evidence without reaching strictly more than 50% approval weight. After expiry, new approvals must stop and backers must be able to claim refunds. A milestone approved before its deadline must remain releasable and must not be refundable. | Not run |
| Fixed refund pool after a partial release | Two backers contribute; release 40% for the first milestone and let the second milestone expire. Refund the remaining escrow in proportion to original contributions. After the first refund, the second backer's claimable amount must not shrink with the remaining balance; duplicate refunds must be rejected. Record any rounding remainder. | Not run |
| Browser and wallet regression | Switch between creator and backer accounts and check buttons and personal state. Check signature rejection, switching to the wrong network, and state restoration after refresh separately. | Partially passed: A/B/C switching, visible role-specific buttons, and refresh after completing the successful workflow were checked. Signature rejection, wrong networks, and refresh after a refund were not tested |

After completing each item, save its transaction hashes, receipts, states at fixed blocks, and corresponding screenshots, and mark it passed, failed, or not tested. Record on-chain permission rejections separately from UI button visibility. Passing pure-function, simulated-wallet, or local contract tests does not replace this manual evidence.
