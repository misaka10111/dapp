import {
  BrowserProvider,
  Contract,
  JsonRpcProvider,
  ZeroAddress,
  getAddress,
  isAddress,
} from "ethers";
import abi from "./abi/MilestoneFund.json";

export const SEPOLIA_CHAIN_ID = 11155111n;
export const EXPLORER = "https://sepolia.etherscan.io";
export const CONTRACT_ADDRESS = (
  import.meta.env.VITE_CONTRACT_ADDRESS ?? ""
).trim();
export const RPC_URL = (import.meta.env.VITE_SEPOLIA_RPC_URL ?? "").trim();
export const CONFIGURED =
  isAddress(CONTRACT_ADDRESS) && CONTRACT_ADDRESS !== ZeroAddress;
export const CONFIG_ERROR =
  CONTRACT_ADDRESS && !CONFIGURED
    ? "Invalid contract address. Use the deployed Sepolia address in .env.local."
    : "";
export const ABI = abi;

// Prefer MetaMask specifically, including legacy multi-wallet injection.
export function injectedWallet() {
  const injected = window.ethereum;
  if (injected?.providers)
    return injected.providers.find((p) => p.isMetaMask) ?? null;
  return injected?.isMetaMask ? injected : null;
}

export function browserProvider() {
  const wallet = injectedWallet();
  if (!wallet) throw new Error("Install MetaMask, then reload this page.");
  return new BrowserProvider(wallet);
}

export function readProvider() {
  if (RPC_URL) return new JsonRpcProvider(RPC_URL, Number(SEPOLIA_CHAIN_ID));
  return browserProvider();
}

export async function checkedContract(provider) {
  if (!CONFIGURED)
    throw new Error(
      CONFIG_ERROR ||
        "Contract is not configured. Deploy in Remix and set VITE_CONTRACT_ADDRESS.",
    );
  if ((await provider.getNetwork()).chainId !== SEPOLIA_CHAIN_ID)
    throw new Error("Switch to Ethereum Sepolia to load this contract.");
  if ((await provider.getCode(CONTRACT_ADDRESS)) === "0x")
    throw new Error(
      "No contract at this Sepolia address. Check your configuration.",
    );
  return new Contract(getAddress(CONTRACT_ADDRESS), ABI, provider);
}

export async function switchToSepolia() {
  const wallet = injectedWallet();
  if (!wallet) throw new Error("Install MetaMask, then reload this page.");
  // Never silently add a network with an untrusted RPC endpoint.
  await wallet.request({
    method: "wallet_switchEthereumChain",
    params: [{ chainId: "0xaa36a7" }],
  });
}
