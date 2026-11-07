# MilestoneFund

MilestoneFund is a COMP7610 crowdfunding DApp on Ethereum Sepolia. Backers fund a project in escrow and vote on its two milestones using their accepted contributions as voting weight. Once a milestone is approved, it can be released. The first release allocates 40% of the amount raised, rounded down to a whole wei, and the second releases the remainder.

[Open the live demo](https://misaka10111.github.io/dapp/) · [View the Sepolia contract](https://eth-sepolia.blockscout.com/address/0x5A5AeaE5553Feb5c5b27FEe5ec8b24E3ED2B964F) · [View the deployment transaction](https://eth-sepolia.blockscout.com/tx/0xfd1c8e65e0115251d0904588ede9c19ea28cb75a466931ef34767bf5f7e7133a)

Explore is available without a wallet. Connect MetaMask on **Ethereum Sepolia** (chain ID `11155111`) to create a project, contribute, approve a milestone or claim funds. All transactions use Sepolia test ETH.

## Run locally

Use Node.js **22.12 or later**, npm and a desktop browser. GitHub Actions uses Node.js 22. Install MetaMask and fund your demo accounts with Sepolia test ETH if you plan to send transactions.

Clone the repository and install the locked dependencies.

```bash
git clone --branch main https://github.com/misaka10111/dapp.git
cd dapp
npm ci
```

Create `.env.local` in the repository root using the current demo configuration.

```dotenv
VITE_CONTRACT_ADDRESS=0x5A5AeaE5553Feb5c5b27FEe5ec8b24E3ED2B964F
VITE_SEPOLIA_RPC_URL=https://ethereum-sepolia-rpc.publicnode.com
```

The RPC URL enables read-only browsing. If it is blank, the frontend reads through MetaMask on Sepolia. Vite exposes `VITE_*` variables to the browser, so use public values in these fields. Git ignores `.env.local`.

```bash
npm run dev
```

Open the URL printed by Vite, normally `http://localhost:5173`. Check that Explore shows the contract address above. Restart Vite after editing `.env.local`.

## Demonstrate the workflow

Use three MetaMask accounts for the walkthrough. **A** creates the project and claims payouts. **B** and **C** contribute and vote. Each account needs test ETH for gas, and the backers also need the amounts below. Wait for each transaction to confirm and check the connected address after switching accounts.

| Step | Action | Expected result |
| --- | --- | --- |
| 1 | A creates a project with a **0.0001 ETH** target, a future funding deadline and two milestone goals. | The project appears as **Funding**. |
| 2 | B and C each contribute **0.00005 ETH**. | The project reaches its target and becomes **Successful**. |
| 3 | A submits a milestone 1 summary and an HTTP or HTTPS evidence link. B approves, then C approves. | B's vote represents exactly **50%**, so the milestone remains in review. C's vote takes the total above 50% and the milestone becomes **Approved**. |
| 4 | A clicks **Release to creator balance** for milestone 1. | A can claim **0.00004 ETH**. The remaining **0.00006 ETH** stays in escrow and milestone 2 opens. |
| 5 | A clicks **Withdraw payout**, keeping A as the recipient. | A claims **0.00004 ETH** in a separate transaction; the claimable balance becomes zero. |
| 6 | A submits milestone 2 evidence. B approves, then C approves. | The approval weight rises from **50%** to **100%** and milestone 2 becomes **Approved**. |
| 7 | A clicks **Release to creator balance** for milestone 2. | The project becomes **Completed**, escrow is zero and **0.00006 ETH** remains available to claim. |
| 8 | A clicks **Withdraw payout**, then refreshes the page. | A claims the remaining **0.00006 ETH**. The page retains **Completed**, both milestones are **Released**, and no payout remains available. |

This separate release-and-claim workflow was manually completed on **2026-11-07** for **Test Project 03 (#002)**. The [acceptance record](docs/e2e-test-record.md) contains all **13 confirmed transactions**, state snapshots and screenshots. **Completed** means both allocations have been released from escrow; the creator can still have a payout to claim, as step 7 demonstrates.

A can alternatively choose **Release & withdraw** to release and collect an approved milestone in one transaction. **Withdraw payout** also supports a different recipient. Contributions are capped at the target, with any excess returned in the same transaction. These alternatives were not exercised in the recorded November 7 browser walkthrough; see the acceptance record for the remaining manual checks.

The website shows release controls to the creator, whose account pays gas for that transaction. The on-chain `releaseMilestone` function allows any account to release an eligible stage. `withdrawMilestone` and `claimPayout` require the creator.

### Time windows and refunds

| Window | Opens when | Duration on the live contract |
| --- | --- | --- |
| Milestone 1 submission | Accepted funding reaches the target | 10 minutes |
| Milestone 2 submission | Milestone 1 is released | 10 minutes |
| Approval for either milestone | Its evidence is submitted | 10 minutes |

The contract uses the block timestamp. Evidence and approvals must be included in a block before their deadline. A milestone approved in time can be released after its approval window ends.

- **Funding target missed.** After the funding deadline, any account can click **Finalize funding**. Backers can then use **Claim refund** to recover their full accepted contributions.
- **Funded project times out.** If the current milestone misses its submission or approval deadline, backers can use **Claim refund** once the page confirms expiry on-chain. The first claim fixes the remaining escrow pool and marks the project **Expired**. Each backer receives their share of that pool in proportion to their accepted contributions, rounded down to a whole wei. Amounts already released to the creator's balance are outside the pool.

The recorded demo also shows **Test Project 02 (#001)** as completed and **Test Project 01 (#000)** as expired with refunds open. Those project cards alone do not establish that refunds were claimed. Use the transaction links in the acceptance record to inspect the verified **#002** workflow separately from gas fees.

## Architecture and repository layout

React and Vite provide the static frontend. Ethers.js reads the contract through the configured RPC and uses MetaMask for signed transactions. The contract stores projects, voting weights and escrow balances on Sepolia. It records evidence descriptions and URLs, while backers review the linked work themselves.

| Path | Responsibility |
| --- | --- |
| [`contracts/MilestoneFund.sol`](contracts/MilestoneFund.sol) | Funding, milestone approval, payout and refund rules. |
| [`src/App.jsx`](src/App.jsx) and [`src/styles.css`](src/styles.css) | Project views, wallet actions and interface styling. |
| [`src/contract.js`](src/contract.js) and [`src/abi/MilestoneFund.json`](src/abi/MilestoneFund.json) | Contract configuration, providers and the interface used by the frontend. |
| [`tests/`](tests/) | Contract scenarios and frontend unit tests. |
| [`.github/workflows/ci.yml`](.github/workflows/ci.yml) | Pull request checks and GitHub Pages deployment from `main`. |

## Build and verify

```bash
npm run format:check
npm test
npm run build
```

Run these commands after `npm ci`. The recorded regression run passed **124 tests**: 30 contract tests, 81 frontend utility/wallet tests and 13 deployment-verifier tests. Tests use a local EVM, simulated wallet calls and saved deployment fixtures. The build writes the production frontend to `dist/`. Run `npm run preview` to serve that build locally.

GitHub Actions installs dependencies, checks formatting, runs tests and builds the app. Successful runs on `main` publish the build to GitHub Pages with the `/dapp/` base path. For a separate Pages setup, choose **GitHub Actions** as the publishing source and configure the two repository variables shown in [Run locally](#run-locally).

See the [automated testing notes](docs/automated-testing.md), [manual acceptance record](docs/e2e-test-record.md) and [deployment verification](docs/deployment-verification.md) for evidence and scope. The current deployment matches the local executable after substitutions at compiler-declared immutable locations; its metadata does **not** match. This is reported as `immutable-substitution-match`, not a full runtime match. To repeat the read-only check and save a new evidence bundle, run `npm run verify:deployment`.

The [October 21 simulation report](TEST-REPORT.md) and older deployment records are historical evidence for a different contract instance. Raw evidence, including original on-chain text and user quotations, is preserved verbatim; the submission documentation is in English.

## Deploy a separate Sepolia contract

Use this procedure to create an independent instance for your own campaigns.

1. Open [Remix](https://remix.ethereum.org/) and add [`MilestoneFund.sol`](contracts/MilestoneFund.sol).
2. Match the repository compiler settings. Select Solidity **0.8.24**, enable optimisation with **200 runs** and choose **Paris** as the EVM target.
3. In **Deploy & Run**, select the browser wallet environment and connect MetaMask to **Ethereum Sepolia**. Select `MilestoneFund` and set the deployment value to **0**. Supply `approvalTimeout` and `submissionTimeout`, in that order, in seconds. Use `600` for each to reproduce the demo windows.
4. Confirm deployment and set `VITE_CONTRACT_ADDRESS` in `.env.local` to the new contract address. Restart the frontend. If you change the contract interface, run `npm run compile:contract` to regenerate the frontend ABI.

See the [Remix deployment guide](https://remix-ide.readthedocs.io/en/latest/run.html) for the wallet connection and deployment controls.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Explore shows a configuration error | Check `.env.local`, the Sepolia contract address and the RPC URL, then restart Vite. |
| Transaction buttons are unavailable | Unlock MetaMask, select Sepolia and check that the connected account has the required role. |
| A transaction fails near a deadline | Check the latest on-chain state and the submission or approval deadline shown for that milestone. |
| The view looks stale after switching accounts | Confirm the address shown in the header and use **Refresh** in Explore. |

## Course submission

The team submits one package for COMP7610. Use the live site and the [local setup](#run-locally) to reproduce the demonstration from this repository.

| Deliverable | Submission requirement |
| --- | --- |
| Demo video | An English video of up to **15 minutes** in high-resolution **MP4** or **MOV**. Explain the idea, show the core features and include a live demonstration. Include presentation slides if prepared. |
| Project report | A **PDF** covering the background, idea, design, implementation and contribution distribution. |
| Code repository | The complete runnable source and a detailed README with setup and demonstration instructions. |

Each student submits the peer assignment separately.
