# MilestoneFund Historical Test Report

> This report records the historical simulations and UI work from **2026-10-21**, with follow-up notes from 2026-10-22. Its 76 recorded assertions are not the current 124-test regression suite or the new Sepolia acceptance run. Later records cover [manual end-to-end testing](docs/e2e-test-record.md), [local stateful tests](docs/automated-testing.md), and [deployment bytecode verification](docs/deployment-verification.md). The old script imports the current ABI while assuming an older contract layout and live state, so it is not a current acceptance tool. Run `npm test` for current regression testing. Historical results below have not been rerun for this translation.

- **Subject at the time**: `misaka10111/dapp`, branch `milestonefunddemo` (recorded as commit `HEAD`; no immutable commit hash was recorded)
- **Historical contract**: Sepolia `0x9b824CA674432B390E30A5164a76c04EeAa8f686`
- **Test date**: 2026-10-21
- **Scope**: contract calls for creation, contributions, approvals, withdrawals, refunds, permissions, and boundaries; the frontend read-only flow, build, and handover configuration

---

## 1. Historical conclusions

| Item | Recorded result |
| --- | --- |
| Simulation and helper checks (76 assertions) | **All recorded as passing**: 45 contract-call assertions and 31 frontend helper assertions. These included approval, withdrawal, refund, fabricated overfunded-state, and rounding cases. See Section 4 for the limits of these checks, including the original 50% boundary claim. |
| Frontend read-only flow (list, details, status badges, amounts) | Displayed chain data matched the contract reads. |
| `npm ci` / `npm run build` | Passed (484 kB JS, 165 kB gzip). |
| Preliminary contract interface check | All 13 ABI function selectors were present in the deployed bytecode. This alone did not establish a complete source-to-deployment match; see the later deployment verification record. |
| **Blocking issue** | **One: the contract address shared in the group had an invalid checksum, making the page unusable when pasted directly.** Fixed as described in Section 2. |
| Missing handover files | `.env.example`, `.gitignore`, and `vite.config.js` were absent, so the README setup steps could not be followed. The files were added. |

The 76 historical assertions and frontend read-only checks were reported as passing, and the address/configuration issues were addressed. These simulations did not replace stateful transaction acceptance, wallet interaction tests, or complete deployment verification.

---

## 2. Blocking issue: invalid contract address checksum

The address shared in the group differed from the correct checksum form:

```text
0x9b824CA674432B390E30A5164a76c04eEaa8f686   <- isAddress() = false
0x9b824CA674432B390E30A5164a76c04EeAa8f686   <- correct (note the case of 04EeAa)
```

The hexadecimal address value was correct, but its **EIP-55 mixed-case checksum was incorrect**: `04eEaa` should have been `04EeAa`. In ethers v6, `isAddress()` validates mixed-case checksums, resulting in:

```text
CONFIGURED = isAddress(CONTRACT_ADDRESS) && ...  ->  false
```

The page entered its configuration-error branch, showing `Configuration needs attention / Invalid contract address`, an empty project list, and disabled buttons. This resembled a missing deployment or broken application, although the immediate cause was the address string's casing.

Two changes were made:

1. **Checksum tolerance in `src/contract.js`**: if mixed-case validation failed, validation retried the lowercase address. This retained the hexadecimal value and made the shared address usable; it did not verify the intended deployment independently.
2. The correct form was documented: `0x9b824CA674432B390E30A5164a76c04EeAa8f686`, or lowercase `0x9b824ca674432b390e30a5164a76c04eeaa8f686`.

> Historical sharing recommendation: use a code block or the lowercase form to reduce accidental casing changes.

---

## 3. Other historical findings, by severity

| Severity | Issue | Impact | Resolution or recommendation at the time |
| --- | --- | --- | --- |
| P0 | Missing `.env.example` | The README's `cp .env.example .env.local` step failed, and teammates had no variable template. | **Added.** |
| P0 | Missing `.gitignore` | `node_modules/`, `dist/`, or `.env.local` could be committed accidentally; a shared local configuration could make another clone use an unintended address. | **Added.** |
| P1 | Deployed bytecode differed from the README's default compiler settings | The 2026-10-22 follow-up corrected the early inference of Shanghai from PUSH0. The matching configuration was solc 0.8.34, optimizer disabled, Osaka, source unit `MilestoneFund.sol`, and LF line endings. The complete runtime was 15,664 bytes including metadata; the default solc 0.8.24, optimizer-enabled, Paris build did not reproduce that instance. Selector presence alone could not establish equivalent behavior. | Added a read-only verification script, Standard JSON input, and complete-match evidence; see the deployment verification record. The historical instance did not require redeployment for this mismatch. |
| P2 | Missing `vite.config.js` | `@vitejs/plugin-react` was installed but not enabled. The original report described missing HMR and classic-JSX imports; more precisely, the React plugin was not configured, which alone does not establish that all Vite HMR was unavailable. | **Added.** |
| P2 | Read-only browsing depended on MetaMask when `VITE_SEPOLIA_RPC_URL` was omitted | `readProvider()` fell back to `BrowserProvider`, so users without a wallet or on the wrong network could not reliably load the project list, and errors were unclear. | Recommend a stronger README recommendation to configure RPC, or a public RPC fallback. |
| P3 | Funding projects displayed `Budget after successful funding: 0.0002 ETH` | The amount was based on funds raised so far and changed with new contributions, making it easy to mistake for a final budget. | Changed to Projected budget with `based on X ETH raised so far`; displayed `—` when nothing had been raised. |
| P3 | Transaction banners remained indefinitely | An earlier failure remained visible. | Replaced with bottom-right toasts, dismissed after 7 seconds for success or 12 seconds for failure, with manual dismissal. |
| P3 | `body { min-width: 1000px }` | Small screens required horizontal scrolling. | Removed the minimum width and added 1000px / 720px breakpoints; checked at 430px. |
| P3 | Details appeared below the project list | Selecting a card required manual scrolling, and selection was unclear. | Added smooth scrolling to details, a blue selected-card outline, and a close button. |
| P3 | The brand link used `href="#"` | Clicking jumped to the page top and changed the URL hash. | Replaced with a button. |

---

## 4. Historical test method without test ETH

Chidori reported that approval, withdrawal, and refund testing was incomplete because Sepolia test ETH was insufficient. Those manual flows required multiple transactions and at least two accounts.

The alternative used **`eth_call` with state overrides**. The script fetched the deployed runtime bytecode, placed it at a synthetic test address, and supplied fabricated storage for funded, evidence-submitted, voted, or expired scenarios. It then checked whether individual calls succeeded or reverted. These calls did not broadcast transactions, spend gas, or require a private key.

- **Part A (16 assertions)**: calls against the real deployed contract and its state at the time, checking permissions, parameters, and a simulated creation result.
- **Part B (29 assertions)**: fabricated-state calls covering approval, withdrawal, refund, milestone ordering, and repeated operations. Amount probes compared calls with different escrow balances: for example, a total of 100 wei with 39 wei escrow was expected to fail, while 40 wei was expected to succeed, consistent with a first-stage budget of `floor(2 × 100 / 5) = 40`.
- **Part C (31 assertions)**: frontend `src/utils.js` checks, including a 40/60 formula comparison across 317 amounts, invalid `positiveEth` inputs, `safeUrl`, error-message mapping, and project filters. The 317 amounts were compared to a locally calculated formula, not to 317 on-chain calls.

**Evidence limits:** each `eth_call` was independent and did not preserve changes for the next call. The script did not inspect post-call storage or actual recipient transfers. Its generic `revert` expectation accepted any caught error, so amount probes did not specifically prove an arithmetic-underflow panic. The original summary's exact-50% boundary claim was not directly asserted by this script. Likewise, clearing escrow, preserving `totalRaised` after refunds, and paying the entire remaining balance were intended behaviors, not post-state results established here. Fabricated overfunding tested withdrawal calculations from supplied state, not a real overfunding contribution transaction.

### Recorded result summary

```text
================ 76/76 passed, 0 failed ================
Part A 16/16   Part B 29/29   Part C 31/31
```

Representative recorded cases, with expectations limited to what the script checked:

| Case | Checked expectation | Recorded result |
| --- | --- | --- |
| Funded project: approval by a non-backer | Revert `Backers only` | PASS |
| Approval before evidence submission | Revert `Approval not open` | PASS |
| Approval after approval / duplicate vote | Revert `Approval not open` / `Already approved` | PASS |
| Withdrawal before milestone approval | Revert `Milestone not withdrawable` | PASS |
| Withdrawal of an already withdrawn milestone | Revert `Milestone not withdrawable` | PASS |
| Withdrawal by a non-creator | Revert `Creator only` | PASS |
| Total 100 wei, escrow 39 wei: withdrawal | Failure, paired with a successful 40 wei probe; consistent with M1 = 40 wei | PASS |
| Fabricated total 0.012 ETH, escrow 0.0048 ETH minus 1 wei: withdrawal | Failure, paired with a successful 0.0048 ETH probe | PASS |
| Milestone 2 withdrawal (`currentMilestone = 1`) | Call succeeds; remaining-balance transfer was not inspected | PASS |
| Submit milestone 2 evidence before milestone 1 withdrawal | Revert `Wrong milestone` | PASS |
| Failed project: backer refund | Call succeeds; escrow clearing and unchanged `totalRaised` were not inspected | PASS |
| Failed project: repeated refund / non-backer refund | Revert `No refund available` | PASS |
| Refund / finalize on a successful project | Revert `Project not failed` / `Funding closed` | PASS |
| Finalize after the deadline without reaching the target | Call succeeds from an unrelated account | PASS |
| Contribute after the deadline | Revert `Deadline reached` | PASS |
| Creator self-contribution / zero contribution | Revert `Creator cannot contribute` / `Contribution must be positive` | PASS |
| Frontend 40/60 budgets versus the local `floor(2t/5)` formula | All 317 amounts match | PASS |

### Historical chain snapshot (2026-10-21 19:xx)

Amounts are in ETH. The original snapshot did not specify a timezone.

| ID | Name | Status | Target | Raised | Escrow | Deadline |
| --- | --- | --- | --- | --- | --- | --- |
| 0 | DemoProject | Funding | 0.005 | 0.0005 | 0.0005 | 2026-10-22 18:13 |
| 1 | Demo project 2 | Funding | 0.0001 | 0 | 0 | 2026-10-22 18:19 |

The recorded contract balance of `0.0005 ETH` equaled the sum of the two project escrow balances. Both projects were still Funding with no submitted evidence, consistent with the reported absence of completed manual approval, withdrawal, and refund testing at that point.

---

## 5. Manual checks outstanding at the time

The simulations did not cover actual wallet interactions. The following checklist was proposed for teammates with Sepolia ETH using two accounts: A as creator and B as backer. It is a historical checklist, not a statement that all these checks remain outstanding today; consult the current end-to-end record for their actual status.

| Scenario | Expected observation |
| --- | --- |
| Real signing and confirmation | Feedback progresses from awaiting wallet confirmation to transaction pending to confirmed. |
| Reject in MetaMask | `Request rejected in MetaMask` appears, retry remains possible, and no success is shown. |
| Insufficient balance (contribution exceeds balance) | `Insufficient Sepolia ETH for the amount and gas` appears. |
| Switch account or network during use | Address, role-specific controls, and network notice update; the previous account's approval indicator does not remain. |
| Refresh the page | Amounts, evidence, approval weight, and withdrawal records reload correctly from chain. |
| Etherscan | Each transaction is visible with Success status and amounts consistent with the UI. |
| Complete a 0.01 ETH flow | Withdraw 0.004 + 0.006 ETH, reduce escrow to zero, and reach Completed. |

The historical code review noted that `transact()` fetched a fresh signer, checked for an account change, waited for one confirmation, and checked `receipt.status`. Those safeguards were present in the reviewed code; they did not by themselves prove correct behavior with a real wallet.

---

## 6. Historical interface redesign

The styles and interactions were reworked with the intention of preserving application logic, improving the visual presentation, and making card selection clearer.

| Area | Recorded change |
| --- | --- |
| Visual system | Shared tokens for backgrounds, cards, borders, primary/success/warning/error colors, radii, and shadows; tighter heading letter spacing; outlined focus states with a glow. |
| Header | Sticky translucent header, brand icon, pill navigation, and network badges: gray when disconnected, green for Sepolia, red for the wrong network. The connected wallet button displayed the address on blue. |
| Introductory section | Title, description, and a three-step contribution → evidence → approval/release guide; omitted on the creation page to show the form directly. |
| Project cards | Dot-and-pill status badges: blue Funding, green Successful, red Failed, gray Completed, and orange awaiting finalization. Gradient progress bars, hover elevation, and a blue selected outline. |
| Filters | All projects / Created by me / I backed / Needs my approval, with counts. Wallet-dependent filters disabled while disconnected, with a hint. Filtering applied to the current page and showed an explicit empty state. |
| Details | Smooth scroll after selection, a close button, four statistic cards, and milestone cards showing a numbered marker, status, budget/released amount, and approval progress. |
| Amount labels | Replaced `Budget after successful funding` during Funding with `Projected budget` or `—`, and clarified the amount raised so far. |
| Feedback | Bottom-right, status-colored toasts with a spinner, Etherscan link, and close button; automatic dismissal after 7 seconds for success and 12 seconds for failure. |
| Loading | Four skeleton cards on initial load and an `Updated 20:48:52 · auto-refresh 15s` label. |
| Responsive layout | Removed `min-width: 1000px`; single-column layout below 1000px, wrapping header and single-column statistics below 720px, and bottom-positioned toasts. Checked at 430px. |

The filter predicate moved from `App.jsx` to `utils.js` as `matchesFilter`, with 10 helper assertions included in the recorded total.

The original delivery referenced `ui-explore.png` (list), `ui-detail.png` (details), `ui-create.png` (creation), `ui-connected.png` and `ui-toast.png` (connected wallet and error toast), and `ui-mobile.png` (430px). These historical delivery filenames are retained as references; those images are not included in the current repository evidence directory.

---

## 7. Historical change inventory

This inventory describes the work recorded in the original report, not the changes made by the present translation.

| File | Recorded change |
| --- | --- |
| `.env.example` | Added a `VITE_CONTRACT_ADDRESS` / `VITE_SEPOLIA_RPC_URL` template and explanations. |
| `.gitignore` | Added exclusions for `node_modules/`, `dist/`, `.env.local`, and test output. |
| `vite.config.js` | Enabled `@vitejs/plugin-react` and set port 5173. |
| `src/contract.js` | Added lowercase retry for address-checksum validation. |
| `src/styles.css` | Reworked design tokens, component styles, and responsive breakpoints; later added side-by-side columns, sticky scrollable details, and card metadata. |
| `src/App.jsx` | Reworked the introduction, filters, scrolling, close controls, toasts, skeletons, and update time; later added the right-side detail panel, countdowns/milestone positions, and a contract information card. |
| `src/utils.js` | Added `matchesFilter()` for shared list filtering and helper tests. |
| `simulate-tests.mjs` | Added 76 simulation/helper assertions, including filter checks. The original rerun command was `node simulate-tests.mjs`; its old ABI/layout/live-state assumptions make it unsuitable for current regression testing. |
| `verify.mjs` | Added chain-state reads and preliminary ABI-selector/bytecode checks, rather than complete source-to-bytecode verification. |

> Both scripts were test tools outside the frontend build. The original report described them as optional to retain; they are now retained as historical tooling. Running the simulation script would overwrite `simulation-results.json`.

---

## 8. Next steps proposed in the original report

These are historical recommendations, not current submission requirements or instructions to configure the newer deployment with the old address.

1. **Correct the old address**: use `0x9b824CA674432B390E30A5164a76c04EeAa8f686` in `.env.local`, or use the checksum-tolerant code.
2. **Complete the manual checklist in Section 5** with funded test accounts and share transaction hashes and screenshots. The original report called this the remaining acceptance gap at that time; later evidence must be assessed separately.
3. **Optional product improvements**: a shareable project URL that preserves selection after refresh, and a live 40/60 budget preview on the creation form.
4. **Optional contract improvement proposed then**: address the old README's limitation that non-approval could lock funds indefinitely by adding an approval deadline and a timeout path, such as creator withdrawal or proportional backer exit. This was a historical design suggestion, not a validated design or a guarantee of assessment credit. The newer contract's implemented timeout/refund rules supersede that open-ended proposal.

---

## 9. Historical second-round UI adjustments

After the initial visual work, the second round focused on clearer card selection and easier access to long project details.

| Adjustment | Reason |
| --- | --- |
| Side-by-side list and details at ≥1120px | Kept sticky details in the right column so selection did not require scrolling; an explanation occupied the column when no project was selected. |
| Internal scrolling when the right panel exceeded the viewport | Kept the bottom of a long sticky detail panel reachable. |
| Countdown / milestone position on cards | Showed time remaining during funding, and milestone position afterward. |
| Contribution badge at the bottom of cards | Made projects backed by the connected account easy to identify. |
| Contract information card below the list | Provided one-click address copying and used the space beneath the cards. |
| Shorter milestone copy, including a one-line budget and shorter threshold explanation | Reduced wrapping in the narrower right column; the recorded panel height decreased from about 1260px to about 1100px. |
| Single-column layout on narrow screens (≤1120px) | Placed details below the list, scrolled to them after selection, and hid the empty placeholder. |
