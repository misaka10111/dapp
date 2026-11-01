/**
 * Minimal EIP-1193 wallet for tests.
 *
 * Only the methods this project actually calls are implemented; anything else
 * throws so a test never silently passes against an unimplemented path.
 */

export const SEPOLIA_CHAIN_ID_HEX = "0xaa36a7";
export const MAINNET_CHAIN_ID_HEX = "0x1";
export const DEFAULT_ACCOUNT = "0x1111111111111111111111111111111111111111";

/**
 * @param {object} [options]
 * @param {string[]} [options.accounts] addresses returned by eth_accounts
 * @param {string} [options.chainId] hex chain id returned by eth_chainId
 * @param {"success"|"reject"} [options.mode] reject mimics a user declining in MetaMask
 * @param {boolean} [options.isMetaMask] false models a competing wallet extension
 */
export function createWallet({
  accounts = [DEFAULT_ACCOUNT],
  chainId = SEPOLIA_CHAIN_ID_HEX,
  mode = "success",
  isMetaMask = true,
} = {}) {
  const calls = [];
  return {
    isMetaMask,
    calls,
    async request({ method, params } = {}) {
      calls.push({ method, params });
      if (mode === "reject") {
        const error = new Error("MetaMask Tx Signature: User denied transaction signature.");
        error.code = 4001;
        throw error;
      }
      switch (method) {
        case "eth_chainId":
          return chainId;
        case "eth_accounts":
        case "eth_requestAccounts":
          return accounts;
        case "wallet_switchEthereumChain":
          return null;
        default:
          throw new Error(`fake-wallet: unexpected method ${method}`);
      }
    },
  };
}

/** Models the legacy multi-wallet injection shape (`window.ethereum.providers`). */
export function walletGroup(wallets) {
  return { providers: wallets };
}

/**
 * Installs a wallet as `window.ethereum` and returns a restore function.
 * Pass `null` to model a browser without any wallet installed.
 */
export function installWallet(wallet) {
  const hadWindow = "window" in globalThis;
  const previousEthereum = hadWindow ? globalThis.window.ethereum : undefined;

  if (!hadWindow) globalThis.window = {};
  globalThis.window.ethereum = wallet;

  return function restore() {
    if (!hadWindow) {
      delete globalThis.window;
      return;
    }
    if (previousEthereum === undefined) delete globalThis.window.ethereum;
    else globalThis.window.ethereum = previousEthereum;
  };
}
