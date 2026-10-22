# 现有 Sepolia 部署复现核对

2026-10-22 已从当前源码复现现有合约的**完整运行时代码，包括 CBOR metadata 尾部**。链上地址为 `0x9b824CA674432B390E30A5164a76c04EeAa8f686`，网络为 Ethereum Sepolia，chain ID `11155111`。

匹配配置是 **Solidity 0.8.34、关闭优化、Osaka、源码单元名 `MilestoneFund.sol`、LF 换行**。仓库原有 `compile:contract` 使用的 **0.8.24、开启优化、Paris** 产生另一份运行时代码，不能用它声称重现了当前实例。该旧配置可继续用于按该配置进行的其他编译或新部署；本次核验保留它和现有 ABI，不要求重新部署当前合约。

## 1. 固定区块证据

| 项目 | 结果 |
| --- | --- |
| 固定区块 | `11966764` |
| 区块哈希 | `0xde0a441229659355ce5cd74e25c0a5e81a666412bd0a618601cc5fc2ab8ecf18` |
| 区块时间 | 2026-10-22 11:07:36，北京时间 UTC+8 |
| 链上运行时代码 | 15,664 字节 |
| 完整 runtime Keccak-256 | `0xbc583b4ce58bf4e2536884cc463c753de01f711ab07f4096c0ca8c97bd7d6ac0` |
| 剥离有效 CBOR metadata 及长度字段后 | 15,611 字节 |
| 执行部分 Keccak-256 | `0xbada2cf00f14da52219ab0e2686e2aba87f573656e5ca38e328de44c4b4e0078` |
| CBOR 的 `solc` 字节 | `00 08 22`，解码为 `0.8.34`，末尾 `22` 是十六进制34 |
| 编译出的 ABI 与仓库 ABI | 一致，未重写 ABI 文件 |

证据文件相对于本文件所在目录：

- [核验结果和全部尝试配置](evidence/deployment/verification-11966764.json)
- [固定区块完整 runtime](evidence/deployment/verification-11966764-runtime.hex)
- [成功匹配的完整 Standard JSON 编译输入](evidence/deployment/verification-11966764-standard-input.json)
- [成功匹配的编译器 metadata](evidence/deployment/verification-11966764-metadata.json)

主结果包含各证据文件的 SHA-256、原始源码与规范化源码的哈希、编译器完整版本、配置、代码哈希和固定区块。runtime 文件是从该区块读取的原始十六进制代码，可用于离线比较。本次只通过 RPC 读取链ID、区块和合约代码，没有账户签名或发送交易。

## 2. 完整匹配的配置及源码字节

| 编译项 | 匹配值 |
| --- | --- |
| npm 编译器别名 | `solc-deployed` |
| 完整编译器版本 | `0.8.34+commit.80d5c536.Emscripten.clang` |
| optimizer | `enabled: false`、`runs: 200` |
| EVM | `osaka` |
| viaIR | `false`，编译输入使用默认关闭值 |
| 源码单元路径 | `MilestoneFund.sol` |
| 源码内容 | 仓库 `contracts/MilestoneFund.sol`，仅将 CRLF 换行为 LF |
| metadata | 默认 `bytecodeHash: ipfs`，附加 CBOR |
| 合约 | `MilestoneFund` |

这里的“源码单元路径”是 Standard JSON `sources` 对象的键，不是要求重命名仓库文件。匹配输入已经保存，复跑时可直接使用，不必手工猜测 Remix 工作区目录。

此次读取的 Windows 工作区源码为9,482字节，SHA-256为 `61958cddee7960cc46aae542ddc83fe8f118c10c347e7313bc470c5a183f4a5b`。仅转换为 LF 后为9,291字节，SHA-256为 `4600e1658299004ebfe8ed9bd9e342c98436fd5b9db400dadf8c5ff64ffb69c4`。转换只在内存中进行，磁盘源码未改动。

采用相同0.8.34配置、但保留CRLF时，剥离metadata后的执行部分完全一致，完整runtime不一致。改成LF后，完整runtime才一致。源码路径、空白字符及编译设置会影响metadata；Solidity将metadata哈希和编译器标记放入运行时代码尾部。[Solidity官方metadata说明](https://docs.soliditylang.org/en/latest/metadata.html)

原有本地编译器为 `0.8.24+commit.e11b9ed9.Emscripten.clang`。其原有优化开启、200 runs、Paris配置输出9,196字节，完整代码和剥离metadata后的执行部分均不匹配现有部署。该差异不能仅解释为换行或metadata差异。

## 3. 复跑线上只读核验

在仓库根目录安装锁定依赖后运行：

```powershell
npm ci
node scripts/verify-deployment.mjs --block 11966764
```

默认输出到 `docs/evidence/deployment/` 下带区块号和时间的新文件，不覆盖本次证据。省略 `--block` 时先取得最新区块，再固定该区块进行读取和比较，完成后重新核对区块哈希。

也可指定RPC、合约和新输出文件名：

```powershell
node scripts/verify-deployment.mjs --rpc https://ethereum-sepolia-rpc.publicnode.com --address 0x9b824CA674432B390E30A5164a76c04EeAa8f686 --block 11966764 --out docs/evidence/deployment/my-verification.json --timeout-ms 20000
$LASTEXITCODE
```

地址参数接受合法Ethereum地址并验证checksum。环境变量支持 `SEPOLIA_RPC_URL` / `VITE_SEPOLIA_RPC_URL`、`CONTRACT_ADDRESS` / `VITE_CONTRACT_ADDRESS`、`VERIFY_BLOCK`；CLI参数优先。脚本不会自行读取 `.env.local`。默认只访问公共RPC，不需要私钥。输出中仅记录RPC的origin和完整端点哈希，省略路径及凭据。

| 退出码 | 含义 |
| --- | --- |
| `0` | 至少一个候选配置与完整runtime逐字节一致 |
| `2` | 只有剥离有效CBOR metadata后的执行部分一致 |
| `3` | 有效读取与编译完成，但没有匹配候选 |
| `1` | RPC失败、超时、网络错误、编译失败、无合约代码、参数错误或输出文件已存在等；不能判为通过 |

脚本先比较仓库原配置，再有限尝试两个已安装编译器、优化开关及所支持的EVM配置；只有执行部分匹配时，才尝试两种源码单元路径和LF/CRLF换行。最多编译64次，遇到完整匹配立即停止，本次实际编译8次。不会自动下载其他编译器、无限搜索或写入 `src/abi`、`artifacts`。

编译采用 Standard JSON 输入，并显式检查编译器返回的错误，不能只看编译进程是否退出成功。[Solidity官方编译器接口说明](https://docs.soliditylang.org/en/latest/using-the-compiler.html#compiler-input-and-output-json-description)

## 4. 使用已保存证据离线复跑

以下PowerShell命令不访问RPC，只用保存的Standard JSON重新编译，再与保存的链上runtime逐字节比较：

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

本次线上核验退出0；上述离线复跑也得到完整匹配。另以不可达的本机RPC进行失败检查，脚本返回 `verification-error`、退出1，没有误报通过或生成成功证据。

## 5. 结论范围

该证据证明：保存的源码和配置可以生成与指定地址在指定区块的运行时代码完全相同的字节，包括metadata。它比函数selector或ABI相同的检查更强，但不等于安全审计，也不单独证明部署交易的创建字节码或部署者操作历史。

如果以后换了地址、源码或配置而结果仅为 `executable-only-match`，需要准确保留这个级别；要进一步获得完整匹配，应向部署组员取得当时的完整Standard JSON编译输入或metadata文件、精确编译器版本、源码单元路径和原始源码字节。当前这份实例已经完整复现，无须为了统一旧README配置而重部署。
