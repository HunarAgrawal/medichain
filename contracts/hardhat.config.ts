import hardhatToolboxMochaEthersPlugin from "@nomicfoundation/hardhat-toolbox-mocha-ethers";
import { configVariable, defineConfig } from "hardhat/config";

// `npm run node` serves the devchain network. CHAIN_START_DAYS_AGO starts its clock in the past,
// so seeded demo history is anchored on-chain at the dates it was signed (see backend/app/seed.py).
const startDaysAgo = Number(process.env.CHAIN_START_DAYS_AGO ?? "0");

export default defineConfig({
  plugins: [hardhatToolboxMochaEthersPlugin],
  solidity: {
    version: "0.8.34",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    devchain: {
      type: "edr-simulated",
      chainType: "l1",
      ...(startDaysAgo > 0
        ? { initialDate: new Date(Date.now() - startDaysAgo * 86_400_000) }
        : {}),
    },
    localhost: {
      type: "http",
      chainType: "l1",
      url: "http://127.0.0.1:8545",
    },
    sepolia: {
      type: "http",
      chainType: "l1",
      url: configVariable("SEPOLIA_RPC_URL"),
      accounts: [configVariable("SEPOLIA_PRIVATE_KEY")],
    },
  },
});
