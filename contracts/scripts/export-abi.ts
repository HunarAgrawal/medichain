import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { artifacts, config } from "hardhat";

const CONTRACT = "MediChainRegistry";

const { abi } = await artifacts.readArtifact(CONTRACT);
const outFile = path.join(config.paths.root, "abi", `${CONTRACT}.json`);

await mkdir(path.dirname(outFile), { recursive: true });
await writeFile(outFile, `${JSON.stringify(abi, null, 2)}\n`);

console.log(`Wrote ${path.relative(config.paths.root, outFile)}`);
