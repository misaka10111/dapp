/**
 * Simulates the deployed MilestoneFund bytecode on Sepolia using eth_call +
 * state overrides, so approval / withdrawal / refund logic can be verified
 * without spending test ETH or needing a private key.
 *
 * Part A: guard checks against the real deployed contract and its real state.
 * Part B: fabricated states injected at a synthetic address that runs the
 *         exact runtime bytecode fetched from the deployed contract.
 */
import {
  JsonRpcProvider, Interface, AbiCoder, keccak256, getAddress, parseEther, formatEther, toBeHex, zeroPadValue,
} from "ethers";
import abi from "./src/abi/MilestoneFund.json" with { type: "json" };
import fs from "node:fs";

const RPC = "https://ethereum-sepolia-rpc.publicnode.com";
const REAL = getAddress("0x9b824ca674432b390e30a5164a76c04eeaa8f686");
const TEST = "0x000000000000000000000000000000000000c0de";
const provider = new JsonRpcProvider(RPC, 11155111, { staticNetwork: true });
const iface = new Interface(abi);
const coder = AbiCoder.defaultAbiCoder();

const A = "0x80e171743f3FFA2E266d174FF8722364AE6914d7"; // creator of project 0/1 on chain
const B = "0x1111111111111111111111111111111111111111";
const C = "0x2222222222222222222222222222222222222222";
const D = "0x3333333333333333333333333333333333333333";

const results = [];
function record(part, name, pass, detail = "") {
  results.push({ part, name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  [${part}] ${name}${detail ? " :: " + detail : ""}`);
}

async function call({ to = REAL, from = D, data, value = 0n, overrides, gas = 3_000_000 }) {
  const tx = { from, to, data, value: toBeHex(value) };
  const params = [tx, "latest"];
  if (overrides) params.push(overrides);
  return provider.send("eth_call", params);
}

function reasonOf(err) {
  const s = err?.info?.error?.message || err?.shortMessage || err?.message || String(err);
  if (/execution reverted:/.test(s)) return s.split("execution reverted:")[1].trim().split('"')[0].trim();
  if (/execution reverted/.test(s)) return "execution reverted (no reason)";
  return s.slice(0, 160);
}

async function expect(part, name, params, expected) {
  try {
    const out = await call(params);
    if (expected === "ok") record(part, name, true);
    else record(part, name, false, `expected revert "${expected}" but call succeeded`);
    return out;
  } catch (e) {
    const r = reasonOf(e);
    if (expected === "revert") return record(part, name, true, r);
    const ok = r.includes(expected);
    record(part, name, ok, ok ? r : `got "${r}", expected "${expected}"`);
    return null;
  }
}

const enc = (fn, args = [], value) => iface.encodeFunctionData(fn, args);

// ---------------------------------------------------------------- Part A
console.log("=== Part A: guards on the real deployed contract ===\n");
const code = await provider.getCode(REAL);

await expect("A", "getProject(未知 id) 被拒", { data: enc("getProject", [999]) }, "Unknown project");
await expect("A", "getMilestone(0, 2) 被拒", { data: enc("getMilestone", [0, 2]) }, "Invalid milestone");
await expect("A", "createProject 空名称被拒", {
  from: A, data: enc("createProject", ["", "d", 1n, BigInt(Math.floor(Date.now() / 1000) + 86400), "a", "b"]),
}, "Invalid name");
await expect("A", "createProject 目标为 0 被拒", {
  from: A, data: enc("createProject", ["n", "d", 0n, BigInt(Math.floor(Date.now() / 1000) + 86400), "a", "b"]),
}, "Target must be positive");
await expect("A", "createProject 过去截止时间被拒", {
  from: A, data: enc("createProject", ["n", "d", 1n, 1000n, "a", "b"]),
}, "Deadline must be future");
const created = await expect("A", "createProject 合法参数成功（模拟，不广播）", {
  from: A, data: enc("createProject", ["Sim", "sim", parseEther("0.01"), BigInt(Math.floor(Date.now() / 1000) + 86400), "g1", "g2"]),
}, "ok");
if (created) {
  const id = BigInt(created);
  record("A", "createProject 返回的新 id = projectCount", id === 2n, `id=${id}`);
}
await expect("A", "发起人不能给自己出资", { from: A, value: 1n, data: enc("contribute", [1]) }, "Creator cannot contribute");
await expect("A", "0 金额出资被拒", { from: B, value: 0n, data: enc("contribute", [1]) }, "Contribution must be positive");
await expect("A", "非发起人不能提交成果", {
  from: B, data: enc("submitEvidence", [0, 0, "x", "https://example.com"]),
}, "Creator only");
await expect("A", "未达标项目不能提交成果", {
  from: A, data: enc("submitEvidence", [0, 0, "x", "https://example.com"]),
}, "Project not successful");
await expect("A", "未达标项目不能审批", { from: B, data: enc("approveMilestone", [0, 0]) }, "Project not successful");
await expect("A", "未达标项目不能提款", { from: A, data: enc("withdrawMilestone", [0, 0]) }, "Project not successful");
await expect("A", "进行中项目不能退款", { from: B, data: enc("claimRefund", [0]) }, "Project not failed");
await expect("A", "截止前不能 finalize", { from: B, data: enc("finalizeFunding", [0]) }, "Deadline not reached");
await expect("A", "截止前不能 finalize（项目 1）", { from: B, data: enc("finalizeFunding", [1]) }, "Deadline not reached");

// ---------------------------------------------------------------- Part B
console.log("\n=== Part B: fabricated states on the deployed runtime bytecode ===\n");

const slotMap = (pid, mapSlot) => BigInt(keccak256(coder.encode(["uint256", "uint256"], [pid, mapSlot])));
const slotAddr = (addr, base) => keccak256(coder.encode(["address", "uint256"], [getAddress(addr), base]));
const slotUint = (k, base) => keccak256(coder.encode(["uint256", "uint256"], [k, base]));
const at = (slot, n) => toBeHex(BigInt(slot) + BigInt(n), 32);
const pad = (v) => zeroPadValue(toBeHex(v), 32);

function projectState(pid, p) {
  const base = slotMap(pid, 1);
  const st = {};
  st[at(base, 0)] = pad(getAddress(p.creator));
  st[at(base, 3)] = pad(p.target ?? 0n);
  st[at(base, 4)] = pad(p.deadline ?? 0n);
  st[at(base, 5)] = pad(p.totalRaised ?? 0n);
  st[at(base, 6)] = pad(p.escrowBalance ?? 0n);
  st[at(base, 7)] = pad(BigInt(p.status) | (BigInt(p.currentMilestone ?? 0) << 8n));
  return st;
}
function milestoneState(pid, i, m) {
  // Milestone struct = 3 strings + 2 uint256 + 1 packed bool slot = 6 slots.
  const base = BigInt(slotMap(pid, 2)) + BigInt(i) * 6n;
  const st = {};
  st[at(base, 3)] = pad(m.approvalWeight ?? 0n);
  st[at(base, 4)] = pad(m.withdrawnAmount ?? 0n);
  st[at(base, 5)] = pad(
    (m.submitted ? 1n : 0n) | (m.approved ? 1n << 8n : 0n) | (m.withdrawn ? 1n << 16n : 0n),
  );
  return st;
}
function approvalState(pid, milestone, addr) {
  const inner = slotUint(milestone, slotUint(pid, 4));
  return { [slotAddr(addr, inner)]: pad(1n) };
}
function contributionState(pid, addr, amount) {
  return { [slotAddr(addr, slotMap(pid, 3))]: pad(amount) };
}
function refundedState(pid, addr) {
  return { [slotAddr(addr, slotMap(pid, 5))]: pad(1n) };
}

async function scenario(name, { project, m0, m1, contributions = [], refunded = [], approvals = [], count = 1 }, from, data, expected, value = 0n) {
  const stateDiff = {
    ...projectState(0, project),
    ...(m0 ? milestoneState(0, 0, m0) : {}),
    ...(m1 ? milestoneState(0, 1, m1) : {}),
  };
  for (const [addr, amt] of contributions) Object.assign(stateDiff, contributionState(0, addr, amt));
  for (const addr of refunded) Object.assign(stateDiff, refundedState(0, addr));
  for (const [ms, addr] of approvals) Object.assign(stateDiff, approvalState(0, ms, addr));
  stateDiff[pad(0)] = pad(count); // projectCount at slot 0
  const overrides = { [TEST]: { code, balance: pad(parseEther("10")), stateDiff } };
  return expect("B", name, { to: TEST, from, data, value, overrides }, expected);
}

const SUCCESS = { creator: A, status: 1, currentMilestone: 0, totalRaised: parseEther("1"), escrowBalance: parseEther("1"), target: parseEther("1") };

// --- approval
await scenario("达标项目：未出资者审批被拒", {
  project: SUCCESS, m0: { submitted: true },
  contributions: [[B, parseEther("0.4")], [C, parseEther("0.6")]],
}, D, enc("approveMilestone", [0, 0]), "Backers only");

await scenario("达标项目：支持者可以审批阶段 1", {
  project: SUCCESS, m0: { submitted: true },
  contributions: [[B, parseEther("0.4")], [C, parseEther("0.6")]],
}, B, enc("approveMilestone", [0, 0]), "ok");

await scenario("未提交成果时审批被拒", {
  project: SUCCESS, m0: { submitted: false },
  contributions: [[B, parseEther("0.4")]],
}, B, enc("approveMilestone", [0, 0]), "Approval not open");

await scenario("已通过后再次审批被拒", {
  project: SUCCESS, m0: { submitted: true, approved: true },
  contributions: [[B, parseEther("0.4")]],
}, B, enc("approveMilestone", [0, 0]), "Approval not open");

await scenario("重复投票被拒（hasApproved 已置位）", {
  project: SUCCESS, m0: { submitted: true },
  contributions: [[B, parseEther("0.4")]],
  approvals: [[0, B]],
}, B, enc("approveMilestone", [0, 0]), "Already approved");

// --- withdrawal
await scenario("阶段已批准：发起人可以提款", {
  project: SUCCESS, m0: { submitted: true, approved: true },
}, A, enc("withdrawMilestone", [0, 0]), "ok");

await scenario("阶段未批准：提款被拒", {
  project: SUCCESS, m0: { submitted: true, approved: false },
}, A, enc("withdrawMilestone", [0, 0]), "Milestone not withdrawable");

await scenario("阶段已提款：不能重复提款", {
  project: SUCCESS, m0: { submitted: true, approved: true, withdrawn: true },
}, A, enc("withdrawMilestone", [0, 0]), "Milestone not withdrawable");

await scenario("非发起人提款被拒", {
  project: SUCCESS, m0: { submitted: true, approved: true },
}, B, enc("withdrawMilestone", [0, 0]), "Creator only");

// payout amount probes: totalRaised=100 wei -> M1 payout must be exactly 40
await scenario("金额探针：total=100 时托管 39 不足以支付（说明 M1=40）", {
  project: { ...SUCCESS, totalRaised: 100n, escrowBalance: 39n, target: 100n },
  m0: { submitted: true, approved: true },
}, A, enc("withdrawMilestone", [0, 0]), "revert");

await scenario("金额探针：total=100 时托管 40 刚好够（M1=40 确认）", {
  project: { ...SUCCESS, totalRaised: 100n, escrowBalance: 40n, target: 100n },
  m0: { submitted: true, approved: true },
}, A, enc("withdrawMilestone", [0, 0]), "ok");

await scenario("金额探针：total=7 时托管 2 刚好够（M1=floor(2*7/5)=2）", {
  project: { ...SUCCESS, totalRaised: 7n, escrowBalance: 2n, target: 7n },
  m0: { submitted: true, approved: true },
}, A, enc("withdrawMilestone", [0, 0]), "ok");

// overfunding: total 0.012 ETH -> M1 must be 0.0048, M2 0.0072
await scenario("金额探针：超额出资 total=0.012 时托管 0.0048-1 不足（说明 M1=0.0048）", {
  project: { ...SUCCESS, totalRaised: parseEther("0.012"), escrowBalance: parseEther("0.0048") - 1n, target: parseEther("0.01") },
  m0: { submitted: true, approved: true },
}, A, enc("withdrawMilestone", [0, 0]), "revert");

await scenario("金额探针：超额出资 total=0.012 时托管 0.0048 刚好够", {
  project: { ...SUCCESS, totalRaised: parseEther("0.012"), escrowBalance: parseEther("0.0048"), target: parseEther("0.01") },
  m0: { submitted: true, approved: true },
}, A, enc("withdrawMilestone", [0, 0]), "ok");

await scenario("阶段 2 未批准：提款被拒", {
  project: { ...SUCCESS, currentMilestone: 1, escrowBalance: parseEther("0.6") },
  m0: { submitted: true, approved: true, withdrawn: true },
  m1: { submitted: true, approved: false },
}, A, enc("withdrawMilestone", [0, 1]), "Milestone not withdrawable");

await scenario("已失败项目：不能继续出资", {
  project: { creator: A, status: 2, deadline: 1n, target: parseEther("0.02") },
}, B, enc("contribute", [0]), "Funding closed", parseEther("0.001"));

await scenario("已失败项目：不能重复 finalize", {
  project: { creator: A, status: 2, deadline: 1n, target: parseEther("0.02") },
}, B, enc("finalizeFunding", [0]), "Funding closed");

// second milestone
await scenario("阶段 2：当前阶段为 1 时可提款", {
  project: { ...SUCCESS, currentMilestone: 1, escrowBalance: parseEther("0.6") },
  m0: { submitted: true, approved: true, withdrawn: true },
  m1: { submitted: true, approved: true },
}, A, enc("withdrawMilestone", [0, 1]), "ok");

await scenario("阶段顺序：阶段 1 未提款时不能提交阶段 2 成果", {
  project: { ...SUCCESS, currentMilestone: 0 },
  m0: { submitted: true, approved: true },
}, A, enc("submitEvidence", [0, 1, "x", "https://example.com"]), "Wrong milestone");

// --- refund
await scenario("失败项目：支持者可以退款", {
  project: { creator: A, status: 2, totalRaised: parseEther("0.003"), escrowBalance: parseEther("0.003"), deadline: 1n },
  contributions: [[B, parseEther("0.003")]],
}, B, enc("claimRefund", [0]), "ok");

await scenario("失败项目：已退款不能重复领取", {
  project: { creator: A, status: 2, totalRaised: parseEther("0.003"), escrowBalance: 0n, deadline: 1n },
  contributions: [[B, parseEther("0.003")]],
  refunded: [B],
}, B, enc("claimRefund", [0]), "No refund available");

await scenario("失败项目：未出资者不能退款", {
  project: { creator: A, status: 2, totalRaised: parseEther("0.003"), escrowBalance: parseEther("0.003"), deadline: 1n },
  contributions: [[B, parseEther("0.003")]],
}, C, enc("claimRefund", [0]), "No refund available");

await scenario("成功项目不能退款", {
  project: SUCCESS, m0: { submitted: true },
  contributions: [[B, parseEther("1")]],
}, B, enc("claimRefund", [0]), "Project not failed");

// --- finalize / deadline
await scenario("已过截止且未达标：finalize 成功", {
  project: { creator: A, status: 0, totalRaised: parseEther("0.003"), escrowBalance: parseEther("0.003"), deadline: 1n, target: parseEther("0.02") },
  contributions: [[B, parseEther("0.003")]],
}, D, enc("finalizeFunding", [0]), "ok");

await scenario("未过截止：finalize 被拒", {
  project: { creator: A, status: 0, deadline: BigInt(Math.floor(Date.now() / 1000) + 3600), target: parseEther("0.02") },
}, D, enc("finalizeFunding", [0]), "Deadline not reached");

await scenario("已过截止：出资被拒", {
  project: { creator: A, status: 0, deadline: 1n, target: parseEther("0.02") },
}, B, enc("contribute", [0]), "Deadline reached", parseEther("0.001"));

await scenario("已达标：继续出资被拒", {
  project: SUCCESS,
}, B, enc("contribute", [0]), "Funding closed", 1n);

await scenario("成功项目：发起人可提交当前阶段成果", {
  project: SUCCESS, m0: { submitted: false },
}, A, enc("submitEvidence", [0, 0, "delivered", "https://github.com/misaka10111/dapp"]), "ok");

await scenario("成功项目：同阶段成果不能重复提交", {
  project: SUCCESS, m0: { submitted: true },
}, A, enc("submitEvidence", [0, 0, "again", "https://example.com"]), "Evidence already submitted");

// ---------------------------------------------------------------- Part C
console.log("\n=== Part C: front-end helpers (src/utils.js) ===\n");
const { budget, percent, positiveEth, safeUrl, eth, errorMessage } = await import("./src/utils.js");

// The UI must show exactly what the contract pays: floor(total*2/5) then the rest.
let budgetMismatch = null;
const totals = [0n, 1n, 2n, 3n, 4n, 5n, 6n, 7n, 9n, 13n, 99n, 100n, 101n, 999n,
  parseEther("0.01"), parseEther("0.012"), 10n ** 18n + 3n];
for (let i = 0; i < 300; i++) totals.push(BigInt(Math.floor(Math.random() * 1e15)) * 1000003n + BigInt(i));
for (const t of totals) {
  const contractM1 = (t / 5n) * 2n + ((t % 5n) * 2n) / 5n;
  const uiM1 = budget(t, 0);
  const uiM2 = budget(t, 1);
  if (uiM1 !== contractM1 || uiM1 + uiM2 !== t) {
    budgetMismatch = `total=${t} contract=${contractM1} ui=${uiM1} uiM2=${uiM2}`;
    break;
  }
}
record("C", `前端 40/60 预算与合约一致（${totals.length} 组金额）`, budgetMismatch === null, budgetMismatch ?? "");

record("C", "percent() 在 total=0 时不崩溃", percent(0n, 0n) === 0, `percent(0,0)=${percent(0n, 0n)}`);
record("C", "percent() 超额显示为 >100", percent(parseEther("0.012"), parseEther("0.01")) === 120,
  `=${percent(parseEther("0.012"), parseEther("0.01"))}`);

for (const bad of ["0", "-1", "1e3", ".5", "1,5", "abc", "1.1234567890123456789", "", " 0.01"]) {
  let rejected = false;
  try { positiveEth(bad); } catch { rejected = true; }
  record("C", `positiveEth 拒绝非法金额 ${JSON.stringify(bad)}`, rejected);
}
for (const good of ["0.01", "1", "0.000000000000000001"]) {
  let okAmount = true;
  try { positiveEth(good); } catch { okAmount = false; }
  record("C", `positiveEth 接受合法金额 ${good}`, okAmount);
}

record("C", "safeUrl 拒绝 javascript: 伪协议", safeUrl("javascript:alert(1)") === null);
record("C", "safeUrl 拒绝非完整 URL", safeUrl("github.com/x") === null);
record("C", "safeUrl 接受 https 链接", safeUrl("https://github.com/misaka10111/dapp") !== null);
record("C", "eth() 正确显示 wei", eth(100n) === "0.0000000000000001", eth(100n));
record("C", "errorMessage 识别 MetaMask 拒绝", errorMessage({ code: 4001 }).includes("rejected"));
record("C", "errorMessage 识别余额不足", errorMessage({ code: "INSUFFICIENT_FUNDS" }).includes("Insufficient"));

const passed = results.filter((r) => r.pass).length;
console.log(`\n================ ${passed}/${results.length} passed, ${results.length - passed} failed ================`);
for (const r of results.filter((x) => !x.pass)) console.log("FAILED:", r.part, "|", r.name, "|", r.detail);
fs.writeFileSync("./simulation-results.json", JSON.stringify(results, null, 2));
process.exit(passed === results.length ? 0 : 1);
