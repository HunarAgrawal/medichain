// src/blockchainService.js (Updated)

import { ethers } from 'ethers';
import { contractAddress, contractABI } from './constants';

const getBlockchainObjects = async () => {
    if (!window.ethereum) throw new Error("MetaMask is not installed.");
    if (!contractAddress) {
        throw new Error("Contract address is not configured. Set REACT_APP_CONTRACT_ADDRESS in your .env file.");
    }
    const provider = new ethers.BrowserProvider(window.ethereum);
    await provider.send("eth_requestAccounts", []);
    const signer = await provider.getSigner();
    const contract = new ethers.Contract(contractAddress, contractABI, signer);
    const walletAddress = await signer.getAddress();
    return { contract, walletAddress };
};

export const connectWallet = async () => {
    const { walletAddress } = await getBlockchainObjects();
    return walletAddress;
};

export const registerRecord = async (patientId, imageHash) => {
    const { contract, walletAddress } = await getBlockchainObjects();
    console.log(`CREATING RECORD: ID='${patientId}', Owner='${walletAddress}'`);
    const transaction = await contract.registerRecord(patientId, imageHash);
    await transaction.wait();
    return transaction;
};

export const getRecord = async (patientId) => {
    const { contract, walletAddress } = await getBlockchainObjects();
    console.log(`FETCHING RECORD: ID='${patientId}', Requester='${walletAddress}'`);
    
    try {
        const record = await contract.getRecord(patientId);
        
        // --- THIS IS THE CRUCIAL RETURN STATEMENT ---
        // It sends the data back to App.js.
        return {
            owner: record[0],
            imageHash: record[1],
            reportHash: record[2]
        };
    } catch (error) {
        // This part handles errors like "Access denied"
        if (error.message.includes("Access denied")) {
            throw new Error(`Access Denied: Your address (${walletAddress}) is not authorized for this record.`);
        }
        throw new Error("Failed to fetch record. It may not exist.");
    }
};

// --- NEW FUNCTION ---
export const addReport = async (patientId, reportHash) => {
    const { contract } = await getBlockchainObjects();
    console.log(`ADDING REPORT: ID='${patientId}', Report Hash='${reportHash}'`);
    const transaction = await contract.addReport(patientId, reportHash);
    await transaction.wait();
    return transaction;
};
