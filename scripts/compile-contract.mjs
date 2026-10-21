import fs from "node:fs";
import solc from "solc";

// Keep these settings identical to Remix. ABI is generated, never hand-maintained.
export function compile() {
  const input = {
    language: "Solidity",
    sources: {
      "MilestoneFund.sol": {
        content: fs.readFileSync("contracts/MilestoneFund.sol", "utf8"),
      },
    },
    settings: {
      optimizer: { enabled: true, runs: 200 },
      evmVersion: "paris",
      outputSelection: {
        "*": {
          "*": ["abi", "evm.bytecode.object", "evm.deployedBytecode.object"],
        },
      },
    },
  };
  const output = JSON.parse(solc.compile(JSON.stringify(input)));
  const errors = (output.errors ?? []).filter((e) => e.severity === "error");
  if (errors.length)
    throw new Error(errors.map((e) => e.formattedMessage).join("\n"));
  return output.contracts["MilestoneFund.sol"].MilestoneFund;
}

if (process.argv[1]?.endsWith("compile-contract.mjs")) {
  const artifact = compile();
  fs.mkdirSync("src/abi", { recursive: true });
  fs.mkdirSync("artifacts", { recursive: true });
  fs.writeFileSync(
    "src/abi/MilestoneFund.json",
    JSON.stringify(artifact.abi, null, 2) + "\n",
  );
  fs.writeFileSync(
    "artifacts/MilestoneFund.json",
    JSON.stringify(artifact, null, 2) + "\n",
  );
  console.log(
    `Solidity ${solc.version()}: compiled; ABI updated; deployed bytecode ${artifact.evm.deployedBytecode.object.length / 2} bytes.`,
  );
}
