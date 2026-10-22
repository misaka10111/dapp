import { JsonRpcProvider, Contract, Interface, formatEther, getAddress, isAddress } from "ethers";
import abi from "./src/abi/MilestoneFund.json" with { type: "json" };

const GIVEN = "0x9b824CA674432B390E30A5164a76c04eEaa8f686";
const RPC = "https://ethereum-sepolia-rpc.publicnode.com";

console.log("=== address checksum check ===");
console.log("given in chat :", GIVEN, "| isAddress:", isAddress(GIVEN));
const FIXED = getAddress(GIVEN.toLowerCase());
console.log("correct EIP-55:", FIXED, "| isAddress:", isAddress(FIXED));

const provider = new JsonRpcProvider(RPC, 11155111, { staticNetwork: true });
const ADDR = FIXED;

const iface = new Interface(abi);
const abiSels = new Map();
for (const f of iface.fragments.filter((f) => f.type === "function")) {
  abiSels.set(iface.getFunction(f.format("sighash")).selector.slice(2), f.format("sighash"));
}

const code = await provider.getCode(ADDR);
console.log("\n=== deployed bytecode vs ABI ===");
console.log("code bytes:", (code.length - 2) / 2);
const deployed = new Set([...code.matchAll(/63([0-9a-f]{8})/g)].map((m) => m[1]));
const missing = [...abiSels].filter(([sel]) => !deployed.has(sel));
console.log("ABI functions:", abiSels.size, "| PUSH4 selectors in bytecode:", deployed.size);
console.log("ABI funcs NOT found in bytecode:", missing.map(([s, n]) => `${s} ${n}`));
console.log("bytecode selectors not in ABI:", [...deployed].filter((s) => !abiSels.has(s)));

const c = new Contract(ADDR, abi, provider);
const count = await c.projectCount();
console.log("\n=== on-chain state ===");
console.log("projectCount:", count.toString());
console.log("contract balance:", formatEther(await provider.getBalance(ADDR)), "ETH");

const STATUS = ["Funding", "Successful", "Failed", "Completed"];
let sumEscrow = 0n;
for (let i = 0n; i < count; i++) {
  const p = await c.getProject(i);
  const ms = [await c.getMilestone(i, 0), await c.getMilestone(i, 1)];
  sumEscrow += p.escrowBalance;
  console.log(`\n#${i} "${p.name}" status=${STATUS[Number(p.status)]} target=${formatEther(p.target)} raised=${formatEther(p.totalRaised)} escrow=${formatEther(p.escrowBalance)} currentM=${p.currentMilestone}`);
  console.log(`   deadline=${new Date(Number(p.deadline) * 1000).toISOString()} creator=${p.creator}`);
  for (const [idx, m] of ms.entries()) {
    console.log(`   M${idx + 1} submitted=${m.submitted} approved=${m.approved} withdrawn=${m.withdrawn} weight=${formatEther(m.approvalWeight)} paidOut=${formatEther(m.withdrawnAmount)}`);
    console.log(`       url=${m.evidenceUrl}`);
  }
}
console.log("\nsum escrow:", formatEther(sumEscrow), "ETH");
