// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.34;

import {EnumerableSet} from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

/// @title MediChainRecords
/// @notice Anchors the IPFS CIDs of an encrypted medical scan and its report under a patient ID,
/// with owner-managed read access.
/// @dev Access control only gates this contract's getters. Storage and events are public on-chain,
/// so CIDs must point to encrypted content.
contract MediChainRecords {
    using EnumerableSet for EnumerableSet.AddressSet;

    struct Record {
        address owner;
        uint64 createdAt;
        string scanCid;
        string reportCid;
    }

    uint256 private constant MAX_PATIENT_ID_LENGTH = 64;
    uint256 private constant MAX_CID_LENGTH = 128;

    mapping(bytes32 recordKey => Record) private _records;
    mapping(bytes32 recordKey => EnumerableSet.AddressSet) private _grantees;

    event RecordCreated(bytes32 indexed recordKey, address indexed owner, string scanCid, string reportCid);
    event AccessGranted(bytes32 indexed recordKey, address indexed grantee);
    event AccessRevoked(bytes32 indexed recordKey, address indexed grantee);

    error InvalidPatientId();
    error InvalidCid();
    error RecordAlreadyExists();
    error RecordNotFound();
    error NotRecordOwner();
    error AccessDenied();
    error InvalidGrantee();

    /// @notice Creates the record for `patientId`, owned by the caller.
    function createRecord(string calldata patientId, string calldata scanCid, string calldata reportCid) external {
        bytes32 recordKey = _validatedRecordKey(patientId);
        _validateCid(scanCid);
        _validateCid(reportCid);

        Record storage record = _records[recordKey];
        if (record.owner != address(0)) revert RecordAlreadyExists();

        record.owner = msg.sender;
        record.createdAt = uint64(block.timestamp);
        record.scanCid = scanCid;
        record.reportCid = reportCid;

        emit RecordCreated(recordKey, msg.sender, scanCid, reportCid);
    }

    /// @notice Lets `grantee` read the record. Only the owner can call this; repeat grants are no-ops.
    function grantAccess(string calldata patientId, address grantee) external {
        bytes32 recordKey = _validatedRecordKey(patientId);
        _checkOwner(recordKey);
        if (grantee == address(0) || grantee == msg.sender) revert InvalidGrantee();

        if (_grantees[recordKey].add(grantee)) emit AccessGranted(recordKey, grantee);
    }

    /// @notice Removes `grantee`'s read access. Only the owner can call this; revoking a non-grantee is a no-op.
    function revokeAccess(string calldata patientId, address grantee) external {
        bytes32 recordKey = _validatedRecordKey(patientId);
        _checkOwner(recordKey);

        if (_grantees[recordKey].remove(grantee)) emit AccessRevoked(recordKey, grantee);
    }

    /// @notice Returns the record for `patientId`. The caller must be the owner or a grantee.
    function getRecord(string calldata patientId)
        external
        view
        returns (address owner, uint64 createdAt, string memory scanCid, string memory reportCid)
    {
        bytes32 recordKey = _recordKey(patientId);
        Record storage record = _records[recordKey];
        owner = record.owner;
        if (owner == address(0)) revert RecordNotFound();
        if (msg.sender != owner && !_grantees[recordKey].contains(msg.sender)) revert AccessDenied();

        return (owner, record.createdAt, record.scanCid, record.reportCid);
    }

    /// @notice Returns whether `account` is the owner or a grantee of the record for `patientId`.
    function hasAccess(string calldata patientId, address account) external view returns (bool) {
        bytes32 recordKey = _recordKey(patientId);
        address owner = _records[recordKey].owner;
        if (owner == address(0)) return false;

        return account == owner || _grantees[recordKey].contains(account);
    }

    /// @notice Returns whether a record exists for `patientId`.
    function recordExists(string calldata patientId) external view returns (bool) {
        return _records[_recordKey(patientId)].owner != address(0);
    }

    /// @notice Returns the current grantees of the record for `patientId`. Only the owner can call this.
    function getGrantees(string calldata patientId) external view returns (address[] memory) {
        bytes32 recordKey = _recordKey(patientId);
        _checkOwner(recordKey);

        return _grantees[recordKey].values();
    }

    function _checkOwner(bytes32 recordKey) private view {
        address owner = _records[recordKey].owner;
        if (owner == address(0)) revert RecordNotFound();
        if (msg.sender != owner) revert NotRecordOwner();
    }

    function _validatedRecordKey(string calldata patientId) private pure returns (bytes32) {
        uint256 length = bytes(patientId).length;
        if (length == 0 || length > MAX_PATIENT_ID_LENGTH) revert InvalidPatientId();

        return _recordKey(patientId);
    }

    function _validateCid(string calldata cid) private pure {
        uint256 length = bytes(cid).length;
        if (length == 0 || length > MAX_CID_LENGTH) revert InvalidCid();
    }

    function _recordKey(string calldata patientId) private pure returns (bytes32) {
        return keccak256(bytes(patientId));
    }
}
