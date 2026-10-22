import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { createBlock } from "@ethereumjs/block";
import { createCustomCommon, Hardfork, Mainnet } from "@ethereumjs/common";
import { createLegacyTx } from "@ethereumjs/tx";
import {
  bytesToHex, createAccount, createAddressFromPrivateKey, hexToBytes,
} from "@ethereumjs/util";
import { createVM, runTx } from "@ethereumjs/vm";
import { Interface } from "ethers";
import solc from "solc";
import deployedSolc from "solc-deployed";

// Both compilers are pinned in package-lock.json. No RPC or wallet is used here.
export const profiles = [
  { name: "repository-default", compiler: solc, optimizer: true, evmVersion: "paris" },
  { name: "sepolia-reproduction", compiler: deployedSolc, optimizer: false, evmVersion: "osaka" },
];

export function compileFixtures(profile) {
  const source = readFileSync(new URL("../../contracts/MilestoneFund.sol", import.meta.url), "utf8");
  const input = {
    language: "Solidity",
    sources: {
      "MilestoneFund.sol": { content: profile.name === "sepolia-reproduction" ? source.replace(/\r\n/g, "\n") : source },
      "PaymentReceiver.sol": { content: readFileSync(new URL("../fixtures/PaymentReceiver.sol", import.meta.url), "utf8") },
    },
    settings: {
      optimizer: { enabled: profile.optimizer, runs: 200 },
      evmVersion: profile.evmVersion,
      outputSelection: { "*": { "*": ["abi", "evm.bytecode.object", "evm.deployedBytecode.object"] } },
    },
  };
  const output = JSON.parse(profile.compiler.compile(JSON.stringify(input)));
  const errors = (output.errors ?? []).filter((e) => e.severity === "error");
  assert.equal(errors.length, 0, errors.map((e) => e.formattedMessage).join("\n"));
  const repositoryAbi = JSON.parse(readFileSync(new URL("../../src/abi/MilestoneFund.json", import.meta.url), "utf8"));
  assert.deepEqual(output.contracts["MilestoneFund.sol"].MilestoneFund.abi, repositoryAbi, "Frontend ABI must match the compiled contract");
  return {
    fund: output.contracts["MilestoneFund.sol"].MilestoneFund,
    receiver: output.contracts["PaymentReceiver.sol"].PaymentReceiver,
  };
}

export async function localChain(artifacts) {
  const common = createCustomCommon({ chainId: 31337 }, Mainnet, { hardfork: Hardfork.Osaka });
  const vm = await createVM({ common });
  const accounts = {};
  for (const label of ["A", "B", "C", "D"]) {
    const key = randomBytes(32); // Ephemeral local test keys; never read or persist wallet credentials.
    const address = createAddressFromPrivateKey(key);
    accounts[label] = { key, address };
    await vm.stateManager.putAccount(address, createAccount({ balance: 10n ** 20n }));
  }
  let timestamp = 1_800_000_000n;
  let number = 0n;
  const block = () => createBlock({ header: {
    number, timestamp, gasLimit: 30_000_000n, baseFeePerGas: 1n,
  } }, { common });

  async function transact(actor, { to, data, value = 0n }) {
    const account = await vm.stateManager.getAccount(accounts[actor].address);
    const tx = createLegacyTx({
      to, data, value, nonce: account.nonce, gasLimit: 8_000_000n, gasPrice: 10n,
    }, { common }).sign(accounts[actor].key);
    number++;
    const result = await runTx(vm, { tx, block: block() });
    return { ...result, fee: result.totalGasSpent * tx.gasPrice };
  }

  async function deploy(actor, artifact, args = []) {
    const iface = new Interface(artifact.abi);
    const result = await transact(actor, {
      data: `0x${artifact.evm.bytecode.object}${iface.encodeDeploy(args).slice(2)}`,
    });
    assert.equal(result.receipt.status, 1, "Local contract deployment must succeed");
    return { address: result.createdAddress, iface };
  }
  const fund = await deploy("A", artifacts.fund);

  async function read(name, args = [], target = fund) {
    const result = await vm.evm.runCall({
      caller: accounts.A.address, to: target.address,
      data: hexToBytes(target.iface.encodeFunctionData(name, args)),
      gasLimit: 8_000_000n, block: block(),
      isStatic: true, skipNonceIncrement: true,
    });
    assert.equal(result.execResult.exceptionError, undefined, `Read ${name} failed`);
    return target.iface.decodeFunctionResult(name, bytesToHex(result.execResult.returnValue))[0];
  }
  const balance = async (address = fund.address) => (await vm.stateManager.getAccount(address))?.balance ?? 0n;
  async function fundFingerprint() {
    await vm.stateManager.getStateRoot(); // Flush cached storage before comparing contract state.
    const account = await vm.stateManager.getAccount(fund.address);
    return { storageRoot: bytesToHex(account.storageRoot), balance: account.balance };
  }
  async function send(actor, name, args = [], { value = 0n, target = fund, revert } = {}) {
    const before = revert ? await fundFingerprint() : null;
    const result = await transact(actor, {
      to: target.address, data: target.iface.encodeFunctionData(name, args), value,
    });
    if (revert) {
      assert.equal(result.receipt.status, 0, `${name} must revert`);
      const error = fund.iface.parseError(bytesToHex(result.execResult.returnValue));
      assert.equal(error?.name, "Error");
      assert.equal(error.args[0], revert, `${name} revert reason`);
      assert.deepEqual(await fundFingerprint(), before, `${name} must preserve contract storage and funds`);
      assert.equal(result.execResult.logs.length, 0, "Reverted transactions must discard logs");
    } else {
      assert.equal(result.receipt.status, 1, `${name}: ${result.execResult.exceptionError?.error ?? "failed"}`);
    }
    const events = (result.execResult.logs ?? [])
      .filter(([address]) => bytesToHex(address).toLowerCase() === fund.address.toString().toLowerCase())
      .map(([, topics, data]) => fund.iface.parseLog({ topics: topics.map(bytesToHex), data: bytesToHex(data) }));
    return { ...result, events };
  }
  return {
    accounts, fund, read, send, deploy, balance,
    address: (actor) => accounts[actor].address.toString(),
    now: () => timestamp,
    at(time) { assert.ok(time >= timestamp, "Test time cannot move backwards"); timestamp = time; },
    async create({ creator = "A", target = 100n, deadline = timestamp + 100n } = {}) {
      const id = await read("projectCount");
      const result = await send(creator, "createProject", ["Local test", "Continuous state test", target, deadline, "Prototype", "Final demo"]);
      assert.equal(result.events.find((e) => e.name === "ProjectCreated").args.projectId, id);
      return id;
    },
  };
}
