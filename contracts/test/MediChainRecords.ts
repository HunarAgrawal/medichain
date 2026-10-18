import { expect } from "chai";
import { network } from "hardhat";

const { ethers, networkHelpers } = await network.create();

const PATIENT_ID = "patient-001";
const SCAN_CID = "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi";
const REPORT_CID =
  "bafkreihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku";
const UNKNOWN_ID = "patient-unknown";

describe("MediChainRecords", function () {
  async function deployFixture() {
    const [owner, grantee, stranger] = await ethers.getSigners();
    const records = await ethers.deployContract("MediChainRecords");
    return { records, owner, grantee, stranger };
  }

  async function createdRecordFixture() {
    const fixture = await deployFixture();
    await fixture.records.createRecord(PATIENT_ID, SCAN_CID, REPORT_CID);
    return fixture;
  }

  async function grantedRecordFixture() {
    const fixture = await createdRecordFixture();
    await fixture.records.grantAccess(PATIENT_ID, fixture.grantee.address);
    return fixture;
  }

  describe("createRecord", function () {
    it("stores the record and emits RecordCreated", async function () {
      const { records, owner } =
        await networkHelpers.loadFixture(deployFixture);

      await expect(records.createRecord(PATIENT_ID, SCAN_CID, REPORT_CID))
        .to.emit(records, "RecordCreated")
        .withArgs(ethers.id(PATIENT_ID), owner.address, SCAN_CID, REPORT_CID);

      const createdAt = await networkHelpers.time.latest();
      expect(await records.recordExists(PATIENT_ID)).to.equal(true);
      expect(await records.getRecord(PATIENT_ID)).to.deep.equal([
        owner.address,
        BigInt(createdAt),
        SCAN_CID,
        REPORT_CID,
      ]);
    });

    it("accepts a 64-byte patient ID and 128-byte CIDs", async function () {
      const { records } = await networkHelpers.loadFixture(deployFixture);
      const patientId = "p".repeat(64);

      await records.createRecord(patientId, "s".repeat(128), "r".repeat(128));

      expect(await records.recordExists(patientId)).to.equal(true);
    });

    for (const [label, patientId] of [
      ["an empty", ""],
      ["a 65-byte", "p".repeat(65)],
    ]) {
      it(`reverts InvalidPatientId for ${label} patient ID`, async function () {
        const { records } = await networkHelpers.loadFixture(deployFixture);

        await expect(
          records.createRecord(patientId, SCAN_CID, REPORT_CID),
        ).to.be.revertedWithCustomError(records, "InvalidPatientId");
      });
    }

    for (const [label, cid] of [
      ["an empty", ""],
      ["a 129-byte", "c".repeat(129)],
    ]) {
      it(`reverts InvalidCid for ${label} scan or report CID`, async function () {
        const { records } = await networkHelpers.loadFixture(deployFixture);

        await expect(
          records.createRecord(PATIENT_ID, cid, REPORT_CID),
        ).to.be.revertedWithCustomError(records, "InvalidCid");
        await expect(
          records.createRecord(PATIENT_ID, SCAN_CID, cid),
        ).to.be.revertedWithCustomError(records, "InvalidCid");
      });
    }

    it("reverts RecordAlreadyExists for a duplicate patient ID from any account", async function () {
      const { records, stranger } =
        await networkHelpers.loadFixture(createdRecordFixture);

      await expect(
        records.createRecord(PATIENT_ID, SCAN_CID, REPORT_CID),
      ).to.be.revertedWithCustomError(records, "RecordAlreadyExists");
      await expect(
        records
          .connect(stranger)
          .createRecord(PATIENT_ID, SCAN_CID, REPORT_CID),
      ).to.be.revertedWithCustomError(records, "RecordAlreadyExists");
    });
  });

  describe("getRecord", function () {
    it("reverts RecordNotFound for an unknown patient ID", async function () {
      const { records } =
        await networkHelpers.loadFixture(createdRecordFixture);

      await expect(records.getRecord(UNKNOWN_ID)).to.be.revertedWithCustomError(
        records,
        "RecordNotFound",
      );
    });

    it("uses msg.sender: a grantee can read, a stranger reverts AccessDenied", async function () {
      const { records, owner, grantee, stranger } =
        await networkHelpers.loadFixture(grantedRecordFixture);

      const [recordOwner, , scanCid, reportCid] = await records
        .connect(grantee)
        .getRecord(PATIENT_ID);
      expect([recordOwner, scanCid, reportCid]).to.deep.equal([
        owner.address,
        SCAN_CID,
        REPORT_CID,
      ]);

      await expect(
        records.connect(stranger).getRecord(PATIENT_ID),
      ).to.be.revertedWithCustomError(records, "AccessDenied");
    });

    it("honours `from` on a raw eth_call, as the backend issues it", async function () {
      const { records, grantee, stranger } =
        await networkHelpers.loadFixture(grantedRecordFixture);
      const call = {
        to: await records.getAddress(),
        data: records.interface.encodeFunctionData("getRecord", [PATIENT_ID]),
      };

      const result = await ethers.provider.call({
        ...call,
        from: grantee.address,
      });
      const [, , scanCid] = records.interface.decodeFunctionResult(
        "getRecord",
        result,
      );
      expect(scanCid).to.equal(SCAN_CID);

      await expect(
        ethers.provider.call({ ...call, from: stranger.address }),
      ).to.be.revertedWithCustomError(records, "AccessDenied");
    });

    it("reverts AccessDenied once access is revoked", async function () {
      const { records, grantee } =
        await networkHelpers.loadFixture(grantedRecordFixture);

      await records.revokeAccess(PATIENT_ID, grantee.address);

      await expect(
        records.connect(grantee).getRecord(PATIENT_ID),
      ).to.be.revertedWithCustomError(records, "AccessDenied");
    });
  });

  describe("grantAccess", function () {
    it("emits AccessGranted for a new grantee", async function () {
      const { records, grantee } =
        await networkHelpers.loadFixture(createdRecordFixture);

      await expect(records.grantAccess(PATIENT_ID, grantee.address))
        .to.emit(records, "AccessGranted")
        .withArgs(ethers.id(PATIENT_ID), grantee.address);
      expect(await records.hasAccess(PATIENT_ID, grantee.address)).to.equal(
        true,
      );
    });

    it("is idempotent and emits nothing for an existing grantee", async function () {
      const { records, grantee } =
        await networkHelpers.loadFixture(grantedRecordFixture);

      await expect(
        records.grantAccess(PATIENT_ID, grantee.address),
      ).not.to.emit(records, "AccessGranted");
      expect(await records.getGrantees(PATIENT_ID)).to.deep.equal([
        grantee.address,
      ]);
    });

    it("reverts InvalidPatientId for an empty or 65-byte patient ID", async function () {
      const { records, grantee } =
        await networkHelpers.loadFixture(createdRecordFixture);

      for (const patientId of ["", "p".repeat(65)]) {
        await expect(
          records.grantAccess(patientId, grantee.address),
        ).to.be.revertedWithCustomError(records, "InvalidPatientId");
      }
    });

    it("reverts RecordNotFound for an unknown patient ID", async function () {
      const { records, grantee } =
        await networkHelpers.loadFixture(createdRecordFixture);

      await expect(
        records.grantAccess(UNKNOWN_ID, grantee.address),
      ).to.be.revertedWithCustomError(records, "RecordNotFound");
    });

    it("reverts NotRecordOwner when the caller is not the owner", async function () {
      const { records, grantee, stranger } =
        await networkHelpers.loadFixture(grantedRecordFixture);

      await expect(
        records.connect(grantee).grantAccess(PATIENT_ID, stranger.address),
      ).to.be.revertedWithCustomError(records, "NotRecordOwner");
    });

    it("reverts InvalidGrantee for the zero address or the owner", async function () {
      const { records, owner } =
        await networkHelpers.loadFixture(createdRecordFixture);

      await expect(
        records.grantAccess(PATIENT_ID, ethers.ZeroAddress),
      ).to.be.revertedWithCustomError(records, "InvalidGrantee");
      await expect(
        records.grantAccess(PATIENT_ID, owner.address),
      ).to.be.revertedWithCustomError(records, "InvalidGrantee");
    });
  });

  describe("revokeAccess", function () {
    it("emits AccessRevoked and removes the grantee", async function () {
      const { records, grantee } =
        await networkHelpers.loadFixture(grantedRecordFixture);

      await expect(records.revokeAccess(PATIENT_ID, grantee.address))
        .to.emit(records, "AccessRevoked")
        .withArgs(ethers.id(PATIENT_ID), grantee.address);
      expect(await records.getGrantees(PATIENT_ID)).to.deep.equal([]);
    });

    it("emits nothing when the account is not a grantee", async function () {
      const { records, stranger } =
        await networkHelpers.loadFixture(grantedRecordFixture);

      await expect(
        records.revokeAccess(PATIENT_ID, stranger.address),
      ).not.to.emit(records, "AccessRevoked");
    });

    it("reverts InvalidPatientId for an empty or 65-byte patient ID", async function () {
      const { records, grantee } =
        await networkHelpers.loadFixture(grantedRecordFixture);

      for (const patientId of ["", "p".repeat(65)]) {
        await expect(
          records.revokeAccess(patientId, grantee.address),
        ).to.be.revertedWithCustomError(records, "InvalidPatientId");
      }
    });

    it("reverts RecordNotFound for an unknown patient ID", async function () {
      const { records, grantee } =
        await networkHelpers.loadFixture(grantedRecordFixture);

      await expect(
        records.revokeAccess(UNKNOWN_ID, grantee.address),
      ).to.be.revertedWithCustomError(records, "RecordNotFound");
    });

    it("reverts NotRecordOwner when the caller is not the owner", async function () {
      const { records, grantee } =
        await networkHelpers.loadFixture(grantedRecordFixture);

      await expect(
        records.connect(grantee).revokeAccess(PATIENT_ID, grantee.address),
      ).to.be.revertedWithCustomError(records, "NotRecordOwner");
    });
  });

  describe("hasAccess", function () {
    it("is true for the owner and a grantee, false for a revoked grantee and a stranger", async function () {
      const { records, owner, grantee, stranger } =
        await networkHelpers.loadFixture(grantedRecordFixture);

      expect(await records.hasAccess(PATIENT_ID, owner.address)).to.equal(true);
      expect(await records.hasAccess(PATIENT_ID, grantee.address)).to.equal(
        true,
      );
      expect(await records.hasAccess(PATIENT_ID, stranger.address)).to.equal(
        false,
      );

      await records.revokeAccess(PATIENT_ID, grantee.address);
      expect(await records.hasAccess(PATIENT_ID, grantee.address)).to.equal(
        false,
      );
    });

    it("is false for an unknown patient ID", async function () {
      const { records, owner } =
        await networkHelpers.loadFixture(createdRecordFixture);

      expect(await records.hasAccess(UNKNOWN_ID, owner.address)).to.equal(
        false,
      );
      expect(await records.recordExists(UNKNOWN_ID)).to.equal(false);
    });
  });

  describe("getGrantees", function () {
    it("returns the current grantees to the owner", async function () {
      const { records, grantee, stranger } =
        await networkHelpers.loadFixture(grantedRecordFixture);

      await records.grantAccess(PATIENT_ID, stranger.address);
      expect(await records.getGrantees(PATIENT_ID)).to.deep.equal([
        grantee.address,
        stranger.address,
      ]);

      await records.revokeAccess(PATIENT_ID, grantee.address);
      expect(await records.getGrantees(PATIENT_ID)).to.deep.equal([
        stranger.address,
      ]);
    });

    it("reverts NotRecordOwner for a grantee or a stranger", async function () {
      const { records, grantee, stranger } =
        await networkHelpers.loadFixture(grantedRecordFixture);

      for (const caller of [grantee, stranger]) {
        await expect(
          records.connect(caller).getGrantees(PATIENT_ID),
        ).to.be.revertedWithCustomError(records, "NotRecordOwner");
      }
    });

    it("reverts RecordNotFound for an unknown patient ID", async function () {
      const { records } =
        await networkHelpers.loadFixture(createdRecordFixture);

      await expect(
        records.getGrantees(UNKNOWN_ID),
      ).to.be.revertedWithCustomError(records, "RecordNotFound");
    });
  });
});
