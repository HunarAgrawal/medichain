import { expect } from "chai";
import { network } from "hardhat";

const { ethers, networkHelpers } = await network.create();

const RECORD_ID = ethers.id("record-001");
const OTHER_RECORD_ID = ethers.id("record-002");
const UNKNOWN_RECORD_ID = ethers.id("record-unknown");
const REPORT_HASH = ethers.sha256(ethers.toUtf8Bytes("report-001.pdf"));
const OTHER_REPORT_HASH = ethers.sha256(ethers.toUtf8Bytes("report-002.pdf"));
const SCAN_CID = "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi";
const REPORT_CID =
  "bafkreihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku";

describe("MediChainRegistry", function () {
  async function deployFixture() {
    const [
      owner,
      issuer,
      clinician,
      otherClinician,
      patient,
      otherPatient,
      stranger,
      newOwner,
    ] = await ethers.getSigners();
    const registry = await ethers.deployContract("MediChainRegistry", [
      owner.address,
    ]);
    return {
      registry,
      owner,
      issuer,
      clinician,
      otherClinician,
      patient,
      otherPatient,
      stranger,
      newOwner,
    };
  }

  async function cliniciansFixture() {
    const fixture = await deployFixture();
    for (const account of [
      fixture.issuer,
      fixture.clinician,
      fixture.otherClinician,
    ]) {
      await fixture.registry.setClinician(account.address, true);
    }
    return fixture;
  }

  // `issuer` publishes RECORD_ID for `patient`.
  async function publishedFixture() {
    const fixture = await cliniciansFixture();
    await fixture.registry
      .connect(fixture.issuer)
      .publishRecord(
        RECORD_ID,
        fixture.patient.address,
        REPORT_HASH,
        SCAN_CID,
        REPORT_CID,
      );
    return fixture;
  }

  // `patient` grants `clinician`; `otherClinician` stays verified but ungranted.
  async function grantedFixture() {
    const fixture = await publishedFixture();
    await fixture.registry
      .connect(fixture.patient)
      .grantAccess(fixture.clinician.address);
    return fixture;
  }

  it("lets the owner verify a clinician who publishes a record the patient reads", async function () {
    const { registry, issuer, patient } =
      await networkHelpers.loadFixture(deployFixture);

    await expect(registry.setClinician(issuer.address, true))
      .to.emit(registry, "ClinicianUpdated")
      .withArgs(issuer.address, true);
    await expect(
      registry
        .connect(issuer)
        .publishRecord(
          RECORD_ID,
          patient.address,
          REPORT_HASH,
          SCAN_CID,
          REPORT_CID,
        ),
    )
      .to.emit(registry, "RecordPublished")
      .withArgs(RECORD_ID, patient.address, issuer.address, REPORT_HASH);

    const publishedAt = BigInt(await networkHelpers.time.latest());
    expect(await registry.connect(patient).getRecord(RECORD_ID)).to.deep.equal(
      [
        patient.address,
        publishedAt,
        issuer.address,
        REPORT_HASH,
        SCAN_CID,
        REPORT_CID,
      ],
    );
  });

  describe("ownership", function () {
    it("starts with the initial owner and no pending owner", async function () {
      const { registry, owner } =
        await networkHelpers.loadFixture(deployFixture);

      expect(await registry.owner()).to.equal(owner.address);
      expect(await registry.pendingOwner()).to.equal(ethers.ZeroAddress);
    });

    it("reverts OwnableInvalidOwner for a zero initial owner", async function () {
      const { registry } = await networkHelpers.loadFixture(deployFixture);

      await expect(
        ethers.deployContract("MediChainRegistry", [ethers.ZeroAddress]),
      )
        .to.be.revertedWithCustomError(registry, "OwnableInvalidOwner")
        .withArgs(ethers.ZeroAddress);
    });

    it("reverts RenounceDisabled on renounceOwnership and keeps the owner", async function () {
      const { registry, owner } =
        await networkHelpers.loadFixture(deployFixture);

      await expect(registry.renounceOwnership()).to.be.revertedWithCustomError(
        registry,
        "RenounceDisabled",
      );
      // The ABI marks it pure, so also send a real transaction as a wallet could.
      await expect(
        owner.sendTransaction({
          to: await registry.getAddress(),
          data: registry.interface.encodeFunctionData("renounceOwnership"),
        }),
      ).to.be.revertedWithCustomError(registry, "RenounceDisabled");
      expect(await registry.owner()).to.equal(owner.address);
    });

    it("transfers ownership only once the new owner accepts", async function () {
      const { registry, owner, stranger, newOwner } =
        await networkHelpers.loadFixture(deployFixture);

      await expect(registry.transferOwnership(newOwner.address))
        .to.emit(registry, "OwnershipTransferStarted")
        .withArgs(owner.address, newOwner.address);
      expect(await registry.owner()).to.equal(owner.address);
      expect(await registry.pendingOwner()).to.equal(newOwner.address);

      await expect(registry.connect(stranger).acceptOwnership())
        .to.be.revertedWithCustomError(registry, "OwnableUnauthorizedAccount")
        .withArgs(stranger.address);

      await expect(registry.connect(newOwner).acceptOwnership())
        .to.emit(registry, "OwnershipTransferred")
        .withArgs(owner.address, newOwner.address);
      expect(await registry.owner()).to.equal(newOwner.address);
      expect(await registry.pendingOwner()).to.equal(ethers.ZeroAddress);

      await expect(registry.setClinician(stranger.address, true))
        .to.be.revertedWithCustomError(registry, "OwnableUnauthorizedAccount")
        .withArgs(owner.address);
      await registry.connect(newOwner).setClinician(stranger.address, true);
      expect(await registry.isClinician(stranger.address)).to.equal(true);
    });
  });

  describe("setClinician", function () {
    it("verifies a clinician and emits ClinicianUpdated", async function () {
      const { registry, clinician } =
        await networkHelpers.loadFixture(deployFixture);

      expect(await registry.isClinician(clinician.address)).to.equal(false);
      await expect(registry.setClinician(clinician.address, true))
        .to.emit(registry, "ClinicianUpdated")
        .withArgs(clinician.address, true);
      expect(await registry.isClinician(clinician.address)).to.equal(true);
    });

    it("emits only when the status changes", async function () {
      const { registry, clinician, stranger } =
        await networkHelpers.loadFixture(cliniciansFixture);

      await expect(registry.setClinician(clinician.address, true)).not.to.emit(
        registry,
        "ClinicianUpdated",
      );
      await expect(registry.setClinician(clinician.address, false))
        .to.emit(registry, "ClinicianUpdated")
        .withArgs(clinician.address, false);
      expect(await registry.isClinician(clinician.address)).to.equal(false);
      await expect(
        registry.setClinician(clinician.address, false),
      ).not.to.emit(registry, "ClinicianUpdated");
      await expect(registry.setClinician(stranger.address, false)).not.to.emit(
        registry,
        "ClinicianUpdated",
      );
    });

    it("reverts InvalidAddress for the zero address", async function () {
      const { registry } = await networkHelpers.loadFixture(deployFixture);

      await expect(
        registry.setClinician(ethers.ZeroAddress, true),
      ).to.be.revertedWithCustomError(registry, "InvalidAddress");
    });

    it("reverts OwnableUnauthorizedAccount for a clinician or a stranger", async function () {
      const { registry, clinician, stranger } =
        await networkHelpers.loadFixture(cliniciansFixture);

      for (const caller of [clinician, stranger]) {
        await expect(
          registry.connect(caller).setClinician(stranger.address, true),
        )
          .to.be.revertedWithCustomError(registry, "OwnableUnauthorizedAccount")
          .withArgs(caller.address);
      }
    });
  });

  describe("publishRecord", function () {
    it("accepts 1-byte and 128-byte CIDs", async function () {
      const { registry, issuer, patient } =
        await networkHelpers.loadFixture(cliniciansFixture);
      const cases = [
        [RECORD_ID, REPORT_HASH, "s", "r".repeat(128)],
        [OTHER_RECORD_ID, OTHER_REPORT_HASH, "s".repeat(128), "r"],
      ];

      for (const [recordId, reportHash, scanCid, reportCid] of cases) {
        await registry
          .connect(issuer)
          .publishRecord(
            recordId,
            patient.address,
            reportHash,
            scanCid,
            reportCid,
          );
        const record = await registry.connect(patient).getRecord(recordId);
        expect([record.scanCid, record.reportCid]).to.deep.equal([
          scanCid,
          reportCid,
        ]);
      }
    });

    it("reverts NotClinician for the owner, a stranger or a deactivated clinician", async function () {
      const { registry, owner, issuer, patient, stranger } =
        await networkHelpers.loadFixture(cliniciansFixture);
      await registry.setClinician(issuer.address, false);

      for (const caller of [owner, stranger, issuer]) {
        await expect(
          registry
            .connect(caller)
            .publishRecord(
              RECORD_ID,
              patient.address,
              REPORT_HASH,
              SCAN_CID,
              REPORT_CID,
            ),
        ).to.be.revertedWithCustomError(registry, "NotClinician");
      }
    });

    it("reverts InvalidRecordId for a zero record ID", async function () {
      const { registry, issuer, patient } =
        await networkHelpers.loadFixture(cliniciansFixture);

      await expect(
        registry
          .connect(issuer)
          .publishRecord(
            ethers.ZeroHash,
            patient.address,
            REPORT_HASH,
            SCAN_CID,
            REPORT_CID,
          ),
      ).to.be.revertedWithCustomError(registry, "InvalidRecordId");
    });

    it("reverts InvalidAddress for a zero patient or the issuer as patient", async function () {
      const { registry, issuer } =
        await networkHelpers.loadFixture(cliniciansFixture);

      for (const patient of [ethers.ZeroAddress, issuer.address]) {
        await expect(
          registry
            .connect(issuer)
            .publishRecord(
              RECORD_ID,
              patient,
              REPORT_HASH,
              SCAN_CID,
              REPORT_CID,
            ),
        ).to.be.revertedWithCustomError(registry, "InvalidAddress");
      }
    });

    it("reverts InvalidHash for a zero report hash", async function () {
      const { registry, issuer, patient } =
        await networkHelpers.loadFixture(cliniciansFixture);

      await expect(
        registry
          .connect(issuer)
          .publishRecord(
            RECORD_ID,
            patient.address,
            ethers.ZeroHash,
            SCAN_CID,
            REPORT_CID,
          ),
      ).to.be.revertedWithCustomError(registry, "InvalidHash");
    });

    for (const [label, cid] of [
      ["an empty", ""],
      ["a 129-byte", "c".repeat(129)],
    ]) {
      it(`reverts InvalidCid for ${label} scan or report CID`, async function () {
        const { registry, issuer, patient } =
          await networkHelpers.loadFixture(cliniciansFixture);
        const publisher = registry.connect(issuer);

        await expect(
          publisher.publishRecord(
            RECORD_ID,
            patient.address,
            REPORT_HASH,
            cid,
            REPORT_CID,
          ),
        ).to.be.revertedWithCustomError(registry, "InvalidCid");
        await expect(
          publisher.publishRecord(
            RECORD_ID,
            patient.address,
            REPORT_HASH,
            SCAN_CID,
            cid,
          ),
        ).to.be.revertedWithCustomError(registry, "InvalidCid");
      });
    }

    it("reverts RecordAlreadyExists for a used record ID from any clinician", async function () {
      const { registry, issuer, otherClinician, otherPatient } =
        await networkHelpers.loadFixture(publishedFixture);

      for (const caller of [issuer, otherClinician]) {
        await expect(
          registry
            .connect(caller)
            .publishRecord(
              RECORD_ID,
              otherPatient.address,
              OTHER_REPORT_HASH,
              SCAN_CID,
              REPORT_CID,
            ),
        ).to.be.revertedWithCustomError(registry, "RecordAlreadyExists");
      }
    });

    it("reverts DuplicateReport for an already published report hash", async function () {
      const { registry, otherClinician, otherPatient } =
        await networkHelpers.loadFixture(publishedFixture);

      await expect(
        registry
          .connect(otherClinician)
          .publishRecord(
            OTHER_RECORD_ID,
            otherPatient.address,
            REPORT_HASH,
            SCAN_CID,
            REPORT_CID,
          ),
      ).to.be.revertedWithCustomError(registry, "DuplicateReport");
    });
  });

  describe("grantAccess", function () {
    it("emits AccessGranted and updates both index sets", async function () {
      const { registry, clinician, patient } =
        await networkHelpers.loadFixture(publishedFixture);

      await expect(registry.connect(patient).grantAccess(clinician.address))
        .to.emit(registry, "AccessGranted")
        .withArgs(patient.address, clinician.address);
      expect(await registry.cliniciansOf(patient.address)).to.deep.equal([
        clinician.address,
      ]);
      expect(await registry.patientsOf(clinician.address)).to.deep.equal([
        patient.address,
      ]);
    });

    it("is idempotent and emits nothing on a repeat grant", async function () {
      const { registry, clinician, patient } =
        await networkHelpers.loadFixture(grantedFixture);

      await expect(
        registry.connect(patient).grantAccess(clinician.address),
      ).not.to.emit(registry, "AccessGranted");
      expect(await registry.cliniciansOf(patient.address)).to.deep.equal([
        clinician.address,
      ]);
      expect(await registry.patientsOf(clinician.address)).to.deep.equal([
        patient.address,
      ]);
    });

    it("reverts InvalidAddress for the zero address or the caller", async function () {
      const { registry, clinician, patient } =
        await networkHelpers.loadFixture(cliniciansFixture);

      await expect(
        registry.connect(patient).grantAccess(ethers.ZeroAddress),
      ).to.be.revertedWithCustomError(registry, "InvalidAddress");
      await expect(
        registry.connect(clinician).grantAccess(clinician.address),
      ).to.be.revertedWithCustomError(registry, "InvalidAddress");
    });

    it("reverts NotClinician for an unverified or deactivated clinician", async function () {
      const { registry, clinician, patient, stranger } =
        await networkHelpers.loadFixture(cliniciansFixture);
      await registry.setClinician(clinician.address, false);

      for (const account of [stranger, clinician]) {
        await expect(
          registry.connect(patient).grantAccess(account.address),
        ).to.be.revertedWithCustomError(registry, "NotClinician");
      }
    });
  });

  describe("revokeAccess", function () {
    it("emits AccessRevoked and updates both index sets", async function () {
      const { registry, clinician, patient } =
        await networkHelpers.loadFixture(grantedFixture);

      await expect(registry.connect(patient).revokeAccess(clinician.address))
        .to.emit(registry, "AccessRevoked")
        .withArgs(patient.address, clinician.address);
      expect(await registry.cliniciansOf(patient.address)).to.deep.equal([]);
      expect(await registry.patientsOf(clinician.address)).to.deep.equal([]);
    });

    it("emits nothing and does not revert when there is no grant", async function () {
      const { registry, clinician, patient, stranger } =
        await networkHelpers.loadFixture(grantedFixture);
      await registry.connect(patient).revokeAccess(clinician.address);

      for (const account of [
        clinician.address,
        stranger.address,
        ethers.ZeroAddress,
      ]) {
        await expect(
          registry.connect(patient).revokeAccess(account),
        ).not.to.emit(registry, "AccessRevoked");
      }
    });

    it("lets a patient revoke a deactivated clinician", async function () {
      const { registry, clinician, patient } =
        await networkHelpers.loadFixture(grantedFixture);
      await registry.setClinician(clinician.address, false);

      await expect(registry.connect(patient).revokeAccess(clinician.address))
        .to.emit(registry, "AccessRevoked")
        .withArgs(patient.address, clinician.address);
      expect(await registry.patientsOf(clinician.address)).to.deep.equal([]);
    });

    it("keeps both index sets in sync across patients and clinicians", async function () {
      const { registry, issuer, clinician, patient, otherPatient } =
        await networkHelpers.loadFixture(publishedFixture);

      await registry.connect(patient).grantAccess(issuer.address);
      await registry.connect(patient).grantAccess(clinician.address);
      await registry.connect(otherPatient).grantAccess(clinician.address);
      expect(await registry.cliniciansOf(patient.address)).to.deep.equal([
        issuer.address,
        clinician.address,
      ]);
      expect(await registry.patientsOf(clinician.address)).to.deep.equal([
        patient.address,
        otherPatient.address,
      ]);

      await registry.connect(patient).revokeAccess(clinician.address);
      expect(await registry.cliniciansOf(patient.address)).to.deep.equal([
        issuer.address,
      ]);
      expect(await registry.cliniciansOf(otherPatient.address)).to.deep.equal([
        clinician.address,
      ]);
      expect(await registry.patientsOf(clinician.address)).to.deep.equal([
        otherPatient.address,
      ]);
      expect(await registry.patientsOf(issuer.address)).to.deep.equal([
        patient.address,
      ]);
    });
  });

  describe("canAccess", function () {
    it("is true for the patient, the issuer and a granted clinician", async function () {
      const { registry, issuer, clinician, patient } =
        await networkHelpers.loadFixture(grantedFixture);

      for (const account of [patient, issuer, clinician]) {
        expect(await registry.canAccess(RECORD_ID, account.address)).to.equal(
          true,
        );
      }
    });

    it("is false for a stranger, an ungranted clinician and another patient", async function () {
      const { registry, otherClinician, otherPatient, stranger } =
        await networkHelpers.loadFixture(grantedFixture);

      for (const account of [stranger, otherClinician, otherPatient]) {
        expect(await registry.canAccess(RECORD_ID, account.address)).to.equal(
          false,
        );
      }
    });

    it("is false for an unknown record, even for its would-be patient", async function () {
      const { registry, patient } =
        await networkHelpers.loadFixture(grantedFixture);

      expect(
        await registry.canAccess(UNKNOWN_RECORD_ID, patient.address),
      ).to.equal(false);
    });

    it("is false for a revoked clinician", async function () {
      const { registry, clinician, patient } =
        await networkHelpers.loadFixture(grantedFixture);

      await registry.connect(patient).revokeAccess(clinician.address);

      expect(await registry.canAccess(RECORD_ID, clinician.address)).to.equal(
        false,
      );
    });

    it("is false for a deactivated issuer until reactivated", async function () {
      const { registry, issuer } =
        await networkHelpers.loadFixture(grantedFixture);

      await registry.setClinician(issuer.address, false);
      expect(await registry.canAccess(RECORD_ID, issuer.address)).to.equal(
        false,
      );

      await registry.setClinician(issuer.address, true);
      expect(await registry.canAccess(RECORD_ID, issuer.address)).to.equal(
        true,
      );
    });

    it("is false for a deactivated granted clinician, whose grant stays on record", async function () {
      const { registry, clinician, patient } =
        await networkHelpers.loadFixture(grantedFixture);

      await registry.setClinician(clinician.address, false);

      expect(await registry.canAccess(RECORD_ID, clinician.address)).to.equal(
        false,
      );
      expect(await registry.cliniciansOf(patient.address)).to.deep.equal([
        clinician.address,
      ]);
    });

    it("covers every record of the granting patient and no other patient's", async function () {
      const { registry, otherClinician, clinician, patient, otherPatient } =
        await networkHelpers.loadFixture(grantedFixture);
      const otherHash = ethers.sha256(ethers.toUtf8Bytes("report-003.pdf"));
      const otherPatientRecordId = ethers.id("record-003");

      await registry
        .connect(otherClinician)
        .publishRecord(
          OTHER_RECORD_ID,
          patient.address,
          OTHER_REPORT_HASH,
          SCAN_CID,
          REPORT_CID,
        );
      await registry
        .connect(otherClinician)
        .publishRecord(
          otherPatientRecordId,
          otherPatient.address,
          otherHash,
          SCAN_CID,
          REPORT_CID,
        );

      expect(
        await registry.canAccess(OTHER_RECORD_ID, clinician.address),
      ).to.equal(true);
      expect(
        await registry.canAccess(otherPatientRecordId, clinician.address),
      ).to.equal(false);
    });
  });

  describe("getRecord", function () {
    it("returns the record to the patient, the issuer and a granted clinician", async function () {
      const { registry, issuer, clinician, patient } =
        await networkHelpers.loadFixture(grantedFixture);

      for (const reader of [patient, issuer, clinician]) {
        const record = await registry.connect(reader).getRecord(RECORD_ID);
        expect([
          record.patient,
          record.issuer,
          record.reportHash,
          record.scanCid,
          record.reportCid,
        ]).to.deep.equal([
          patient.address,
          issuer.address,
          REPORT_HASH,
          SCAN_CID,
          REPORT_CID,
        ]);
      }
    });

    it("reverts AccessDenied for a stranger, an ungranted clinician or a deactivated issuer", async function () {
      const { registry, issuer, otherClinician, stranger } =
        await networkHelpers.loadFixture(grantedFixture);
      await registry.setClinician(issuer.address, false);

      for (const reader of [stranger, otherClinician, issuer]) {
        await expect(
          registry.connect(reader).getRecord(RECORD_ID),
        ).to.be.revertedWithCustomError(registry, "AccessDenied");
      }
    });

    it("reverts RecordNotFound for an unknown record ID", async function () {
      const { registry, patient } =
        await networkHelpers.loadFixture(grantedFixture);

      await expect(
        registry.connect(patient).getRecord(UNKNOWN_RECORD_ID),
      ).to.be.revertedWithCustomError(registry, "RecordNotFound");
    });

    it("honours `from` on a raw eth_call, as the backend issues it", async function () {
      const { registry, clinician, stranger } =
        await networkHelpers.loadFixture(grantedFixture);
      const call = {
        to: await registry.getAddress(),
        data: registry.interface.encodeFunctionData("getRecord", [RECORD_ID]),
      };

      const result = await ethers.provider.call({
        ...call,
        from: clinician.address,
      });
      const [record] = registry.interface.decodeFunctionResult(
        "getRecord",
        result,
      );
      expect(record.scanCid).to.equal(SCAN_CID);

      await expect(
        ethers.provider.call({ ...call, from: stranger.address }),
      ).to.be.revertedWithCustomError(registry, "AccessDenied");
    });
  });

  describe("verifyReport", function () {
    it("returns the record ID, issuer and publish time for a known hash", async function () {
      const { registry, issuer } =
        await networkHelpers.loadFixture(publishedFixture);
      const publishedAt = BigInt(await networkHelpers.time.latest());

      expect(await registry.verifyReport(REPORT_HASH)).to.deep.equal([
        RECORD_ID,
        issuer.address,
        publishedAt,
      ]);
    });

    it("returns zeros for an unknown or zero hash", async function () {
      const { registry } = await networkHelpers.loadFixture(publishedFixture);

      for (const reportHash of [OTHER_REPORT_HASH, ethers.ZeroHash]) {
        expect(await registry.verifyReport(reportHash)).to.deep.equal([
          ethers.ZeroHash,
          ethers.ZeroAddress,
          0n,
        ]);
      }
    });
  });
});
