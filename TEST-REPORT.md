# MilestoneFund 测试报告

- **测试对象**：`misaka10111/dapp` 分支 `milestonefunddemo`（commit `HEAD`）
- **合约**：Sepolia `0x9b824CA674432B390E30A5164a76c04EeAa8f686`
- **测试日期**：2026-10-21
- **测试范围**：合约逻辑（创建 / 出资 / 审批 / 提款 / 退款 / 权限 / 边界）、前端只读流程、构建、交接配置

---

## 一、结论

| 项目 | 结果 |
| --- | --- |
| 合约逻辑（66 项断言） | **全部通过**，包括审批、提款、退款、50% 边界、超额出资、取整尾差 |
| 前端只读流程（列表 / 详情 / 状态徽章 / 金额） | 正常，读到的链上数据与合约一致 |
| `npm ci` / `npm run build` | 通过（484 kB JS，gzip 165 kB） |
| 合约与 ABI 是否匹配 | 匹配，13 个函数选择器在链上字节码中全部存在 |
| **阻塞级问题** | **1 个：群里的合约地址校验和不正确，直接粘贴会让页面完全不可用**（已修复，见第二节） |
| 交接文件缺失 | `.env.example`、`.gitignore`、`vite.config.js` 都不在仓库里，README 的步骤跑不通（已补齐） |

一句话：**合约本身是好的，前后端对接也没问题；卡住组员的是"地址 + 三个缺失的配置文件"，不是业务逻辑。**

---

## 二、阻塞问题：合约地址校验和不正确

群消息里的地址：

```
0x9b824CA674432B390E30A5164a76c04eEaa8f686   ← isAddress() = false
0x9b824CA674432B390E30A5164a76c04EeAa8f686   ← 正确（注意 04EeAa 的大小写）
```

这串地址的十六进制数字是对的，但 **EIP-55 大小写校验和算错了**（`04eEaa` 应为 `04EeAa`）。ethers v6 的 `isAddress()` 对混合大小写地址会校验校验和，所以：

```
CONFIGURED = isAddress(CONTRACT_ADDRESS) && ...  →  false
```

页面直接进入"配置异常"分支，显示 `Configuration needs attention / Invalid contract address`，项目列表为空、所有按钮禁用。**表现看起来像"合约没部署"或"代码坏了"，实际上是地址字符串大小写的问题。**

已做两件事：

1. **`src/contract.js` 增加容错**：混合大小写校验失败时，用全小写重试一次（十六进制值不变，因此不会指向错误合约）。现在粘贴群里那串地址也能正常工作。
2. 报告里记录正确写法：`0x9b824CA674432B390E30A5164a76c04EeAa8f686`，或全小写 `0x9b824ca674432b390e30a5164a76c04eeaa8f686`。

> 建议：以后在群里发地址时用代码块或直接发全小写，聊天软件/输入法改大小写是很常见的。

---

## 三、其他发现（按严重度）

| 级别 | 问题 | 影响 | 处理 |
| --- | --- | --- | --- |
| P0 | 仓库里没有 `.env.example` | README 第 4 节 `cp .env.example .env.local` 直接失败，组员不知道要填哪几个变量 | **已补** |
| P0 | 仓库里没有 `.gitignore` | 组员很容易把 `node_modules/`、`dist/`、`.env.local` 提交上去；`.env.local` 一旦进仓库，别人 clone 后会用错地址 | **已补** |
| P1 | 链上字节码与 README 的编译参数不一致 | README 要求"Optimization 开、runs 200、EVM paris"，实际部署的是**未开优化 + shanghai**（字节码里有 `PUSH0`）：README 参数编出 9,143 字节，链上 15,611 字节，未开优化 + shanghai 编出 15,617 字节（差 6 字节，应是 solc 小版本不同）。**功能无影响**（13 个函数选择器全部匹配，ABI 可直接用），但"照 README 重新部署"得到的不是同一份字节码 | 建议 README 改成实际参数（Remix 默认：不开优化、shanghai），或按 README 重新部署一次 |
| P2 | 缺 `vite.config.js` | `@vitejs/plugin-react` 装了但从未启用：没有 HMR，改代码要手动刷新；且 JSX 走经典运行时，新组件忘了 `import React` 会报错 | **已补** |
| P2 | 不配 `VITE_SEPOLIA_RPC_URL` 时，**只读浏览也依赖 MetaMask** | `readProvider()` 在 RPC 为空时回落到 `BrowserProvider`，没装钱包/没切 Sepolia 的组员连项目列表都看不到，报错信息也不直观 | 建议 README 里把 RPC 那行标成"强烈建议填"，或内置一个公共 RPC 兜底 |
| P3 | Funding 阶段就显示 `Budget after successful funding: 0.0002 ETH` | 这个数字是按**当前已筹**算的，还会随新出资变化，容易被当成最终预算 | 建议改成"预计预算（按当前 0.0005 ETH 计）"或直接显示 `--` |
| P3 | 交易提示条不会自动消失 | 上一次的失败提示会一直挂在页面上 | 建议 5–8 秒后自动收起，或下次操作时清空 |
| P3 | `body { min-width: 1000px }` | 小屏幕横向滚动。README 已声明只支持桌面，可接受 | 若要美化，顺手加个 900px 以下的断点 |
| P3 | 详情面板在项目列表下方 | 点卡片后要自己往下滚才能看到详情，选中态也不明显 | 建议选中后 `scrollIntoView`，或改成右侧抽屉 |
| P3 | 顶部品牌名 `href="#"` | 点击会跳到页面顶部并改写 URL hash | 改成 `href="/"` 或 `button` |

---

## 四、测试是怎么做的（不用测试币）

千鳥卡住的地方是"审批、提款、退款没测完，Sepolia 测试币不够"。这两个流程都需要**多笔真实交易 + 两个账户**，没有币确实测不动。

这里换了个办法：**用 `eth_call` + state override，把链上真实的 runtime bytecode 放到一个测试地址上，手工构造出"已达标 / 已提交成果 / 已投票 / 已过期"等状态，再调用函数看它是否按预期通过或 revert**。`eth_call` 不广播、不花 gas、不需要私钥，但执行的是**同一份部署在链上的字节码**，所以能验证 require 条件、金额计算和状态机。

- **A 组（16 项）**：直接对真实合约的真实状态调用，验证权限和参数校验。
- **B 组（29 项）**：构造状态，验证审批 / 提款 / 退款 / 阶段顺序 / 重复操作。其中"提款金额"用**托管余额探针**验证：例如总额 100 wei 时，托管放 39 wei 必然下溢 revert、放 40 wei 刚好成功，即可确认第一阶段金额确实是 `floor(2×100/5)=40`。
- **C 组（21 项）**：前端 `src/utils.js` 与合约公式对齐（40/60 拆分 317 组金额逐一比对、`positiveEth` 非法输入、`safeUrl` 伪协议、错误信息映射）。

### 结果汇总

```
================ 66/66 passed, 0 failed ================
A 组 16/16   B 组 29/29   C 组 21/21
```

代表性用例：

| 用例 | 预期 | 结果 |
| --- | --- | --- |
| 达标项目：未出资者审批 | revert `Backers only` | PASS |
| 未提交成果时审批 | revert `Approval not open` | PASS |
| 已通过后再次审批 / 重复投票 | revert `Approval not open` / `Already approved` | PASS |
| 阶段未批准时提款 | revert `Milestone not withdrawable` | PASS |
| 阶段已提款再提款 | revert `Milestone not withdrawable` | PASS |
| 非发起人提款 | revert `Creator only` | PASS |
| 总额 100 wei，托管 39 wei 提款 | revert（算术下溢）→ 证明 M1 = 40 wei | PASS |
| 总额 0.012 ETH 超额出资，托管 0.0048-1 提款 | revert → 证明 M1 = 0.0048 ETH | PASS |
| 阶段 2 提款（当前阶段 = 1） | 成功，取走全部剩余托管 | PASS |
| 阶段 1 未提款就提交阶段 2 成果 | revert `Wrong milestone` | PASS |
| 失败项目：支持者退款 | 成功，托管清零、`totalRaised` 保留 | PASS |
| 失败项目：重复退款 / 未出资者退款 | revert `No refund available` | PASS |
| 成功项目退款 / 成功项目 finalize | revert `Project not failed` / `Funding closed` | PASS |
| 过期未达标 finalize | 成功（任何人可调用） | PASS |
| 过期后继续出资 | revert `Deadline reached` | PASS |
| 发起人给自己出资 / 0 金额出资 | revert `Creator cannot contribute` / `Contribution must be positive` | PASS |
| 前端 40/60 预算 vs 合约 `floor(2t/5)` | 317 组金额完全一致 | PASS |

### 链上现状快照（2026-10-21 19:xx）

| # | 名称 | 状态 | 目标 | 已筹 | 托管 | 截止时间 |
| --- | --- | --- | --- | --- | --- | --- |
| 0 | DemoProject | Funding | 0.005 | 0.0005 | 0.0005 | 2026-10-22 18:13 |
| 1 | Demo project 2 | Funding | 0.0001 | 0 | 0 | 2026-10-22 18:19 |

合约余额 `0.0005 ETH` = 两个项目托管之和，账实相符。两个项目都还是 Funding 状态、没有提交过成果 —— 和"审批/提款/退款还没测"的说法一致。

---

## 五、还需要人工用测试币验证的部分

模拟测试能覆盖 require 条件和金额计算，但**覆盖不到钱包交互本身**。以下建议由有 Sepolia ETH 的同学用两个账户（A 发起人、B 支持者）走一遍：

| 场景 | 关注点 |
| --- | --- |
| 真实签名 + 等待确认 | 提示条依次出现"等待钱包确认 → 交易处理中 → 已确认" |
| 在 MetaMask 里点拒绝 | 显示"Request rejected in MetaMask"，可以重试，不能显示成功 |
| 余额不足（出资额 > 余额） | 显示"Insufficient Sepolia ETH for the amount and gas" |
| 中途切换账户 / 切换网络 | 地址、角色按钮、Sepolia 提示同步更新；旧账户的"你已投票"状态不残留 |
| 刷新页面 | 金额、成果、审批权重、提款记录从链上正确读回 |
| Etherscan | 每笔交易可查且状态为 Success，金额与页面一致 |
| 完整 0.01 ETH 流程 | 提款 0.004 + 0.006，托管归零，状态变 Completed |

前端代码里 `transact()` 已经做了"每次重新取 signer + 校验账户未变 + 等 1 个确认 + 检查 receipt.status"，这部分实现是可靠的，主要待验证的是真实钱包下的 UI 反馈。

---

## 六、本次改动清单

| 文件 | 改动 |
| --- | --- |
| `.env.example` | 新增：`VITE_CONTRACT_ADDRESS` / `VITE_SEPOLIA_RPC_URL` 模板 + 说明 |
| `.gitignore` | 新增：忽略 `node_modules/`、`dist/`、`.env.local`、测试产物 |
| `vite.config.js` | 新增：启用 `@vitejs/plugin-react`，固定端口 5173 |
| `src/contract.js` | 地址校验和容错（大小写不一致时按全小写重试） |
| `simulate-tests.mjs` | 新增：66 项模拟测试，`node simulate-tests.mjs` 可复跑 |
| `verify.mjs` | 新增：链上状态 + ABI/字节码一致性检查 |

> 这两个脚本只用于测试，不参与前端构建；不想留在仓库里可以直接删。

---

## 七、建议的下一步

1. **先修地址**：`.env.local` 用 `0x9b824CA674432B390E30A5164a76c04EeAa8f686`（或拉这次改动，容错已生效）。
2. **谁有币谁走第五节**，把交易哈希和截图贴回群里。
3. **UI 美化**（千鳥提到"比较简陋"），按投入产出排序：
   - 详情面板改成右侧抽屉或选中后自动滚动，避免"点了卡片没反应"的错觉；
   - 加一个"我的项目 / 我出资的 / 待我审批"的筛选，组员测试时不用在一堆项目里找；
   - 进度条和状态徽章配色区分（Funding / Successful / Failed / Completed 现在都是灰蓝红黑，辨识度一般）；
   - 空状态和加载态补 skeleton，15 秒轮询加个"刚刚更新"的时间戳；
   - 加 900px 断点，至少能在平板上看。
4. **合约层面**（可选，答辩时是加分点）：README 已经承认"支持者不审批资金会永久锁定"，可以加一个审批截止时间 + 超时后发起人可提取、或支持者可按比例退出。
