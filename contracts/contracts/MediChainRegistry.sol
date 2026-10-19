// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.34;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {EnumerableSet} from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

/// @title MediChainRegistry
/// @notice Provenance and consent ledger for medical imaging studies. The owner verifies clinicians,
/// verified clinicians publish each study's encrypted scan and report CIDs for a patient, patients
/// grant or revoke clinicians, and anyone can verify a report PDF by its SHA-256.
/// @dev Storage and events are public on-chain, so CIDs must point to encrypted content.
contract MediChainRegistry is Ownable2Step {
    using EnumerableSet for EnumerableSet.AddressSet;

    struct Record {
        address patient;
        uint64 publishedAt;
        address issuer;
        bytes32 reportHash; // SHA-256 of the plaintext PDF report
        string scanCid;
        string reportCid;
    }

    uint256 private constant MAX_CID_LENGTH = 128;

    mapping(bytes32 recordId => Record) private _records;
    mapping(bytes32 reportHash => bytes32 recordId) private _recordIdByReportHash;
    mapping(address account => bool) private _clinicians;
    mapping(address patient => EnumerableSet.AddressSet) private _cliniciansOf;
    mapping(address clinician => EnumerableSet.AddressSet) private _patientsOf;

    event ClinicianUpdated(address indexed clinician, bool active);
    event RecordPublished(
        bytes32 indexed recordId, address indexed patient, address indexed issuer, bytes32 reportHash
    );
    event AccessGranted(address indexed patient, address indexed clinician);
    event AccessRevoked(address indexed patient, address indexed clinician);

    error NotClinician();
    error InvalidAddress();
    error InvalidRecordId();
    error InvalidHash();
    error InvalidCid();
    error RecordAlreadyExists();
    error DuplicateReport();
    error RecordNotFound();
    error AccessDenied();
    error RenounceDisabled();

    /// @param initialOwner The operator account that verifies clinicians.
    constructor(address initialOwner) Ownable(initialOwner) {}

    /// @notice Always reverts: renouncing ownership would permanently freeze the clinician registry.
    function renounceOwnership() public pure override {
        revert RenounceDisabled();
    }

    /// @notice Marks `clinician` as verified or not. Only the owner can call this; unchanged statuses
    /// are no-ops.
    /// @dev Deactivation leaves the clinician's grants in place but `canAccess` ignores them until the
    /// clinician is reactivated.
    function setClinician(address clinician, bool active) external onlyOwner {
        if (clinician == address(0)) revert InvalidAddress();
        if (_clinicians[clinician] == active) return;

        _clinicians[clinician] = active;
        emit ClinicianUpdated(clinician, active);
    }

    /// @notice Returns whether `account` is a verified clinician.
    function isClinician(address account) external view returns (bool) {
        return _clinicians[account];
    }

    /// @notice Publishes a study for `patient`, issued by the calling clinician.
    /// @param recordId A random, unused, non-zero identifier for the study.
    /// @param reportHash The SHA-256 of the plaintext PDF report. Each report can be published once.
    /// @param scanCid The IPFS CID of the encrypted scan, 1 to 128 bytes.
    /// @param reportCid The IPFS CID of the encrypted report, 1 to 128 bytes.
    function publishRecord(
        bytes32 recordId,
        address patient,
        bytes32 reportHash,
        string calldata scanCid,
        string calldata reportCid
    ) external {
        if (!_clinicians[msg.sender]) revert NotClinician();
        if (recordId == bytes32(0)) revert InvalidRecordId();
        if (patient == address(0) || patient == msg.sender) revert InvalidAddress();
        if (reportHash == bytes32(0)) revert InvalidHash();
        _validateCid(scanCid);
        _validateCid(reportCid);

        Record storage record = _records[recordId];
        if (record.patient != address(0)) revert RecordAlreadyExists();
        if (_recordIdByReportHash[reportHash] != bytes32(0)) revert DuplicateReport();

        record.patient = patient;
        record.publishedAt = uint64(block.timestamp);
        record.issuer = msg.sender;
        record.reportHash = reportHash;
        record.scanCid = scanCid;
        record.reportCid = reportCid;
        _recordIdByReportHash[reportHash] = recordId;

        emit RecordPublished(recordId, patient, msg.sender, reportHash);
    }

    /// @notice Lets `clinician` read all of the caller's records. Repeat grants are no-ops.
    function grantAccess(address clinician) external {
        if (clinician == address(0) || clinician == msg.sender) revert InvalidAddress();
        if (!_clinicians[clinician]) revert NotClinician();

        if (_cliniciansOf[msg.sender].add(clinician)) {
            _patientsOf[clinician].add(msg.sender);
            emit AccessGranted(msg.sender, clinician);
        }
    }

    /// @notice Withdraws `clinician`'s access to the caller's records. Revoking a clinician without
    /// access is a no-op.
    function revokeAccess(address clinician) external {
        if (_cliniciansOf[msg.sender].remove(clinician)) {
            _patientsOf[clinician].remove(msg.sender);
            emit AccessRevoked(msg.sender, clinician);
        }
    }

    /// @notice Returns whether `account` may read the record: its patient, or a verified clinician who
    /// issued it or was granted access by the patient. False for an unknown record.
    function canAccess(bytes32 recordId, address account) external view returns (bool) {
        Record storage record = _records[recordId];
        return record.patient != address(0) && _canAccess(record, account);
    }

    /// @notice Returns the record. The caller must pass `canAccess`.
    /// @dev These checks are advisory: anyone can `eth_call` with any `from`, and storage is public.
    /// Confidentiality comes from the off-chain encryption of the content the CIDs point to.
    function getRecord(bytes32 recordId) external view returns (Record memory) {
        Record storage record = _records[recordId];
        if (record.patient == address(0)) revert RecordNotFound();
        if (!_canAccess(record, msg.sender)) revert AccessDenied();

        return record;
    }

    /// @notice Looks up the record that published a report. Returns zeros for an unknown hash.
    function verifyReport(bytes32 reportHash)
        external
        view
        returns (bytes32 recordId, address issuer, uint64 publishedAt)
    {
        recordId = _recordIdByReportHash[reportHash];
        // An unknown hash maps to recordId 0, which can never be published, so every field is zero.
        Record storage record = _records[recordId];
        return (recordId, record.issuer, record.publishedAt);
    }

    /// @notice Returns the clinicians `patient` has granted access to. Unbounded; meant for off-chain calls.
    function cliniciansOf(address patient) external view returns (address[] memory) {
        return _cliniciansOf[patient].values();
    }

    /// @notice Returns the patients who have granted `clinician` access. Unbounded; meant for off-chain calls.
    function patientsOf(address clinician) external view returns (address[] memory) {
        return _patientsOf[clinician].values();
    }

    function _canAccess(Record storage record, address account) private view returns (bool) {
        address patient = record.patient;
        if (account == patient) return true;

        return _clinicians[account] && (account == record.issuer || _cliniciansOf[patient].contains(account));
    }

    function _validateCid(string calldata cid) private pure {
        uint256 length = bytes(cid).length;
        if (length == 0 || length > MAX_CID_LENGTH) revert InvalidCid();
    }
}
