import { formatEther, parseEther } from "ethers";

export const shortAddress = (value) =>
  value ? `${value.slice(0, 6)}…${value.slice(-4)}` : "";
export const eth = (value) => formatEther(value ?? 0n);
// Only visual percentages use Number, after bigint arithmetic. ETH always stays bigint/string.
export const percent = (part, total) =>
  total > 0n ? Number((part * 10000n) / total) / 100 : 0;
export const budget = (total, index) =>
  index === 0 ? (total * 2n) / 5n : total - (total * 2n) / 5n;
export function positiveEth(value) {
  if (!/^\d+(\.\d{1,18})?$/.test(value))
    throw new Error(
      "Enter a positive ETH amount with at most 18 decimal places.",
    );
  const wei = parseEther(value);
  if (wei <= 0n) throw new Error("Amount must be greater than zero.");
  return wei;
}
export function safeUrl(value) {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}
export function errorMessage(error) {
  const code = error?.code ?? error?.info?.error?.code;
  if (
    code === "ACTION_REJECTED" ||
    code === 4001 ||
    error?.info?.error?.code === 4001
  )
    return "Request rejected in MetaMask. You can try again.";
  if (code === "INSUFFICIENT_FUNDS")
    return "Insufficient Sepolia ETH for the amount and gas.";
  if (code === 4902 || error?.info?.error?.code === 4902)
    return "Enable Sepolia in MetaMask: Settings → Advanced → Show test networks, then select Sepolia.";
  if (code === "NETWORK_ERROR" || code === "SERVER_ERROR" || code === "TIMEOUT")
    return "Network request failed. Check MetaMask, Sepolia, and your RPC connection, then refresh.";
  return (
    error?.reason ??
    error?.shortMessage ??
    error?.info?.error?.message ??
    error?.message ??
    "Request failed. Please try again."
  );
}
