# Automated Testing

The contract tests start from a fresh deployment and build state through locally signed transactions, checking that later operations correctly use the results of earlier steps. They complement manual Sepolia testing and the original `eth_call + state override` simulations.

## Run the tests

From the project root, run:

```powershell
npm ci
npm test
npm run build
```

If dependencies have not changed, run `npm test` directly. The contract test entry point, `tests/milestone-fund.test.mjs`, uses Node's built-in test runner and EthereumJS VM, creating clean in-memory state for each test. Temporary accounts are generated randomly and exist only within the process. The tests do not read wallet keys, connect to RPC, consume Sepolia ETH or modify the historical acceptance-test projects #002/#003. `npm test` also runs offline regression tests for frontend utilities, simulated wallets and the deployment verifier.

## Compilation and execution settings

| Profile | Compiler | Optimizer | Compilation target | Purpose |
| --- | --- | --- | --- | --- |
| repository-default | solc 0.8.24 | Enabled, 200 runs | Paris | Compiler settings used by the repository's current compilation script and the new Sepolia instance; deployment consistency is verified separately |
| sepolia-reproduction | solc 0.8.34 | Disabled, 200 runs | Osaka | Retains the compiler settings of the old 2026-10-22 deployment, with source unit MilestoneFund.sol and LF line endings; these settings now test the current source and do not reproduce the new deployment |

Both compilation profiles execute on **Osaka VM / local chain ID 31337**; this does not claim coverage of two different runtime hard forks. Dependencies are pinned to `@ethereumjs/* 10.1.3`, with the Solidity compilers provided by `solc` and `solc-deployed`. The compiled ABI is compared with the committed frontend ABI to detect an outdated interface.

## Scenarios and assertions

The current contract suite contains 15 scenarios that carry state across successive transactions. Each runs under both compilation profiles, giving 30 tests:

| Scenario | Key assertions |
| --- | --- |
| Successful two-stage flow | B contributes a cumulative 50 and C contributes 50; exactly 50% does not approve a milestone; payouts are 40/60. Second-stage approval weight starts at 0 and uses total original contributions as the denominator. The project reaches Completed with zero escrow. Permission checks, duplicate submissions/votes/withdrawals and attempts to skip stages are interleaved with the successful flow. |
| Contribution cap, excess refunds and small amounts | For a target of 100 and two contributions of 51, only 100 is accepted, the excess 2 is returned in the transaction, and payouts are 40/60. A target of 1 produces payouts of 0/1. Reaching the target closes funding, with no remainder lost. |
| Fund isolation between projects | A successful project first releases 40; two backers in a failed project each reclaim their cumulative contribution of 25; the successful project then releases 60. At every intermediate step, the contract balance equals the two projects' combined escrow, and records and refund flags remain isolated by project. |
| Exact funding deadline | One second before the deadline, contributions are allowed and finalization is rejected. At the deadline, contributions are rejected and an unrelated account can finalize. Time passing alone does not change the stored status to Failed. |
| Rollback when a recipient rejects ETH | A test receiver rejects ETH, so withdrawals and refunds must revert their accounting changes. After receipt is enabled, retrying succeeds with correct amounts, flags and milestone state. |
| Separate release and payout claim | Any account can release an approved milestone, crediting the creator's claimable balance without transferring ETH. Only the creator can claim to a chosen recipient. Claims remain possible after both stages complete; duplicate releases, duplicate claims and invalid recipients are rejected. |
| Rejecting creator and expiry refunds | A creator that rejects ETH does not block release. After the second stage expires and the remaining escrow is refunded, the creator can still claim the first stage's released funds to another address. |
| Mixed payout paths | Crediting the first-stage payout and directly withdrawing the second-stage payout leaves the first-stage balance available to claim. |
| Approval timeout and refund order | Refunds are unavailable before expiry, and new approvals are rejected after expiry. Both possible claim orders for two backers produce the same refund amounts; duplicate refunds are rejected. |
| Second-stage submission timeout | Releasing the first stage starts a new submission window. Refunds use the fixed remaining pool, with checks at the exact deadline and for rounding remainders. |
| Retry after a failed expiry refund | A failed ETH transfer rolls back the refund state and accounting. The refund can be retried after the recipient accepts ETH. |
| Protection for approved milestones | An approved milestone cannot be refunded even after its approval deadline. |
| Timeout without evidence submission | If the creator fails to submit evidence after funding succeeds, late submission is rejected. Backers can claim refunds, changing the project status to Expired. |
| Zero first-stage payout | A zero first-stage payout skips the ETH transfer and advances the project even if the creator rejects ETH. A nonzero second-stage withdrawal still requires a successful transfer. |
| Constructor arguments | Constructor arguments determine the approval and submission timeouts; refunds become claimable when the configured short window expires. |

For failed transactions, the tests check the failed receipt, specific revert reason, unchanged contract storage root and balance, and discarded event logs. Externally owned accounts still incur nonce changes and gas costs, so the tests do not compare the entire chain's state root. Successful withdrawals and refunds are checked against event amounts, project balances and recipient balances, accounting for the transaction's actual gas fee.

`tests/fixtures/PaymentReceiver.sol` is used only to test rejected payments; it is not a production contract. Test time is controlled through local block headers, so the tests do not wait for real deadlines.

`tests/utils.test.mjs` covers pure functions for amounts, percentages, budgets, URLs, filtering, deadlines and refund display states. `tests/wallet.test.mjs` covers configuration, wallet discovery, network checks, contract reads, call arguments and error mapping. These tests use simulated objects and do not constitute acceptance testing of real MetaMask interactions or React components. The offline regressions in `tests/deployment-verification.test.mjs` check bytecode comparisons and match classifications without accessing Sepolia.

## Results and scope

On 2026-11-07, `npm test -- --test-reporter=tap` ran against baseline commit `4a77279` plus the changes on `feature/verify-deployment-evidence`: **124/124 passed, 0 failed, 0 skipped** (21 suites; 30 contract tests, 81 utility and simulated-wallet tests, and 13 deployment-verification regressions). The complete output is in the [current TAP record](evidence/automated/regression-2026-11-07.tap). `npm run build -- --base=/dapp/` also passed.

Historical baseline: on 2026-10-22, **10/10 passed, 0 failed**. The original [TAP record](evidence/automated/continuous-state.tap) is unchanged. It applies to the old contract and test set and is not evidence that the current 30 contract tests or the added frontend and deployment-verification regressions passed.

These local tests do not automatically cover page layout, real MetaMask confirmations, RPC availability or browser refreshes. The [manual test record](e2e-test-record.md) contains the new Sepolia success flow's 13 transactions and 13 screenshots, along with historical evidence and the remaining acceptance checks. See [Deployment Verification](deployment-verification.md) for the source match level at a specified address and fixed block. Passing local tests does not replace verification of deployment consistency.

API reference: [EthereumJS VM documentation](https://github.com/ethereumjs/ethereumjs-monorepo/tree/master/packages/vm).
