import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { BrowserProvider, Contract, JsonRpcProvider } from "ethers";
import {
  ABI,
  CONFIGURED,
  CONFIG_ERROR,
  CONTRACT_ADDRESS,
  RPC_URL,
  SEPOLIA_CHAIN_ID,
  browserProvider,
  checkedContract,
  injectedWallet,
  readExpiredRefundAmount,
  readMilestoneWindow,
  readProvider,
  resolveConfig,
  switchToSepolia,
} from "../src/contract.js";
import { errorMessage } from "../src/utils.js";
import {
  DEFAULT_ACCOUNT,
  MAINNET_CHAIN_ID_HEX,
  SEPOLIA_CHAIN_ID_HEX,
  createWallet,
  installWallet,
  walletGroup,
} from "./helpers/fake-wallet.mjs";

const ADDRESS = "0x9b824CA674432B390E30A5164a76c04EeAa8f686";
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const configured = () => resolveConfig(ADDRESS, "");

/** A provider double: only the calls checkedContract actually makes. */
const providerFor = ({ chainId = SEPOLIA_CHAIN_ID, code = "0x6000" } = {}) => ({
  getNetwork: async () => ({ chainId }),
  getCode: async () => code,
});

describe("module defaults without Vite env", () => {
  test("node never reads .env.local, so the module starts unconfigured", () => {
    assert.equal(CONFIGURED, false);
    assert.equal(CONFIG_ERROR, "");
    assert.equal(CONTRACT_ADDRESS, "");
    assert.equal(RPC_URL, "");
  });
});

describe("resolveConfig", () => {
  test("accepts a checksummed address unchanged", () => {
    const config = configured();
    assert.equal(config.configured, true);
    assert.equal(config.contractAddress, ADDRESS);
    assert.equal(config.error, "");
  });

  test("restores checksum casing when the address was rewritten", () => {
    assert.equal(resolveConfig(ADDRESS.toLowerCase(), "").contractAddress, ADDRESS);
    assert.equal(resolveConfig(ADDRESS.toUpperCase().replace("0X", "0x"), "").contractAddress, ADDRESS);
  });

  test("trims both inputs", () => {
    const config = resolveConfig(`  ${ADDRESS}  `, "  https://rpc.example  ");
    assert.equal(config.contractAddress, ADDRESS);
    assert.equal(config.rpcUrl, "https://rpc.example");
  });

  test("treats the zero address as not configured", () => {
    const config = resolveConfig(ZERO_ADDRESS, "");
    assert.equal(config.configured, false);
    assert.match(config.error, /Invalid contract address/);
  });

  test("reports unusable input instead of silently passing it through", () => {
    const config = resolveConfig("0x1234", "");
    assert.equal(config.configured, false);
    assert.equal(config.contractAddress, "");
    assert.match(config.error, /Invalid contract address/);
  });

  test("keeps an empty address free of errors", () => {
    const config = resolveConfig("", "");
    assert.equal(config.configured, false);
    assert.equal(config.error, "");
  });

  test("tolerates missing arguments", () => {
    const config = resolveConfig(undefined, undefined);
    assert.deepEqual(config, { contractAddress: "", rpcUrl: "", configured: false, error: "" });
  });
});

describe("injectedWallet", () => {
  test("returns null when no wallet is installed", () => {
    const restore = installWallet(null);
    try {
      assert.equal(injectedWallet(), null);
    } finally {
      restore();
    }
  });

  test("ignores a wallet that is not MetaMask", () => {
    const restore = installWallet(createWallet({ isMetaMask: false }));
    try {
      assert.equal(injectedWallet(), null);
    } finally {
      restore();
    }
  });

  test("finds MetaMask inside a multi-wallet group", () => {
    const other = createWallet({ isMetaMask: false });
    const metaMask = createWallet();
    const restore = installWallet(walletGroup([other, metaMask]));
    try {
      assert.equal(injectedWallet(), metaMask);
    } finally {
      restore();
    }
  });

  test("returns null when a group has no MetaMask entry", () => {
    const restore = installWallet(walletGroup([createWallet({ isMetaMask: false })]));
    try {
      assert.equal(injectedWallet(), null);
    } finally {
      restore();
    }
  });
});

describe("browserProvider", () => {
  test("explains what to install when no wallet exists", () => {
    const restore = installWallet(null);
    try {
      assert.throws(() => browserProvider(), /Install MetaMask/);
    } finally {
      restore();
    }
  });

  test("wraps the injected MetaMask provider", () => {
    const restore = installWallet(createWallet());
    try {
      assert.ok(browserProvider() instanceof BrowserProvider);
    } finally {
      restore();
    }
  });
});

describe("readProvider", () => {
  test("uses the configured RPC endpoint when present", () => {
    const provider = readProvider(resolveConfig("", "https://rpc.example"));
    assert.ok(provider instanceof JsonRpcProvider);
  });

  test("falls back to the wallet when no RPC endpoint is configured", () => {
    const restore = installWallet(createWallet());
    try {
      assert.ok(readProvider(resolveConfig("", "")) instanceof BrowserProvider);
    } finally {
      restore();
    }
  });

  test("fails with the setup hint when there is neither RPC nor wallet", () => {
    const restore = installWallet(null);
    try {
      assert.throws(() => readProvider(resolveConfig("", "")), /Install MetaMask/);
    } finally {
      restore();
    }
  });
});

describe("checkedContract", () => {
  test("refuses to load an unconfigured contract", async () => {
    await assert.rejects(
      checkedContract(providerFor(), resolveConfig("", "")),
      /Contract is not configured/,
    );
  });

  test("surfaces the invalid-address reason", async () => {
    await assert.rejects(
      checkedContract(providerFor(), resolveConfig("0x1234", "")),
      /Invalid contract address/,
    );
  });

  test("rejects a network other than Sepolia", async () => {
    await assert.rejects(
      checkedContract(providerFor({ chainId: 1n }), configured()),
      /Switch to Ethereum Sepolia/,
    );
  });

  test("rejects an address with no deployed code", async () => {
    await assert.rejects(
      checkedContract(providerFor({ code: "0x" }), configured()),
      /No contract at this Sepolia address/,
    );
  });

  test("binds the contract to the configured address", async () => {
    const contract = await checkedContract(providerFor(), configured());
    assert.ok(contract instanceof Contract);
    assert.equal(contract.target, ADDRESS);
  });

  test("checks the address from the injected config, not the module constant", async () => {
    let probed = "";
    const provider = {
      getNetwork: async () => ({ chainId: SEPOLIA_CHAIN_ID }),
      getCode: async (address) => {
        probed = address;
        return "0x6000";
      },
    };
    await checkedContract(provider, resolveConfig("0x0000000000000000000000000000000000000001", ""));
    assert.equal(probed, "0x0000000000000000000000000000000000000001");
  });
});

describe("readExpiredRefundAmount", () => {
  const snapshot = { blockTag: 123 };

  test("reads the contract quote for the selected project and account at the snapshot block", async () => {
    const contract = {
      async getExpiredRefundAmount(id, account, overrides) {
        assert.equal(id, 7n);
        assert.equal(account, DEFAULT_ACCOUNT);
        assert.equal(overrides, snapshot);
        return 36n;
      },
    };
    assert.equal(await readExpiredRefundAmount(contract, 7n, DEFAULT_ACCOUNT, snapshot), 36n);
  });

  test("handles older deployments whose quote selector returns no data", async () => {
    for (const error of [
      { code: "CALL_EXCEPTION", data: "0x" },
      { code: "CALL_EXCEPTION", data: null },
      { code: "BAD_DATA", value: "0x" },
    ]) {
      const contract = {
        async getExpiredRefundAmount() { throw error; },
      };
      assert.equal(await readExpiredRefundAmount(contract, 7n, DEFAULT_ACCOUNT, snapshot), null);
    }
  });

  test("propagates RPC failures and contract reverts with a reason", async () => {
    for (const error of [
      { code: "TIMEOUT" },
      { code: "CALL_EXCEPTION", data: "0x08c379a0" },
    ]) {
      const contract = {
        async getExpiredRefundAmount() { throw error; },
      };
      await assert.rejects(
        readExpiredRefundAmount(contract, 7n, DEFAULT_ACCOUNT, snapshot),
        (caught) => caught === error,
      );
    }
  });
});

describe("readMilestoneWindow", () => {
  const snapshot = { blockTag: 123 };

  test("decodes the deadline and open flag from the same block snapshot", async () => {
    const contract = new Contract(ADDRESS, ABI, {
      async call(transaction) {
        const id = contract.interface.decodeFunctionData("getMilestoneWindow", transaction.data)[0];
        assert.equal(id, 7n);
        assert.equal(transaction.blockTag, snapshot.blockTag);
        return contract.interface.encodeFunctionResult("getMilestoneWindow", [150n, false]);
      },
    });
    const window = await readMilestoneWindow(contract, 7n, snapshot);
    assert.equal(window.deadline, 150n);
    assert.equal(window.open, false);
  });

  test("returns null when an older deployment has no window getter", async () => {
    const contract = new Contract(ADDRESS, ABI, {
      async call() { return "0x"; },
    });
    assert.equal(await readMilestoneWindow(contract, 7n, snapshot), null);
  });
});

describe("switchToSepolia", () => {
  test("asks for the Sepolia chain id in hex", async () => {
    const wallet = createWallet();
    const restore = installWallet(wallet);
    try {
      await switchToSepolia();
      assert.deepEqual(wallet.calls, [
        { method: "wallet_switchEthereumChain", params: [{ chainId: SEPOLIA_CHAIN_ID_HEX }] },
      ]);
    } finally {
      restore();
    }
  });

  test("fails with the setup hint when no wallet exists", async () => {
    const restore = installWallet(null);
    try {
      await assert.rejects(switchToSepolia(), /Install MetaMask/);
    } finally {
      restore();
    }
  });

  test("propagates the 4001 rejection from MetaMask", async () => {
    const restore = installWallet(createWallet({ mode: "reject" }));
    try {
      await assert.rejects(switchToSepolia(), (error) => error.code === 4001);
    } finally {
      restore();
    }
  });
});

// Skeleton for the transaction layer. App.jsx sends these through transact();
// the payload and error shapes are asserted here so a contract ABI change or a
// renamed argument fails fast, before any UI-level test exists.
describe("transaction payloads", () => {
  const contract = new Contract(ADDRESS, ABI, null);

  test("contribute takes only the project id, value travels as override", () => {
    const fragment = contract.interface.getFunction("contribute");
    assert.equal(fragment.inputs.length, 1);
    assert.equal(fragment.inputs[0].type, "uint256");
    assert.equal(fragment.payable, true);

    const data = contract.interface.encodeFunctionData("contribute", [7n]);
    const [id] = contract.interface.decodeFunctionData("contribute", data);
    assert.equal(id, 7n);
  });

  test("approveMilestone keeps the (projectId, milestoneIndex) order", () => {
    const data = contract.interface.encodeFunctionData("approveMilestone", [3n, 1n]);
    const [id, index] = contract.interface.decodeFunctionData("approveMilestone", data);
    assert.equal(id, 3n);
    assert.equal(index, 1n);
  });

  test("withdrawMilestone mirrors the approval order", () => {
    const data = contract.interface.encodeFunctionData("withdrawMilestone", [2n, 0n]);
    const [id, index] = contract.interface.decodeFunctionData("withdrawMilestone", data);
    assert.equal(id, 2n);
    assert.equal(index, 0n);
  });

  test("a rejected wallet request becomes the retry hint users see", async () => {
    const restore = installWallet(createWallet({ mode: "reject" }));
    try {
      const error = await switchToSepolia().catch((caught) => caught);
      assert.match(errorMessage(error), /rejected in MetaMask/);
    } finally {
      restore();
    }
  });
});

// Kept explicit so the fixtures cannot drift unnoticed.
test("fake wallet advertises the chain ids the checks rely on", () => {
  assert.equal(SEPOLIA_CHAIN_ID_HEX, "0xaa36a7");
  assert.equal(BigInt(SEPOLIA_CHAIN_ID_HEX), SEPOLIA_CHAIN_ID);
  assert.equal(MAINNET_CHAIN_ID_HEX, "0x1");
});
