# Sepolia 端到端测试记录

## 当前结论

- 项目 #002 的成功业务流程已通过：创建、两位支持者出资、两阶段各自提交成果与审批，以及 40% / 60% 提款，共 11 笔成功交易均已取得回执。
- 最终状态为 `Completed`，项目托管余额为 0，两个阶段累计释放 `0.0001 ETH`。每个阶段 B 单独投票均为 50% 且不能通过，C 投票后为 100% 并通过。
- 重复投票、50% 时提款、第一阶段重复提款、完成后再次提款、提前结算、提前退款及重复退款共 7 项拒绝路径已通过固定区块只读模拟核验；这些模拟没有发送交易。
- 已收到按完成页复查步骤回传的 #002 顶部截图，显示 Completed、项目托管为 0，与后续固定区块状态一致；属于人工截图证据，未自动捕获浏览器刷新事件。
- 独立退款项目 #003 已通过：只筹得 `0.00003 ETH`，未达到 `0.0002 ETH` 目标；截止后结算为 Failed，B 领取原额退款，项目托管归零，重复退款被拒绝。
- 两条手动业务流程合计 15 笔成功交易、17 张原始截图均已保存。
- 连续状态自动化测试已完成：5 类场景分别使用仓库默认配置和现有 Sepolia 部署配置编译，共 10 项测试全部通过；测试交易在本地内存 EVM 中执行，未发送到 Sepolia。详见[自动化测试说明](automated-testing.md)。
- 部署复现已完成：当前合约源码按 Solidity 0.8.34、关闭优化、Osaka、源码单元名 `MilestoneFund.sol`、LF 换行编译，与固定区块的完整运行时代码（包括 metadata）逐字节一致。前端 `npm run build` 也已通过。详见[部署核验记录](deployment-verification.md)。

## 测试基准

- 日期：2026-10-22（北京时间，UTC+8）。
- 工作分支：`feat/e2e-and-deployment`。
- 测试源码提交：`75e9190d277b573131d5018836af575cb8011fbc`。
- 网络：Ethereum Sepolia，chain ID `11155111`。
- 合约：`0x9b824CA674432B390E30A5164a76c04EeAa8f686`。
- 项目：`#002` / `HQC-E2E-Success-1022`。
- 目标：`0.0001 ETH`；筹款截止：2026-10-23 18:00（北京时间）。
- 独立退款测试项目：`#003` / `HQC-E2E-Refund-1022`，目标 `0.0002 ETH`，截止 2026-10-22 11:00（北京时间）。
- 真实交易由测试者通过网页及 MetaMask 操作；本记录中的回执与状态核验仅使用只读 RPC。
- 合约源码保持上述基准提交的内容；本次补充的是测试、核验脚本和文档。固定区块 `11966764` 的运行时代码已完整匹配，准确编译输入及原始链上代码均已保存。

## 账户

| 角色 | 地址 |
| --- | --- |
| A / 项目创建者 | `0x406799E512b14CbDfCCB7EF2Acea9e6bCFB218C4` |
| B / 支持者 | `0x26791C26Fba3612Eb49FA763fA47CfEcd66b6a1E` |
| C / 支持者 | `0x3851E2C69AE098447Adc8038dC71817aBaf39bc8` |

## 已完成的操作

| 操作 | 预期 | 核验结果 | 交易 / 证据 |
| --- | --- | --- | --- |
| A 创建项目 | 项目目标为 0.0001 ETH，初始筹款及托管为 0 | PASS：补查取得回执 status=1；A 直接调用 createProject，ProjectCreated 的项目编号、创建者、目标及截止时间与区块 11966404 的初始状态相符；Funding、两阶段均未提交 | [创建交易](https://sepolia.etherscan.io/tx/0xd5fbd668c4046fcd56d19bbf2d9b8e77496f5fa2b8a1df2176938c93930f2ced)；`01-project-created.png` |
| B 出资 0.00005 ETH | 筹款 50%，继续 Funding | PASS：回执 status=1；交易调用 contribute(2)，value=50000000000000 wei；ContributionReceived 事件金额及地址一致；页面显示 50% | [B 的交易](https://sepolia.etherscan.io/tx/0x6bc8c49885a02a4e09ca36963bbdfe402fcef420a55befaa879a7cd39fb04a19)；`02-b-funded-50-percent.png` |
| C 出资 0.00005 ETH | 累计 0.0001 ETH，立即 Successful | PASS：回执 status=1；contribute(2) 金额正确；同一回执包含 ContributionReceived 与 FundingSuccessful(projectId=2,totalRaised=100000000000000) | [C 的交易](https://sepolia.etherscan.io/tx/0x69e08785c3725d6eed03cc69d74a983dd4a365456e9a72628f8397b2fed69c0b)；`03-funded-100-percent.png` |
| A 提交第一阶段成果 | 第一阶段进入 In review，初始审批权重为 0 | PASS：回执 status=1；A 调用 submitEvidence(2,0,...)，EvidenceSubmitted 的文字及链接与页面一致；submitted=true、approved=false、approvalWeight=0 | [成果提交交易](https://sepolia.etherscan.io/tx/0xd70e3aff6fd5adc3f9d18c1b6a44945ddc98fc7dbe39ced86eb67cd7517fef04)；`04-milestone-1-in-review.png` |
| B 单独批准第一阶段 | 权重恰好 50%，阶段尚未通过 | PASS：回执 status=1；B 调用 approveMilestone(2,0)，ApprovalCast 权重为 50000000000000 wei；approved=false，页面仍为 In review | [B 首次审批交易](https://sepolia.etherscan.io/tx/0x2891bf404058a864dc474237fb5f99a94e02ce75df972e32ff4b42b11646f4f3)；`05-milestone-1-b-approved-50-percent.png` |
| 50% 时 A 尝试提款（只读模拟） | 合约拒绝提款 | PASS：在区块 11966534 以 A 为 from，eth_call withdrawMilestone(2,0) 回滚 Milestone not withdrawable；未发送交易、未支付 Gas | `milestone-1-b-approval-11966534.json` 中 readOnlyChecks |
| B 重复审批（只读模拟） | 合约拒绝同一支持者重复投票 | PASS：在同一区块以 B 为 from，eth_call approveMilestone(2,0) 回滚 Already approved；未发送交易、未支付 Gas | `milestone-1-b-approval-11966534.json` 中 readOnlyChecks |
| C 批准第一阶段 | 累计权重达到 100%，阶段批准 | PASS：回执 status=1；C 调用 approveMilestone(2,0)，包含 ApprovalCast 与 MilestoneApproved(2,0)；approvalWeight=100000000000000 wei、approved=true；尚未提款 | [C 首次审批交易](https://sepolia.etherscan.io/tx/0xc5f2356e29f4e3efa651d1f418d6ab52132d174005d6b7cf9005ce9fe8e72253)；`06-milestone-1-approved-100-percent.png` |
| A 第一阶段提款 | 释放 0.00004 ETH，托管剩余 0.00006 ETH，进入第二阶段 | PASS：回执 status=1；A 调用 withdrawMilestone(2,0)，FundsWithdrawn 金额为 40000000000000 wei；第一阶段 withdrawn=true，项目 currentMilestone=1、escrowBalance=60000000000000 wei | [第一阶段提款交易](https://sepolia.etherscan.io/tx/0x9cfb87e7bfd0b00af3f42dd8f80cdbecaff96c38200684ad7fbc7023a62e941f)；`07-milestone-1-released.png` |
| A 重复提取第一阶段（只读模拟） | 合约拒绝重复提款 | PASS：在区块 11966558 以 A 为 from，eth_call withdrawMilestone(2,0) 回滚 Wrong milestone，因为当前里程碑已推进至索引 1；未发送交易、未支付 Gas | `milestone-1-withdrawal-11966558.json` 中 readOnlyChecks |
| A 提交第二阶段成果 | 第二阶段进入 In review，审批权重为 0 | PASS：回执 status=1；A 调用 submitEvidence(2,1,...)，EvidenceSubmitted 文字及链接与页面一致；第二阶段 submitted=true、approved=false、approvalWeight=0；托管仍为 0.00006 ETH | [第二阶段成果提交交易](https://sepolia.etherscan.io/tx/0x0b101e99c5b2086f924422243404536a73bc041f14e3869daf30eaba9f0979fb)；`08-milestone-2-in-review.png` |
| B 单独批准第二阶段 | 权重恰好 50%，阶段尚未通过 | PASS：回执 status=1；本合约发出的 ApprovalCast 记录 projectId=2、milestone=1、backer=B、weight=50000000000000 wei；第二阶段 approved=false、B 已投票而 C 尚未投票；该笔采用包装调用路径，顶层目标地址不是本合约 | [B 第二阶段审批交易](https://sepolia.etherscan.io/tx/0x936b5a5f82a32d9eb1ca0d0ddc6e1d2eb5c1629793210530825cc85f72331517)；`09-milestone-2-b-approved-50-percent.png` |
| C 批准第二阶段 | 累计权重达到 100%，阶段批准 | PASS：回执 status=1；C 调用 approveMilestone(2,1)，包含 ApprovalCast 与 MilestoneApproved(2,1)；approvalWeight=100000000000000 wei、approved=true；剩余 0.00006 ETH 尚未提取 | [C 第二阶段审批交易](https://sepolia.etherscan.io/tx/0x4a39eac1c34b8498d21abda8c8eb102fedb0f2f419a3d2d3432446d9740a28a8)；`10-milestone-2-approved-100-percent.png` |
| A 第二阶段提款 | 释放剩余 0.00006 ETH；Completed；项目托管归零 | PASS：回执 status=1；A 调用 withdrawMilestone(2,1)，FundsWithdrawn 金额为 60000000000000 wei，并触发 ProjectCompleted(2)；状态=3、currentMilestone=2、escrowBalance=0；两阶段累计释放等于总筹款 | [最终提款交易](https://sepolia.etherscan.io/tx/0x96c60c2f0f292f642c966216b7f027127024da7f14d363b5e7523b4557f39569)；`11-milestone-2-ready-to-withdraw.png`、`12-milestone-2-released.png` |
| 项目完成后再次提款（只读模拟） | 合约拒绝再次提款 | PASS：在区块 11966612 以 A 为 from，eth_call withdrawMilestone(2,1) 回滚 Project not successful；未发送交易、未支付 Gas | `milestone-2-withdrawal-11966612.json` 中 readOnlyChecks |
| 完成页复查（人工截图） | 完成页显示 Completed、项目托管为 0 | PASS（人工截图核对）：按刷新复查步骤回传的截图显示 Completed、Held in escrow=0 ETH 及两阶段全部释放提示，与区块 11966656 的项目 #002 状态一致；未自动捕获刷新事件 | `13-completed-overview.png`；后续状态见项目 #003 出资证据中的 latestObservation.completedProject2 |

项目 #002 图片位于 `docs/evidence/2026-10-22-project-002/`；项目 #003 图片位于 `docs/evidence/2026-10-22-project-003/`。均为测试者提供的原始截图副本。

## 固定区块快照

### 创建后（补查创建交易）

- 区块：`11966404`，区块时间：2026-10-22 09:55:00（北京时间）。
- 区块哈希：`0x8b7daba16642bf10fd98a850d8806c0ca2fb2db73d286ab72d35f816c2fc813c`。
- 项目 `Funding`、`currentMilestone=0`、`totalRaised=escrowBalance=0`；目标 `0.0001 ETH`，截止 `1792749600`；两个里程碑均未提交、批准或提款。
- 完整交易、回执、事件和固定区块状态：[原始 JSON](evidence/2026-10-22-project-002/project-creation-11966404.json)。

### 筹款成功后

- 区块：`11966479`，区块时间：2026-10-22 10:10:00（北京时间）。
- 区块哈希：`0x1b0e7dc9e4967863341b602b3059677f8cb0f52eead01a92c9b189941d323726`。
- B 出资交易区块：`11966421`；C 出资交易区块：`11966443`。
- 状态：`Successful`（枚举值 1）；当前里程碑索引 0，即第一阶段。
- `totalRaised = escrowBalance = 0.0001 ETH`。
- B、C 记录的出资各为 `0.00005 ETH`，每人占总出资 50%。
- 两个里程碑均未提交成果、未批准、未提款；approvalWeight 和 withdrawnAmount 均为 0。
- 完整交易、回执、事件与固定区块状态：[原始 JSON](evidence/2026-10-22-project-002/contributions-11966479.json)。

### 第一阶段成果提交后

- 区块：`11966501`（成果提交交易所在区块），区块时间：2026-10-22 10:14:24（北京时间）。
- 区块哈希：`0x39d2a66ab3fe32463209857a55dbc88e111dbf8d530e5f7065957b970f21b430`。
- 第一阶段：`submitted=true`、`approved=false`、`withdrawn=false`，审批权重和已提款金额均为 0；页面显示 `In review`、`0%`。
- 第一阶段成果链接：`https://github.com/misaka10111/dapp`。
- 项目仍为 `Successful`，当前里程碑索引 0；`totalRaised = escrowBalance = 0.0001 ETH`。第二阶段仍未提交。
- 完整交易、回执、事件与固定区块状态：[原始 JSON](evidence/2026-10-22-project-002/milestone-1-evidence-11966501.json)。

### B 首次审批后：恰好 50% 的边界

- 区块：`11966534`（B 首次审批交易所在区块），区块时间：2026-10-22 10:21:00（北京时间）。
- 区块哈希：`0xb5f6ad90e8902fdb72b7bb681f8897cca689bb12ad66ddeb09dd1b36dd0146f7`。
- 第一阶段：`approvalWeight = 0.00005 ETH`，占 `totalRaised = 0.0001 ETH` 的 50%；`submitted=true`、`approved=false`、`withdrawn=false`、`withdrawnAmount=0`。
- B 的 `hasApproved=true`，C 的 `hasApproved=false`；两人的出资权重仍各为 `0.00005 ETH`。
- 项目仍为 `Successful`，当前里程碑索引 0，托管余额仍为 `0.0001 ETH`。
- 同一区块的只读 `eth_call` 确认：A 提款回滚 `Milestone not withdrawable`，B 重复审批回滚 `Already approved`。两项是基于真实链上状态的模拟调用，未产生交易回执，也未改变链上状态。
- 完整交易、回执、事件、固定区块状态及两项回滚数据：[原始 JSON](evidence/2026-10-22-project-002/milestone-1-b-approval-11966534.json)。

### C 审批后：第一阶段通过

- 区块：`11966546`（C 首次审批交易所在区块），区块时间：2026-10-22 10:23:24（北京时间）。
- 区块哈希：`0x13e0d65e832210c1b993abde23f1b2e10dc28a69b812e7bda8159588d6428fe2`。
- 对比前一区块 `11966545`：第一阶段由权重 `0.00005 ETH`、`approved=false` 变为权重 `0.0001 ETH`、`approved=true`，页面显示 `100%` 和 `Approved`。
- B、C 的 `hasApproved` 均为 true；第一阶段仍为 `withdrawn=false`、`withdrawnAmount=0`。
- 项目仍为 `Successful`，当前里程碑索引 0；托管余额仍为 `0.0001 ETH`，审批本身未释放资金。第二阶段尚未提交、批准或提款。
- 完整交易、回执、事件及前后区块状态：[原始 JSON](evidence/2026-10-22-project-002/milestone-1-c-approval-11966546.json)。

### 第一阶段提款后：释放 40%，进入第二阶段

- 区块：`11966558`（第一阶段提款交易所在区块），区块时间：2026-10-22 10:25:48（北京时间）。
- 区块哈希：`0x0c581d6319f59797cc21b51442fb407881424b3d2a5a91ed71d93959867a2b99`。
- 对比前一区块 `11966557`：托管余额由 `0.0001 ETH` 降为 `0.00006 ETH`，减少量与 FundsWithdrawn 事件及第一阶段 `withdrawnAmount = 0.00004 ETH` 一致。
- 第一阶段 `withdrawn=true`，页面显示 `Released: 0.00004 ETH`；项目 `currentMilestone=1`，即进入第二阶段，状态仍为 `Successful`。
- `totalRaised` 仍为 `0.0001 ETH`；第二阶段 `submitted=false`、`approved=false`、`withdrawn=false`、`approvalWeight=0`。B、C 对第二阶段的 `hasApproved` 均为 false，需要分别重新投票。
- 同一区块只读模拟 A 再次提取第一阶段，回滚 `Wrong milestone`；没有发送第二笔提款交易。
- 完整交易、回执、事件、前后区块状态及重复提款回滚数据：[原始 JSON](evidence/2026-10-22-project-002/milestone-1-withdrawal-11966558.json)。

### 第二阶段成果提交后

- 区块：`11966571`（第二阶段成果提交交易所在区块），区块时间：2026-10-22 10:28:24（北京时间）。
- 区块哈希：`0x3e7050462d78a71d2221591e543a8a84bed800094b68c265c8228789010f9930`。
- 第二阶段 `submitted=true`、`approved=false`、`withdrawn=false`、`approvalWeight=0`、`withdrawnAmount=0`；页面显示 `In review`、`0%`，阶段预算为 `0.00006 ETH`。
- B、C 对第二阶段的 `hasApproved` 均为 false，第一阶段的投票没有自动计入第二阶段。
- 第一阶段仍为已释放，提款金额 `0.00004 ETH`；项目 `currentMilestone=1`、状态 `Successful`，`totalRaised=0.0001 ETH`、`escrowBalance=0.00006 ETH`。
- 完整交易、回执、事件与固定区块状态：[原始 JSON](evidence/2026-10-22-project-002/milestone-2-evidence-11966571.json)。

### B 第二阶段审批后：仍按原始出资计算 50%

- 区块：`11966583`（B 第二阶段审批交易所在区块），区块时间：2026-10-22 10:30:48（北京时间）。
- 区块哈希：`0x11bb47d1551926beae309aece12993d9ed6ff0a7d307d3cdf3e77ec8faee7f23`。
- 第二阶段 `approvalWeight=0.00005 ETH`、`approved=false`、`withdrawn=false`；B 的 `hasApproved=true`、C 的 `hasApproved=false`，页面显示 `50%`、`In review`。
- 分母仍为 `totalRaised=0.0001 ETH`；托管剩余 `0.00006 ETH` 不改变审批权重。第一阶段已提款金额仍为 `0.00004 ETH`。
- 该笔交易由 B 发出，value=0，顶层目标为 `0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3`，不是 MilestoneFund 合约；本合约的 ApprovalCast 事件与固定区块状态确认审批已生效，不能把该笔描述为顶层直接调用 approveMilestone。
- 顶层 calldata 与 `redeemDelegations(bytes[],bytes32[],bytes[])` 的选择器及 ABI 编码匹配；解码得到的一条 executionCallData 包含 MilestoneFund 目标地址、value=0 和 `approveMilestone(2,1)`。此项为 calldata 解码核验，未执行交易 trace。
- 完整交易、回执、事件与固定区块状态：[原始 JSON](evidence/2026-10-22-project-002/milestone-2-b-approval-11966583.json)。

### C 审批后：第二阶段通过

- 区块：`11966586`（C 第二阶段审批交易所在区块），区块时间：2026-10-22 10:31:24（北京时间）。
- 区块哈希：`0xc100ca08082e61a4c9f774bf6923ddc17446ed8db41784ab7cbbf74e1b6c2385`。
- 对比前一区块 `11966585`：第二阶段从权重 `0.00005 ETH`、`approved=false` 变为权重 `0.0001 ETH`、`approved=true`，页面显示 `100%`、`Approved`。
- B、C 对第二阶段的 `hasApproved` 均为 true。第二阶段 `withdrawn=false`、`withdrawnAmount=0`；第一阶段已提款金额仍为 `0.00004 ETH`。
- 项目仍为 `Successful`、`currentMilestone=1`、`totalRaised=0.0001 ETH`、`escrowBalance=0.00006 ETH`；最终提款尚未发生，项目尚未进入 Completed。
- 完整交易、回执、事件及前后区块状态：[原始 JSON](evidence/2026-10-22-project-002/milestone-2-c-approval-11966586.json)。

### 第二阶段提款后：项目完成

- 区块：`11966612`（最终提款交易所在区块），区块时间：2026-10-22 10:36:48（北京时间）。
- 区块哈希：`0x995e5144983aaf9ff686a9ad50a48fb3793ba96aa8694702410074af381c8dc6`。
- 对比前一区块 `11966611`：状态从 `Successful` 变为 `Completed`（枚举值 3），`currentMilestone` 从 1 变为 2；项目托管从 `0.00006 ETH` 变为 0。
- 第一阶段 `withdrawnAmount=0.00004 ETH`，第二阶段 `withdrawnAmount=0.00006 ETH`，两阶段 `withdrawn=true`；累计释放 `0.0001 ETH`，等于 `totalRaised`。
- 回执同时包含 `FundsWithdrawn(2,1,60000000000000)` 与 `ProjectCompleted(2)`；第二阶段页面显示 `Released: 0.00006 ETH`。
- 相邻区块末余额观察：A 的余额变化加回本次 Gas 费后为 `60000000000000 wei`，与提款金额一致；整个合约余额减少量也为该金额。合约全局余额仍为 `0.0005 ETH`，本项目托管余额为 0，两者不能混淆。相邻区块余额比较可能受其他交易影响，本次观察金额吻合。
- 同一区块只读模拟 A 再次提款，回滚 `Project not successful`，未发送交易。
- 当时用户提供了提款前按钮和提款后阶段截图；随后已补交项目顶部 Completed、托管为 0 的截图 `13-completed-overview.png`，完成页复查通过。刷新动作未由自动化独立捕获。
- 完整交易、回执、事件、前后区块状态、余额观察和重复提款回滚数据：[原始 JSON](evidence/2026-10-22-project-002/milestone-2-withdrawal-11966612.json)。

## 独立退款项目 #003

- 项目名称：`HQC-E2E-Refund-1022`；创建者 A；目标 `0.0002 ETH`；截止 `1792638000`，即 2026-10-22 11:00:00（北京时间）。
- 阶段目标：`Deliver the prototype.` 和 `Deliver the final demo.`。

| 操作 | 预期 | 核验结果 | 交易 / 证据 |
| --- | --- | --- | --- |
| A 创建退款测试项目 | Funding，目标 0.0002 ETH，初始筹款及托管为 0 | PASS：回执 status=1；ProjectCreated 记录项目 3、A、目标和截止；创建区块状态与参数相符。顶层为包装调用，解码出的内层 createProject 参数一致 | [创建交易](https://sepolia.etherscan.io/tx/0x91a97815ddb95f1568707dd3bc7c8537b85ba5770dd59058bb6ca19c898e3ca1)；`project-creation-11966641.json` |
| B 出资 0.00003 ETH | 目标完成度 15%，继续 Funding | PASS：回执 status=1；B 直接调用 contribute(3)，value=30000000000000 wei；ContributionReceived 事件一致，无 FundingSuccessful；出资、总筹款及托管均为 0.00003 ETH，refunded=false | [B 出资交易](https://sepolia.etherscan.io/tx/0x0aab5ef7f63041f863e6b942ce80f286eda016d46fba5a1dc42721c853718fb4)；`01-funded-15-percent.png`、`contribution-11966646.json` |
| 到期前结算（只读模拟） | 合约拒绝提前结算 | PASS：在区块 11966646 以 B 为 from，eth_call finalizeFunding(3) 回滚 Deadline not reached；未发送交易、未支付 Gas | 出资证据中的 readOnlyChecks |
| 尚未失败时退款（只读模拟） | 合约拒绝提前退款 | PASS：在同一区块以 B 为 from，eth_call claimRefund(3) 回滚 Project not failed；未发送交易、未支付 Gas | 出资证据中的 readOnlyChecks |
| B 到期后结算 | Funding 转为 Failed，开放退款，托管暂不变 | PASS：回执 status=1；B 直接调用 finalizeFunding(3)，产生 FundingFailed(3)；回执区块时间超过截止，状态由 0 变为 2，托管仍为 0.00003 ETH，B 尚未退款 | [结算交易](https://sepolia.etherscan.io/tx/0x067497600a670f6660090ee4b23334beb8ca3e5a3d10dbdc2e6332244bb3af83)；`02-awaiting-finalization.png`、`03-failed-refund-available.png` |
| B 领取退款 | 原始出资 0.00003 ETH 退回 B，项目托管归零 | PASS：回执 status=1；包装交易解码出的内层调用为 claimRefund(3)，RefundClaimed 记录 B 和 30000000000000 wei；refunded=true，escrowBalance=0，历史 totalRaised 和 contribution 保留 | [退款交易](https://sepolia.etherscan.io/tx/0xcb774a9adad688000b85c79246ce497e01321dbdb926632ff7892f5109bb3842)；`04-refunded-escrow-zero.png` |
| B 重复领取退款（只读模拟） | 合约拒绝重复退款 | PASS：在区块 11966731 以 B 为 from，eth_call claimRefund(3) 回滚 No refund available；未发送交易、未支付 Gas | `claim-refund-11966731.json` 中 readOnlyChecks |

### 创建与出资快照

- 创建区块 `11966641`，2026-10-22 10:42:48（北京时间）；区块哈希 `0x101a82359cbf7c243c5e0ffe8dbb5b51f867c80f389af41b7f14120edf4ef0af`。状态 Funding，初始总筹款和托管均 0，两个阶段均未提交。
- B 出资区块 `11966646`，2026-10-22 10:43:48（北京时间）；区块哈希 `0xe2703aaa42a679df6beb114df965ea0dfbea2e8671851548dfe203a880be2a5a`。
- 出资后 `totalRaised=escrowBalance=0.00003 ETH`，`target=0.0002 ETH`、`status=Funding`、`currentMilestone=0`；B 出资记录为 0.00003 ETH，`refunded=false`。
- 后续核验区块 `11966656`，2026-10-22 10:45:48（北京时间）；区块哈希 `0x65ababefb984ee4656d82051dc36d6493348e9afb30892c2275fe8f8406940d2`。当时距截止尚有 852 秒，仍未结算或退款。项目 #002 同区块仍为 Completed、托管为 0。
- 证据：[创建 JSON](evidence/2026-10-22-project-003/project-creation-11966641.json)、[出资、拒绝路径及后续状态 JSON](evidence/2026-10-22-project-003/contribution-11966646.json)。

### 到期结算后：开放退款

- 区块：`11966728`，2026-10-22 11:00:24（北京时间），晚于截止 24 秒。
- 区块哈希：`0x73a74e96e116828b037afae3ed47f4346898662f022fbc76780e9107810c433f`。
- 对比前一区块 `11966727`，项目从 `Funding`（0）变为 `Failed`（2）；`target=0.0002 ETH`、`totalRaised=0.00003 ETH`、`escrowBalance=0.00003 ETH` 均未改变。
- B 的 `contribution=0.00003 ETH`、`refunded=false`。结算只开放退款，没有自动返还资金；页面显示 `Failed` 和 `Claim refund · 0.00003 ETH`。
- 证据：[结算 JSON](evidence/2026-10-22-project-003/finalize-funding-11966728.json)。

### 领取退款后：原额返还、托管归零

- 区块：`11966731`，2026-10-22 11:01:00（北京时间）。
- 区块哈希：`0x82d86f311854bb1c41c83c6ddbde189eec30fb9400bc18f655ea1fbc63b34443`。
- 对比前一区块 `11966730`，项目托管从 `0.00003 ETH` 变为 0；B 的 `refunded` 从 false 变为 true；状态仍为 `Failed`，历史 `totalRaised` 和 B 的 `contribution` 仍为 `0.00003 ETH`。
- 合约事件 `RefundClaimed(3,B,30000000000000)` 确认退款金额；相邻区块末 B 的余额变化加回本次 Gas 费后为 `30000000000000 wei`，合约余额减少量也为该金额。余额差可能受同区块其他交易影响，本次观察金额吻合。
- 该笔顶层为 `redeemDelegations(bytes[],bytes32[],bytes[])` 包装路径；按匹配 ABI 解码得到唯一内层目标为 MilestoneFund、value=0、`claimRefund(3)`。未请求交易 trace，未推断钱包配置。
- 固定区块只读模拟 B 再次执行 `claimRefund(3)`，回滚 `No refund available`，防重复退款验证通过。
- 两个里程碑仍未提交、批准或提款；截图显示 `Your original contribution has been refunded.`，Held in escrow 为 0。
- 证据：[退款、余额观察及重复退款拒绝 JSON](evidence/2026-10-22-project-003/claim-refund-11966731.json)。

## 自动化测试与部署核验

| 测试 | 预期 | 状态 |
| --- | --- | --- |
| 连续状态自动化测试 | 对每一步的余额、权重及阶段变化进行断言 | PASS：两组编译配置各 5 类场景，合计 10/10；包括完整放款、超额筹款与取整、多项目隔离及退款、截止边界、收款失败回滚与重试。见[实际运行输出](evidence/automated/continuous-state.tap) |
| 部署复现 | 记录编译器完整版本、优化配置、EVM 版本并核对部署 | PASS：`0.8.34+commit.80d5c536.Emscripten.clang`、优化关闭、Osaka；15,664 字节完整 runtime 与区块 11966764 一致，保存的输入离线复编也一致。见[核验结果](evidence/deployment/verification-11966764.json) |
| 前端构建 | 测试工具接入后生产构建正常 | PASS：`npm run build` 退出码 0 |

两组编译配置的测试均在本地 Osaka EVM 中执行；这是两种编译产物的业务测试，不是两种执行硬分叉环境的覆盖。运行方法和断言范围见[自动化测试说明](automated-testing.md)。

## 操作观察与限制

- 创建过程中曾出现 `could not coalesce error` 提示；随后页面出现了成功创建的项目 #002。已补查到成功创建交易，但尚未取得该错误对应的底层信息，不能确定其原因或是否与成功创建属于同一次尝试。
- 切换到 B 后，MetaMask 最初显示 B 尚未连接 localhost:5173；授权连接后网页切换到 B，随后出资成功。
- 页面隐藏或禁用某个按钮只能作为界面权限检查；直接调用合约被拒绝需要另有调用结果或回执证据。
- 成功放款和失败退款两条手动业务流程、上述本地连续状态测试、部署运行时代码复现及前端构建均已通过。完成页通过人工截图复查，没有执行浏览器自动化刷新测试；这些结果不等于覆盖所有可能输入或完成安全审计。
