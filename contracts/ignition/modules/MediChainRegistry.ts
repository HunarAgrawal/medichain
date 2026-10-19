import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("MediChainRegistryModule", (m) => {
  const registry = m.contract("MediChainRegistry", [m.getAccount(0)]);

  return { registry };
});
