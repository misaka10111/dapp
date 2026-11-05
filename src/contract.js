import {
  BrowserProvider,
  Contract,
  JsonRpcProvider,
  ZeroAddress,
  getAddress,
  isAddress,
} from "ethers";
import abi from "./abi/MilestoneFund.json" with { type: "json" };

export const SEPOLIA_CHAIN_ID = 11155111n;
export const EXPLORER = "https://sepolia.etherscan.io";

// Chat apps and slides often rewrite the letter case of a checksummed address,
// which makes isAddress() reject an otherwise correct address. The hex digits
// are unchanged by case, so retry once in lower case before giving up.
function normalizeAddress(raw) {
  if (!raw) return "";
  if (isAddress(raw)) return getAddress(raw);
  const lower = raw.toLowerCase();
  return isAddress(lower) ? getAddress(lower) : "";
}

// Pure so tests can drive every branch without depending on Vite's env at import.
export function resolveConfig(rawAddress, rpcUrl) {
  const raw = (rawAddress ?? "").trim();
  const contractAddress = normalizeAddress(raw);
  const configured = contractAddress !== "" && contractAddress !== ZeroAddress;
  return {
    contractAddress,
    rpcUrl: (rpcUrl ?? "").trim(),
    configured,
    error:
      raw && !configured
        ? "Invalid contract address. Use the deployed Sepolia address in .env.local."
        : "",
  };
}

const CONFIG = resolveConfig(
  import.meta.env?.VITE_CONTRACT_ADDRESS,
  import.meta.env?.VITE_SEPOLIA_RPC_URL,
);

export const CONTRACT_ADDRESS = CONFIG.contractAddress;
export const RPC_URL = CONFIG.rpcUrl;
export const CONFIGURED = CONFIG.configured;
export const CONFIG_ERROR = CONFIG.error;
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

export function readProvider(config = CONFIG) {
  if (config.rpcUrl)
    return new JsonRpcProvider(config.rpcUrl, Number(SEPOLIA_CHAIN_ID));
  return browserProvider();
}

export async function checkedContract(provider, config = CONFIG) {
  if (!config.configured)
    throw new Error(
      config.error ||
        "Contract is not configured. Deploy in Remix and set VITE_CONTRACT_ADDRESS.",
    );
  if ((await provider.getNetwork()).chainId !== SEPOLIA_CHAIN_ID)
    throw new Error("Switch to Ethereum Sepolia to load this contract.");
  if ((await provider.getCode(config.contractAddress)) === "0x")
    throw new Error(
      "No contract at this Sepolia address. Check your configuration.",
    );
  return new Contract(getAddress(config.contractAddress), ABI, provider);
}

async function readOptionalContractValue(read) {
  try {
    return await read();
  } catch (error) {
    // Older deployments return no data for a selector they do not implement.
    if (
      (error?.code === "CALL_EXCEPTION" &&
        (error.data === "0x" || error.data === null)) ||
      (error?.code === "BAD_DATA" && error.value === "0x")
    )
      return null;
    throw error;
  }
}

export function readExpiredRefundAmount(contract, projectId, account, snapshot) {
  return readOptionalContractValue(() =>
    contract.getExpiredRefundAmount(projectId, account, snapshot),
  );
}

export function readMilestoneWindow(contract, projectId, snapshot) {
  return readOptionalContractValue(() =>
    contract.getMilestoneWindow(projectId, snapshot),
  );
}

export function refundAmountFromReceipt(contract, receipt) {
  const address = contract.target.toLowerCase();
  const event = contract.interface.getEvent("RefundClaimed");
  const log = receipt.logs.find(
    (entry) => entry.address.toLowerCase() === address && entry.topics[0] === event.topicHash,
  );
  return log ? contract.interface.parseLog(log).args.amount : null;
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
