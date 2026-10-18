import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("MediChainRecordsModule", (m) => {
  const records = m.contract("MediChainRecords");

  return { records };
});
