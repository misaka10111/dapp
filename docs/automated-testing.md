# 连续状态自动化测试

本测试从新部署的合约开始，通过本地签名交易逐步建立真实状态，验证前一步的结果能被后续操作正确使用。它补充 Sepolia 手动测试以及原先的 `eth_call + state override` 模拟测试。

## 运行

在项目根目录执行：

```powershell
npm ci
npm test
npm run build
```

依赖未变化时可直接 `npm test`。执行脚本为 `tests/milestone-fund.test.mjs`，使用 Node 内置测试运行器和 EthereumJS VM，每次创建干净的内存状态。临时账户随机生成并仅存于进程内；不读取钱包密钥、不连接 RPC，不消耗 Sepolia ETH，也不操作已经验收的项目 #002/#003。

## 编译和执行配置

| 配置 | 编译器 | 优化 | 编译目标 | 用途 |
| --- | --- | --- | --- | --- |
| repository-default | solc 0.8.24 | 开启，runs 200 | Paris | 仓库现有编译脚本的配置 |
| sepolia-reproduction | solc 0.8.34 | 关闭，runs 200 | Osaka | 已核对的现有 Sepolia 部署配置，源码单元 MilestoneFund.sol，LF 换行 |

两套编译配置均在 **Osaka VM / 本地 chain ID 31337** 下执行；没有声称测试了两个不同运行时硬分叉。依赖锁定为 `@ethereumjs/* 10.1.3`，Solidity 编译器分别由 `solc` 与 `solc-deployed` 提供。编译结果的 ABI 会与前端提交的 ABI 比较，防止接口过期。

## 场景与判据

5 类连续状态场景各执行两遍，共 10 项测试：

| 场景 | 关键验证 |
| --- | --- |
| 两阶段成功流程 | B 累计出资 50、C 出资 50；恰好 50% 不批准；分别放款 40/60；第二阶段票重从 0 开始，按原总出资作分母；Completed 且托管归零。穿插权限、重复提交/投票/提款和越阶段拒绝。 |
| 超募、舍入和小额 | 目标 100、实收 101，分配 40/61；目标 1、实收 1，第一阶段允许释放 0 并推进，第二阶段释放剩余 1；达标关闭出资、不遗漏尾数。 |
| 多项目资金隔离 | 成功项目先释放 40；失败项目两位支持者各退累计出资 25；成功项目再释放 60。每个中间状态核对合约余额等于两个项目托管总和，记录和退款标志按项目隔离。 |
| 精确截止时间 | 截止前 1 秒可出资、不可 finalize；恰好截止时不可出资、无关账户可 finalize；单纯时间经过不会自动把存储状态变为 Failed。 |
| 收款失败回滚 | 测试接收合约拒收 ETH，提款和退款必须回滚账目；允许收款后原操作能成功，金额、标志和阶段正确恢复。 |

失败交易检查回执失败、具体 revert 原因、合约 storage root 和余额不变、事件日志丢弃。普通账户的 nonce 和 gas 支出会改变，因此不比较整条链的状态根。成功提款/退款同时比较事件金额、项目余额与收款账户余额，并加回交易实际 Gas 费。

`tests/fixtures/PaymentReceiver.sol` 仅用于验证收款失败；它不是生产合约。测试时间由本地块头控制，不需要等待真实截止时间。

## 结果与范围

2026-10-22：**10/10 通过，0 失败**。最终执行输出见 [TAP 记录](evidence/automated/continuous-state.tap)；复核应以重新运行的输出为准。

这是本地合约连续交易测试，不自动覆盖网页布局、MetaMask 确认、RPC 可用性或浏览器刷新。真实 Sepolia 成功流程、失败退款、钱包操作与截图另见 [手动测试记录](e2e-test-record.md)。源码与当前链上部署的一致性由 [独立部署核验](deployment-verification.md) 证明。

参考实现 API：[EthereumJS VM 官方文档](https://github.com/ethereumjs/ethereumjs-monorepo/tree/master/packages/vm)。
