# MilestoneFund

COMP7610 课程项目：支持者为项目出资，项目方按两个里程碑提交成果。支持者审批通过后，项目方依次提取 40% 和剩余 60% 的资金。仅使用 Sepolia 测试 ETH。

**测试方式：组员用 Remix 部署合约，大家在各自电脑启动网页，通过 MetaMask 手动操作。** 只需一位组员部署到 Sepolia，再把合约地址发给其他人。

## 1. 项目文件

| 文件 | 用途 |
| --- | --- |
| `contracts/MilestoneFund.sol` | 核心合约：创建项目、出资、审批、提款和退款。在 Remix 部署这个文件。 |
| `src/App.jsx` | 网页页面、表单、钱包连接和交易按钮。 |
| `src/main.jsx` | React 启动入口。 |
| `src/contract.js` | 读取合约地址和 ABI，连接 MetaMask 与 Sepolia。 |
| `src/abi/MilestoneFund.json` | 前端调用合约需要的 ABI，已经与当前合约匹配。 |
| `src/utils.js` | 金额转换、地址显示、链接检查和错误提示。 |
| `src/styles.css` | 电脑网页样式。 |
| `index.html` | 网页入口。 |
| `package.json` | 依赖和启动命令。 |
| `package-lock.json` | 固定依赖版本，让组员安装相同版本。 |
| `.env.example` | 合约地址配置模板。 |
| `.gitignore` | Git 忽略规则。 |
| `scripts/compile-contract.mjs` | 修改合约后，可用它重新编译并更新 ABI；手动测试无需操作。 |
| `README.md` | 本说明文件。 |

## 2. 安装依赖并启动网页

需要安装：

- **Node.js 22.12 或更高版本**，包含 npm。
- Git（使用克隆命令时需要；也可从 GitHub 下载 ZIP 并解压）。
- Chrome 浏览器和 MetaMask 扩展。

先安装 [Node.js](https://nodejs.org/)，npm 会随 Node.js 一起安装。React、Vite、Ethers 等会通过下面的命令一起安装，无需分别运行安装命令。不需要数据库、后端服务器或 Hardhat。

| 依赖 | 用途 | 安装方式 |
| --- | --- | --- |
| React、React DOM | 显示网页 | `npm ci` 一起安装 |
| Ethers v6 | 连接钱包和调用合约 | `npm ci` 一起安装 |
| Vite、React 插件 | 启动和构建前端 | `npm ci` 一起安装 |
| solc 0.8.24 | 可选的本地合约编译和 ABI 更新 | `npm ci` 一起安装；Remix 中单独选择编译器版本 |

源码上传到 GitHub 的 `milestonefunddemo` 分支后，组员可执行：

```bash
git clone --branch milestonefunddemo https://github.com/misaka10111/dapp.git
cd dapp
```

在项目根目录（能看到 package.json 的目录）运行：

```bash
node --version
npm --version
npm ci       # 安装 package.json / package-lock.json 中的全部项目依赖
npm run dev  # 安装完成后，启动网页
```

`node --version` 和 `npm --version` 只是检查是否安装成功。真正安装项目依赖的是 **`npm ci`**，首次下载项目或依赖发生变化时运行。平时重新打开网页只需 `npm run dev`，不必每次重新安装。安装依赖后会生成 `node_modules/`，不要上传这个目录。

打开终端显示的网址，通常是 `http://localhost:5173`。保持终端运行，按 Ctrl+C 可以停止。

此时应该能打开页面，并显示“尚未配置合约”的提示。页面里没有假项目或假金额，链上操作需要先完成下面的部署和配置。

如果组员已有本地仓库，先保存自己的修改，再获取对应分支，不要用 reset 覆盖自己的工作，也不要在 main 上修改。

## 3. 组员使用 Remix 部署合约

1. 在安装 MetaMask 的浏览器中打开 [Remix](https://remix.ethereum.org)。
2. 新建 `MilestoneFund.sol`，复制仓库中 `contracts/MilestoneFund.sol` 的全部内容。
3. 在 Solidity Compiler 中选择 **0.8.24**，开启 Optimization，runs 设为 **200**，EVM Version 选择 **paris**，不启用 via-IR，点击 Compile。
4. 准备两个不同的 MetaMask 账户：**A 为发起人，B 为支持者**。选择 **Ethereum Sepolia**。A 需要测试 ETH 支付 gas；B 需要 **0.01 测试 ETH，另外预留 gas**。
5. Remix 的 Deploy & Run 中，Environment 选择 **Browser Extension / MetaMask**，旧版可能叫 Injected Provider。核对网络是 Sepolia、账户是 A。
6. 合约选择 **MilestoneFund**，Value 为 **0**，不需要构造参数。点击 Deploy，在 MetaMask 确认，等待成功。
7. 复制 Deployed Contracts 中的**合约地址**，连同部署交易哈希发给组员。不要把钱包地址或交易哈希当成合约地址。

也可以先用 Remix VM 的虚拟账户检查合约。**Remix VM 的地址不能填到这个 Sepolia 前端中**，网页交易需要真正部署在 Sepolia。

## 4. 配置本地网页

`.env.example` **只是空白配置模板，不是运行必需文件**。它告诉组员要填写哪些配置，可以上传 GitHub。Vite 默认不会自动读取它。

`.env.local` 是每个人电脑上的实际配置文件，Vite 启动时会读取它，本项目已把它加入 Git 忽略规则。这里的 local 表示“本机配置”，不表示本地区块链；交易仍发送到 Sepolia。

你可以任选一种方式准备配置：

- **直接新建：**在项目根目录（与 package.json 同一层）新建 `.env.local`，粘贴下面的内容。不需要先有 `.env.example`。
- **复制模板：**复制 `.env.example`，把副本命名为 `.env.local`。这样可以少打几个配置项，不是必须的步骤。

复制模板时，macOS/Linux 可以运行：

```bash
cp .env.example .env.local
```

Windows PowerShell 可以运行：

```powershell
Copy-Item .env.example .env.local
```

无论选哪种方式，最终 `.env.local` 内容都是：

```dotenv
VITE_CONTRACT_ADDRESS=
VITE_SEPOLIA_RPC_URL=
```

把真实的 Sepolia 合约地址填在第一行等号后。第二行先留空，网页会通过 MetaMask 读取 Sepolia 数据。

**没有 `.env.example` 也能测试；只要网页能读到正确的合约地址即可。** 如果尚未配置地址，`npm run dev` 仍能打开网页、检查外观，但无法创建项目、出资、审批或提款。

按 Ctrl+C 停止原来的网页，再运行：

```bash
npm run dev
```

在浏览器打开网页，MetaMask 切到 Sepolia，点击 **Connect MetaMask**。未配置提示应消失，页面底部合约链接应指向正确地址。

组员可以共用同一个已部署合约，但每个人都要配置自己的 `.env.local`，测试时创建不同项目，避免互相影响。合约源码没有改动时，现有 ABI 可以直接使用。

**不要在文件中填写私钥或助记词，不要上传 `.env.local`。**

## 5. 手动测试：完成一次成功流程

每笔交易都等确认后再继续。切换 MetaMask 账户后，先检查网页显示的地址是否正确，必要时点 Refresh。

| 步骤 | 操作 | 预期结果 |
| --- | --- | --- |
| 1 | A 创建项目：目标 **0.01 ETH**，截止选明天，填写名称、简介和两个阶段目标。 | 显示 Funding，已筹金额为 0。 |
| 2 | B 打开该项目，出资 **0.01 ETH**。 | 显示 Successful，已筹和托管金额均为 0.01，停止接受出资。 |
| 3 | A 提交第一阶段成果说明和真实 GitHub/Demo 链接。 | 成果可查看，阶段显示 In review。 |
| 4 | B 审批第一阶段。 | 赞成权重 100%，显示 Approved。 |
| 5 | A 提取第一阶段资金。 | 提取 **0.004 ETH**，托管剩 **0.006 ETH**。 |
| 6 | A 提交第二阶段成果和链接。 | 第二阶段显示 In review。 |
| 7 | B 审批第二阶段。 | 第二阶段显示 Approved。 |
| 8 | A 提取第二阶段资金。 | 提取 **0.006 ETH**，托管余额为 0，项目显示 Completed。 |
| 9 | 刷新网页并重新打开项目。 | 完成状态及提款记录仍然正确。 |
| 10 | 打开页面中的交易链接。 | Sepolia Etherscan 能查到真实成功交易。 |

网页应显示钱包确认中、交易处理中、成功或失败提示。保存项目 ID、交易哈希和截图。钱包余额变化包含 gas，检查提款金额主要看页面记录和交易事件。

## 6. 主要测试功能

不同场景尽量创建新项目，记录“通过、失败或未测试”。

| 测试功能 | 操作和预期 |
| --- | --- |
| 钱包与网络 | 连接钱包、切换 A/B、切换网络。地址、角色按钮和 Sepolia 提示应更新。 |
| 创建与读取 | 创建后刷新，名称、目标、截止时间和两个阶段目标应保持一致。 |
| 输入检查 | 空必填项、零/负金额、过去的截止时间不能成功提交。 |
| 多次出资 | 目标 0.01，B 先出 0.003，再出 0.007。累计应为 0.01，项目成功。 |
| 发起人不能自投 | A 打开自己的项目，应看到限制提示；在 Remix VM 直接调用也应失败。 |
| 超额及关闭 | 目标 0.01，B 出 0.012。全部保留并关闭筹款，两阶段预算为 0.0048 和 0.0072。 |
| 成果与权限 | 只有发起人能提交成果，同阶段不能重复提交或修改。 |
| 加权审批 | 恰好 50% 不通过，严格超过 50% 立即通过。详见下方示例。 |
| 提款权限 | 未批准不能提款，非发起人不能提款，已提阶段不能重复提款。 |
| 阶段顺序 | 第一阶段提款后，才能提交第二阶段。 |
| 重复操作 | 重复投票、提款或成果提交应失败，不改变金额或权重。 |
| 拒绝签名 | 在 MetaMask 拒绝交易，应显示拒绝提示并允许重试，不能显示成功。 |
| 刷新恢复 | 刷新后，金额、成果和状态应从合约正确读回。 |

网页会隐藏或禁用不允许的操作。验证合约本身是否拒绝时，请在 **Remix VM** 中选对应账户直接调用。只有 `contribute` 需要填写 Remix 的 Value，其他调用要把 Value 改回 **0**。项目编号从 0 开始；第一阶段参数是 0，第二阶段是 1。

**50% 边界测试（Remix VM）：**

1. A 创建目标 **100 wei** 的项目，B/C 为支持者，D 为无关账户。deadline 输入未来的 Unix 秒数，可在浏览器控制台计算 `Math.floor(Date.now() / 1000) + 3600` 后复制数值。
2. B 和 C 各出 50 wei，A 提交第一阶段成果。
3. D 调用 `approveMilestone(id, 0)` 应失败，因为 D 没有出资。
4. B 审批后，`getMilestone(id, 0)` 的 approvalWeight 为 50、approved 为 false。B 再次投票应失败，A 此时不能提款。
5. C 审批后，approved 立即变为 true；之后不能继续投票。
6. A 提取第一阶段 40 wei，托管剩 60 wei；再完成第二阶段提交、两人审批和剩余 60 wei 提款。

**失败退款测试（网页 + Sepolia）：**

1. 新建目标 **0.02 ETH** 的项目，截止至少设为 5 分钟后，B 只出 **0.003 ETH**。
2. 等截止后，页面显示 Awaiting finalization，不能继续出资。截止本身不会自动把链上状态改为 Failed。
3. A 或 B 点击 **Finalize funding**，等确认后显示 Failed。
4. B 点击 **Claim refund**，应返还原始出资 0.003 ETH，托管余额变 0；历史筹款总额仍为 0.003。
5. 刷新后仍是已退款，不能重复领取。另可在 Remix VM 检查提前确认失败、提前退款、重复退款以及成功项目退款均被拒绝。

**多项目隔离（Remix VM）：** 创建 P、Q 两个目标均为 100 wei 的项目。B 为 P 出 100 wei，C 为 Q 出 30 wei。P 完成第一阶段提款后，P 剩 60、Q 仍为 30。Q 截止后确认失败并退款，P 应仍剩 60。一个项目的出资和审批记录不能影响另一个项目。

给组员反馈时写明：测试版本/提交、操作系统和浏览器、合约地址和网络、项目 ID、通过/失败/未测项目、复现步骤及交易哈希/截图。不要包含私钥或助记词。

## 7. 其他命令和常见问题

```bash
npm run build             # 检查正式构建，生成 dist
npm run compile:contract  # 修改 Solidity 后重新生成 ABI
```

修改 Solidity 后，要重新编译并更新 ABI、在 Remix 重新部署、替换前端地址。当前源码未修改时，无需重新生成 ABI。

| 问题 | 检查方法 |
| --- | --- |
| 找不到 node/npm | 安装带 npm 的 Node.js，重新打开终端。 |
| 合约未配置 | 检查根目录 .env.local、实际地址，重启 Vite。 |
| 地址没有合约 | 确认是 Sepolia 部署地址，不是钱包或 Remix VM 地址。 |
| 钱包连接失败 | 解锁 MetaMask、选择 Sepolia、检查站点授权。 |
| 余额不足 | A、B 都需要测试 ETH 支付 gas。 |
| 切换账户后按钮不对 | 核对连接地址，刷新；必要时重新连接正确账户。 |

上传 GitHub 时，只上传源码、README 和配置模板。不要上传 `node_modules/`、`dist/`、`artifacts/`、`.git/`、`.DS_Store`、`.env.local` 或秘密信息。开发使用 `milestonefunddemo` 分支，不修改 main。

本项目仅面向电脑浏览器。**真实 Remix/Sepolia 手动验收仍需组员执行。** 成功众筹后，如果支持者一直不审批，资金可能长期锁定；本原型没有审批截止时间或部分退款机制。
