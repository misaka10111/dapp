# Sepolia Deployment Verification

## Current version: 2026-11-07

The source baseline is `4a77279`. This update fixes the verification script and adds tests, documentation and evidence; the contract and frontend ABI are unchanged. Verification now uses the compiler's `evm.deployedBytecode.immutableReferences` output to check each immutable variable's complete byte ranges and every occurrence of that variable. All executable bytes outside those ranges must match exactly. A metadata-only difference is not classified as an immutable substitution match.

| Item | Result of this read-only verification |
| --- | --- |
| Network / contract | Sepolia (11155111) / `0x5A5AeaE5553Feb5c5b27FEe5ec8b24E3ED2B964F` |
| Fixed block | `12081918`, 2026-11-07 14:34:12 (UTC+8) |
| Block hash | `0xbfe3890624a11ff65b401da54ab681175848e71e5e3dd6cbefe6421a2d282752` |
| Compiler settings | Solidity 0.8.24, optimizer enabled / 200 runs, Paris, viaIR disabled |
| Match level / exit code | `immutable-substitution-match` / `0` |
| Immutables | Two variables, each appearing twice: four 32-byte ranges in total, each containing `600` |
| Metadata | `metadataMatch=false`; `fullMatch=false`, `substitutedFullMatch=false` |

The executable code matches after substituting immutable values at the positions identified by the compiler. **This is not a claim that the complete runtime, including metadata, matches.** The values were read from the runtime at the fixed block; the constructor arguments in the deployment transaction were not independently verified. This is not a security audit. No transaction was signed or sent. The script rechecked the block hash after comparison.

- [Verification results, settings and file hashes](evidence/deployment/verification-2026-11-07-compiler-references.json)
- [On-chain runtime](evidence/deployment/verification-2026-11-07-compiler-references-runtime.hex), [Standard JSON compiler input](evidence/deployment/verification-2026-11-07-compiler-references-standard-input.json), [compiler metadata](evidence/deployment/verification-2026-11-07-compiler-references-metadata.json)
- [Compiler-identified immutable ranges and values](evidence/deployment/verification-2026-11-07-compiler-references-immutable.json)

The earlier files saved on the same day, `verification-12080309-2026-11-07T01-09-15-627Z*`, used the old heuristic based on two-byte differences and are retained as historical evidence. The current conclusion is based on this `schemaVersion: 2` record. The new record adds `immutableReferences`, `metadataMatch` and `substitutedFullMatch`. Each slot records its variable ID, complete byte range, hexadecimal value and decimal string, avoiding loss of integer precision.

### Recheck the current deployment

```bash
npm ci
npm run verify:deployment
# Recheck this fixed block; new files are generated without overwriting existing evidence.
node scripts/verify-deployment.mjs --address 0x5A5AeaE5553Feb5c5b27FEe5ec8b24E3ED2B964F --block 12081918
```

| Exit code | Meaning in the current script |
| --- | --- |
| `0` | `full-match`: every byte of the original runtime matches; or `immutable-substitution-match`: executable code matches after substitution within compiler-declared ranges, with metadata equality reported separately |
| `2` | `executable-only-match`: executable code matches, metadata differs, and no actual immutable substitution occurs |
| `3` | Reading and compilation completed, but no candidate met the matching criteria |
| `1` | An error, such as an RPC or compilation failure, invalid arguments, missing contract code, or an existing output file |

The script does not read `.env.local`. CLI arguments take precedence over environment variables; the default address is shown above. Run `node scripts/verify-deployment.mjs --help` to see the supported environment variables and options. The search stops at an immutable substitution match. A metadata mismatch does not mean that every possible compiler input has been tried.

Recheck this evidence offline, without RPC access:

```bash
node --input-type=module <<'JS'
import fs from 'node:fs';
import solc from 'solc';
import { compareRuntime } from './scripts/verify-deployment.mjs';
const prefix = 'docs/evidence/deployment/verification-2026-11-07-compiler-references';
const input = JSON.parse(fs.readFileSync(prefix + '-standard-input.json', 'utf8'));
const output = JSON.parse(solc.compile(JSON.stringify(input)));
const errors = (output.errors || []).filter(e => e.severity === 'error');
if (errors.length) throw new Error(errors.map(e => e.formattedMessage).join('\n'));
const artifact = output.contracts['MilestoneFund.sol'].MilestoneFund.evm.deployedBytecode;
const saved = fs.readFileSync(prefix + '-runtime.hex', 'utf8').trim();
const result = compareRuntime('0x' + artifact.object, saved, artifact.immutableReferences);
console.log(result);
if (!result.immutableMatch || result.metadataMatch) process.exitCode = 1;
JS
```

The offline rerun produced the same match level, and the SHA-256 hashes of all accompanying evidence files were verified. The failure path was also checked using an unreachable local RPC endpoint: the script reported `verification-error`, exited with code 1, and did not create success evidence. Run `node --test tests/deployment-verification.test.mjs` for regression tests covering false positives, false negatives and the saved historical evidence. Full test results are documented in [Automated Testing](automated-testing.md).

## Historical record: initial deployment on 2026-10-22

The following record applies only to the initial source version and old address. It preserves the evidence and conclusions from that date and does not establish anything about the current source or new address. To recheck the old deployment, use the historical worktree specified below.

On 2026-10-22, the source at that time reproduced the deployed contract's **complete runtime bytecode, including the CBOR metadata trailer**. The contract address was `0x9b824CA674432B390E30A5164a76c04EeAa8f686` on Ethereum Sepolia, chain ID `11155111`.

The matching settings were **Solidity 0.8.34, optimizer disabled, Osaka, source unit name `MilestoneFund.sol`, and LF line endings**. The repository's original `compile:contract` settings, **0.8.24, optimizer enabled, Paris**, produced different runtime bytecode and could not substantiate a reproduction of that deployment. Those repository settings remained usable for other compilations or new deployments. The verification retained both those settings and the existing ABI; it did not require redeploying the contract.

### 1. Evidence at a fixed block

| Item | Result |
| --- | --- |
| Fixed block | `11966764` |
| Block hash | `0xde0a441229659355ce5cd74e25c0a5e81a666412bd0a618601cc5fc2ab8ecf18` |
| Block time | 2026-10-22 11:07:36, Beijing time (UTC+8) |
| On-chain runtime | 15,664 bytes |
| Full runtime Keccak-256 | `0xbc583b4ce58bf4e2536884cc463c753de01f711ab07f4096c0ca8c97bd7d6ac0` |
| After removing valid CBOR metadata and its length field | 15,611 bytes |
| Executable section Keccak-256 | `0xbada2cf00f14da52219ab0e2686e2aba87f573656e5ca38e328de44c4b4e0078` |
| CBOR `solc` bytes | `00 08 22`, decoded as `0.8.34`; the final `22` is hexadecimal for 34 |
| Compiled ABI versus repository ABI | Identical; the ABI file was not rewritten |

Evidence files, relative to this document:

- [Verification results and all attempted settings](evidence/deployment/verification-11966764.json)
- [Complete runtime at the fixed block](evidence/deployment/verification-11966764-runtime.hex)
- [Complete Standard JSON input for the matching compilation](evidence/deployment/verification-11966764-standard-input.json)
- [Compiler metadata for the matching compilation](evidence/deployment/verification-11966764-metadata.json)

The main result records the SHA-256 hash of each evidence file, hashes of the original and normalized source, the full compiler version, compiler settings, code hashes and the fixed block. The runtime file contains the original hexadecimal bytecode read at that block and can be used for offline comparison. This verification only read the chain ID, block and contract code through RPC; no account signed or sent a transaction.

### 2. Settings and source bytes for the full match

| Compiler setting | Matching value |
| --- | --- |
| npm compiler alias | `solc-deployed` |
| Full compiler version | `0.8.34+commit.80d5c536.Emscripten.clang` |
| optimizer | `enabled: false`, `runs: 200` |
| EVM | `osaka` |
| viaIR | `false`; the compiler input used the default disabled setting |
| Source unit path | `MilestoneFund.sol` |
| Source content | The repository's `contracts/MilestoneFund.sol`, with only CRLF line endings converted to LF |
| metadata | Default `bytecodeHash: ipfs`, with CBOR appended |
| Contract | `MilestoneFund` |

The "source unit path" is the key in the Standard JSON `sources` object; it does not require renaming the repository file. The matching input is saved and can be reused directly, without guessing the Remix workspace directory.

The source read from the Windows workspace was 9,482 bytes, with SHA-256 `61958cddee7960cc46aae542ddc83fe8f118c10c347e7313bc470c5a183f4a5b`. After converting line endings to LF, it was 9,291 bytes, with SHA-256 `4600e1658299004ebfe8ed9bd9e342c98436fd5b9db400dadf8c5ff64ffb69c4`. The conversion took place only in memory; the source file on disk was unchanged.

With the same 0.8.34 settings but CRLF line endings, the executable section matched after removing metadata, while the complete runtime did not. The complete runtime matched only after converting to LF. Source paths, whitespace and compiler settings affect metadata; Solidity appends the metadata hash and compiler identifier to the runtime bytecode. [Solidity metadata documentation](https://docs.soliditylang.org/en/latest/metadata.html)

The original local compiler was `0.8.24+commit.e11b9ed9.Emscripten.clang`. With the original settings of optimizer enabled, 200 runs and Paris, it produced 9,196 bytes. Neither the complete runtime nor the executable section with metadata removed matched that deployment. Line endings or metadata alone could not explain the difference.

### 3. Recheck the old deployment without sending transactions

Use the historical source and script in a separate worktree to avoid mixing the current source and default new address with the old block:

```powershell
git worktree add --detach ../dapp-verification-v1 7d4eba9
cd ../dapp-verification-v1
npm ci
node scripts/verify-deployment.mjs --address 0x9b824CA674432B390E30A5164a76c04EeAa8f686 --block 11966764
```

By default, the script creates new files under `docs/evidence/deployment/`, named with the block number and timestamp, without overwriting the saved evidence. If `--block` is omitted, it first retrieves the latest block, uses that fixed block for reading and comparison, and rechecks its hash after completion.

You can also specify the RPC endpoint, contract and a new output filename:

```powershell
node scripts/verify-deployment.mjs --rpc https://ethereum-sepolia-rpc.publicnode.com --address 0x9b824CA674432B390E30A5164a76c04EeAa8f686 --block 11966764 --out docs/evidence/deployment/my-verification.json --timeout-ms 20000
$LASTEXITCODE
```

The address argument accepts valid Ethereum addresses and validates the checksum. Supported environment variables are `SEPOLIA_RPC_URL` / `VITE_SEPOLIA_RPC_URL`, `CONTRACT_ADDRESS` / `VITE_CONTRACT_ADDRESS`, and `VERIFY_BLOCK`; CLI arguments take precedence. The script does not automatically read `.env.local`. It uses a public RPC endpoint by default and requires no private key. The output records only the RPC origin and a hash of the complete endpoint, omitting the path and credentials.

| Exit code | Meaning |
| --- | --- |
| `0` | At least one candidate matches every byte of the complete runtime |
| `2` | Only the executable section matches after valid CBOR metadata is removed |
| `3` | Reading and compilation completed successfully, but no candidate matched |
| `1` | An RPC failure, timeout, network error, compilation failure, missing contract code, invalid argument, existing output file or other error; this is not a pass |

The script first checks the repository's original settings, then tries a bounded set of combinations of the two installed compilers, optimizer settings and supported EVM targets. Only when the executable section matches does it try the two source unit paths and LF/CRLF line endings. It allows at most 64 compilations and stops immediately on a full match; this historical run required 8 compilations. It does not download other compilers, search indefinitely, or write to `src/abi` or `artifacts`.

Compilation uses Standard JSON input and explicitly checks errors returned by the compiler; a successful process exit alone is insufficient. [Solidity compiler interface documentation](https://docs.soliditylang.org/en/latest/using-the-compiler.html#compiler-input-and-output-json-description)

### 4. Recheck the saved evidence offline

The following PowerShell command does not access RPC. It recompiles the saved Standard JSON input and compares the result byte for byte with the saved on-chain runtime:

```powershell
@'
import fs from 'node:fs';
import solc from 'solc-deployed';
import { keccak256 } from 'ethers';
const prefix = 'docs/evidence/deployment/verification-11966764';
const input = JSON.parse(fs.readFileSync(prefix + '-standard-input.json', 'utf8'));
const output = JSON.parse(solc.compile(JSON.stringify(input)));
const errors = (output.errors || []).filter(e => e.severity === 'error');
if (errors.length) throw new Error(errors.map(e => e.formattedMessage).join('\n'));
const actual = '0x' + output.contracts['MilestoneFund.sol'].MilestoneFund.evm.deployedBytecode.object;
const saved = fs.readFileSync(prefix + '-runtime.hex', 'utf8').trim();
console.log({ fullMatch: actual === saved, runtimeKeccak256: keccak256(actual) });
if (actual !== saved) process.exitCode = 1;
'@ | node --input-type=module
```

The historical online verification exited with code 0, and the offline rerun above also produced a full match. A failure check using an unreachable local RPC endpoint returned `verification-error` and exit code 1, without reporting a false pass or creating success evidence.

### 5. Scope of the historical conclusion

The evidence establishes that the saved source and settings can generate exactly the same runtime bytes, including metadata, as the specified address at the specified block. This is stronger than checking function selectors or ABI equality, but it is not a security audit and does not independently establish the deployment transaction's creation bytecode or the deployer's actions.

If a later change to the address, source or settings produces only an `executable-only-match`, that match level must be reported accurately. To pursue a full match, obtain the original complete Standard JSON input or metadata file, exact compiler version, source unit path and original source bytes from the team member who deployed the contract. This historical instance was fully reproduced and did not need redeployment merely to align it with the old README settings.
