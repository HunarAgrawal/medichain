// src/App.js

import { useState } from 'react';
import axios from 'axios';
import * as blockchainService from './blockchainService';
import './App.css';

function App() {
  const [walletAddress, setWalletAddress] = useState(null);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState({ message: '', type: 'info' });

  // Form-specific state
  const [createPatientId, setCreatePatientId] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [fetchPatientId, setFetchPatientId] = useState('');
  const [retrievedRecord, setRetrievedRecord] = useState(null);
  const [analysisType, setAnalysisType] = useState('brain_tumor');

  // NEW: additional patient details
  const [patientName, setPatientName] = useState('');
  const [patientAge, setPatientAge] = useState('');

  const pinataJWT = process.env.REACT_APP_PINATA_JWT;
  const apiBaseUrl = process.env.REACT_APP_API_BASE_URL || 'http://127.0.0.1:8000';

  const handleConnectWallet = async () => {
    try {
      const address = await blockchainService.connectWallet();
      setWalletAddress(address);
      setFeedback({ message: 'Wallet connected successfully.', type: 'success' });
    } catch (error) {
      console.error(error);
      setFeedback({ message: error.message, type: 'error' });
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    // UPDATED: validate new fields
    if (!createPatientId || !patientName || !patientAge || !selectedFile) {
      alert('Please fill out all patient details and select a file.');
      return;
    }

    if (!pinataJWT) {
      setFeedback({
        message: 'Missing Pinata JWT. Add REACT_APP_PINATA_JWT to your local .env file.',
        type: 'error'
      });
      return;
    }

    setLoading(true);
    setFeedback({ message: 'Step 1/6: Uploading scan to IPFS...', type: 'info' });
    setRetrievedRecord(null);

    try {
      // Step 1: Upload original scan to IPFS
      const imageFormData = new FormData();
      imageFormData.append('file', selectedFile);
      const imageRes = await axios.post(
        'https://api.pinata.cloud/pinning/pinFileToIPFS',
        imageFormData,
        { headers: { Authorization: `Bearer ${pinataJWT}` } }
      );
      const imageIpfsHash = imageRes.data.IpfsHash;

      setFeedback({ message: 'Step 2/6: Analyzing scan with AI...', type: 'info' });

      // Step 2: Send scan to the correct AI endpoint
      const aiFormData = new FormData();
      aiFormData.append('file', selectedFile);
      const aiEndpoint = `${apiBaseUrl}/analyze/${analysisType}`;
      const aiRes = await axios.post(aiEndpoint, aiFormData);

      setFeedback({ message: 'Step 3/6: Generating PDF report...', type: 'info' });

      // UPDATED: Step 3 – include patientName, patientAge, and top_predictions
      const reportData = {
        patientId: createPatientId,
        patientName: patientName,
        patientAge: patientAge,
        predictions: aiRes?.data?.top_predictions || [], // expects [{label, score}, ...]
        imageIpfsHash: imageIpfsHash,
        heatmapImageBase64: aiRes?.data?.heatmap_image_base64 || null
      };

      const pdfRes = await axios.post(
        `${apiBaseUrl}/generate-report/`,
        reportData,
        { responseType: 'blob' }
      );

      setFeedback({ message: 'Step 4/6: Uploading PDF report to IPFS...', type: 'info' });

      // Step 4: Upload generated PDF to IPFS
      const pdfFormData = new FormData();
      pdfFormData.append('file', pdfRes.data, `Report-${createPatientId}.pdf`);
      const pdfIpfsRes = await axios.post(
        'https://api.pinata.cloud/pinning/pinFileToIPFS',
        pdfFormData,
        { headers: { Authorization: `Bearer ${pinataJWT}` } }
      );
      const reportIpfsHash = pdfIpfsRes.data.IpfsHash;

      setFeedback({ message: 'Step 5/6: Creating record on blockchain...', type: 'info' });

      // Step 5: Create the initial record on the blockchain
      await blockchainService.registerRecord(createPatientId, imageIpfsHash);

      setFeedback({ message: 'Step 6/6: Attaching report to record...', type: 'info' });

      // Step 6: Add the report hash to the record on the blockchain
      await blockchainService.addReport(createPatientId, reportIpfsHash);

      // Prefer a readable top-1 label if available
      const top1 =
        (aiRes?.data?.top_predictions && aiRes.data.top_predictions[0]?.label) ||
        aiRes?.data?.prediction ||
        'Completed';

      setFeedback({
        message: `Success! Report for ${createPatientId} created (${patientName}, ${patientAge}). Top prediction: ${top1}`,
        type: 'success'
      });

    } catch (error) {
      console.error(error);
      setFeedback({ message: error.message, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  // In src/App.js, replace your handleFetch function with this debug version
  const handleFetch = async (event) => {
    event.preventDefault();
    if (!fetchPatientId) return;
    setLoading(true);
    setFeedback({ message: `Fetching record for ${fetchPatientId}...`, type: 'info' });
    setRetrievedRecord(null);

    try {
      const record = await blockchainService.getRecord(fetchPatientId);

      // --- DEBUGGING LOG ---
      console.log('Record fetched from blockchain:', record);

      setRetrievedRecord(record);
      setFeedback({ message: `Record found for ${fetchPatientId}.`, type: 'success' });
    } catch (error) {
      console.error(error);
      setFeedback({ message: error.message, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="App">
      <header className="App-header">
        <h1>Medichain</h1>

        {walletAddress ? (
          <p>
            Connected: {walletAddress.substring(0, 6)}...
            {walletAddress.substring(38)}
          </p>
        ) : (
          <button onClick={handleConnectWallet}>Connect Wallet</button>
        )}

        <div className="card">
          <h2>Create New Patient Record</h2>
          <form onSubmit={handleSubmit}>
            {/* --- NEW FORM FIELDS --- */}
            <input
              type="text"
              placeholder="Enter Patient ID (e.g., P001)"
              onChange={(e) => setCreatePatientId(e.target.value)}
              required
            />
            <input
              type="text"
              placeholder="Enter Patient Name"
              onChange={(e) => setPatientName(e.target.value)}
              required
            />
            <input
              type="number"
              placeholder="Enter Patient Age"
              onChange={(e) => setPatientAge(e.target.value)}
              required
              min="0"
            />

            <select
              value={analysisType}
              onChange={(e) => setAnalysisType(e.target.value)}
              className="analysis-select"
            >
              <option value="brain_tumor">Brain Tumor MRI Analysis</option>
              <option value="chest_xray">Chest X-Ray Analysis</option>
            </select>

            <input
              type="file"
              onChange={(e) => setSelectedFile(e.target.files[0])}
              required
            />
            <button type="submit" disabled={loading || !walletAddress}>
              {loading ? 'Processing...' : 'Submit & Create Record'}
            </button>
          </form>
        </div>

        <div className="card">
          <h2>Fetch Patient Record 🔍</h2>
          <form onSubmit={handleFetch}>
            <input
              type="text"
              placeholder="Enter Patient ID to Fetch"
              onChange={(e) => setFetchPatientId(e.target.value)}
              required
            />
            <button type="submit" disabled={loading || !walletAddress}>
              {loading ? 'Processing...' : 'Fetch Record'}
            </button>
          </form>

          {retrievedRecord && (
            <div className="record-display">
              <h4>Record Details:</h4>
              <p>
                <strong>Owner:</strong> {retrievedRecord.owner}
              </p>
              <p>
                <strong>Image Hash:</strong>{' '}
                <a
                  href={`https://gateway.pinata.cloud/ipfs/${retrievedRecord.imageHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {retrievedRecord.imageHash}
                </a>
              </p>
              <p>
                <strong>Report Hash:</strong>{' '}
                {retrievedRecord.reportHash ? (
                  <a
                    href={`https://gateway.pinata.cloud/ipfs/${retrievedRecord.reportHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {retrievedRecord.reportHash}
                  </a>
                ) : (
                  'Not available'
                )}
              </p>
            </div>
          )}
        </div>

        {feedback.message && (
          <p className={`feedback-text ${feedback.type}`}>{feedback.message}</p>
        )}
      </header>
    </div>
  );
}

export default App;
