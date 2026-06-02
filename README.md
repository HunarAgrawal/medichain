# Medichain

**A research-oriented prototype for trustworthy, AI-assisted medical imaging records using blockchain, IPFS, and explainable deep learning.**

Medichain explores how decentralized storage, smart-contract-based verification, and AI-assisted medical image analysis can be combined into a transparent digital health workflow. The project demonstrates a complete proof of concept where a medical scan is uploaded to IPFS, analyzed by an AI service, converted into a verifiable PDF report, and linked to an on-chain patient record through immutable content hashes.

> This repository is intended for academic research, prototype demonstration, and engineering experimentation. It is not a clinical diagnostic system. AI predictions are preliminary outputs and must be reviewed by qualified medical professionals.

## Research Motivation

Medical imaging workflows often face three connected challenges:

- **Trust:** Digital reports and image files can be copied, modified, or separated from their source evidence.
- **Continuity:** Patient records are frequently fragmented across institutions, systems, and storage providers.
- **Explainability:** AI predictions in medical imaging need visible supporting evidence, not only a final label.

Medichain addresses these challenges through a hybrid design:

- IPFS stores scan and report artifacts using content-addressed hashes.
- A blockchain smart contract stores the hashes as tamper-evident references.
- A FastAPI AI service generates top predictions and visual evidence such as heatmaps.
- A PDF report links the AI output, patient metadata, and IPFS verification QR code.
- A React interface provides a simple workflow for record creation and retrieval.

## Novelty

The novelty of this project is not in using a single technology, but in integrating several trust-focused components into one practical medical imaging pipeline:

1. **Content-addressed medical evidence:** Uploaded scan files and generated reports are represented by IPFS hashes, making file integrity independently verifiable.
2. **Blockchain-backed report provenance:** Smart contracts store image and report references so later users can verify whether a report belongs to the original uploaded scan.
3. **Explainable AI reporting:** The system can include visual evidence, such as Grad-CAM style heatmaps, inside the generated PDF report.
4. **Patient-record workflow simulation:** The prototype models a realistic path from scan upload to AI review, report generation, decentralized storage, and record retrieval.
5. **Research-ready modular architecture:** The frontend, backend, model layer, PDF generator, IPFS integration, and blockchain interface are separated so each part can be extended independently.

## Proposed Research Contribution

This project can be presented as a research prototype for:

- Secure and verifiable medical imaging record management.
- Blockchain-assisted auditability for AI-generated medical reports.
- Integration of explainable AI outputs into patient-facing or clinician-facing reports.
- Hybrid off-chain/on-chain storage for sensitive healthcare data workflows.
- A foundation for future work on consent management, access control, encryption, and model validation.

## System Overview

```text
Patient Scan
    |
    v
React Frontend -------- MetaMask Wallet
    |                         |
    |                         v
    |                  Smart Contract
    |                  stores IPFS hashes
    |
    +----> Pinata IPFS stores original scan
    |
    +----> FastAPI AI Service
              |
              +----> Image classification
              +----> Optional explainability heatmap
              +----> PDF report generation
                         |
                         v
                  Pinata IPFS stores report
```

## Key Features

- Patient record creation and lookup through a React frontend.
- MetaMask wallet connection using `ethers`.
- Scan and PDF upload to IPFS through Pinata.
- FastAPI backend for AI-assisted medical image analysis.
- Brain tumor MRI and chest X-ray analysis endpoints.
- Chest X-ray visual explanation through Grad-CAM or attention rollout fallback.
- PDF report generation with patient details, predictions, visual evidence, and IPFS QR verification.
- Smart contract integration for storing image and report hashes.
- Research documentation, contribution guide, security notes, and pull request template for team collaboration.

## Tech Stack

| Layer | Technology |
| --- | --- |
| Frontend | React, Axios, ethers.js |
| Backend | FastAPI, PyTorch, Hugging Face Transformers |
| Imaging | OpenCV, Pillow |
| Explainability | Grad-CAM, ViT attention rollout fallback |
| Reports | ReportLab, QRCode |
| Storage | Pinata IPFS |
| Blockchain | EVM-compatible smart contract through MetaMask |

## Project Structure

```text
medichain/
├── main.py                  # FastAPI AI and PDF service
├── test_model.py            # Standalone model loading smoke test
├── environment.yml          # Conda environment
├── requirements.txt         # pip dependencies
├── CONTRIBUTING.md          # Team contribution workflow
├── SECURITY.md              # Sensitive data and credential handling
├── src/
│   ├── App.js               # React application workflow
│   ├── blockchainService.js # MetaMask and contract calls
│   └── constants.js         # Contract ABI and env-based address
└── public/                  # React static assets
```

## Application Workflow

1. User connects a MetaMask wallet.
2. User enters patient ID, name, and age.
3. User selects an analysis type.
4. User uploads a medical scan image.
5. The frontend uploads the original scan to Pinata IPFS.
6. The backend analyzes the scan and returns top predictions.
7. The backend generates a PDF report with prediction details and optional heatmap evidence.
8. The frontend uploads the PDF report to Pinata IPFS.
9. The frontend stores the scan and report hashes in the smart contract.
10. A record can later be fetched by patient ID and verified through IPFS links.

## Prerequisites

- Node.js 18 or newer
- npm
- Python 3.10
- Conda or pip virtual environment
- MetaMask browser extension
- Pinata account and JWT
- Deployed smart contract compatible with the ABI in `src/constants.js`

## Environment Variables

Create a local `.env` file from the example:

```bash
cp .env.example .env
```

Then set:

```env
REACT_APP_API_BASE_URL=http://127.0.0.1:8000
REACT_APP_PINATA_JWT=your_pinata_jwt
REACT_APP_CONTRACT_ADDRESS=your_deployed_contract_address
```

React embeds `REACT_APP_*` values into the browser bundle. For production, move Pinata uploads behind a backend endpoint so the JWT is not exposed to users.

Optional backend variables:

```bash
export CORS_ORIGINS=http://localhost:3000
export BT_MODEL_NAME=google/vit-base-patch16-224-in21k
export CXR_MODEL_NAME=facebook/convnext-tiny-224
```

## Backend Setup

Using Conda:

```bash
conda env create -f environment.yml
conda activate medchain_env
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

Using pip:

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

Check the backend:

```bash
curl http://127.0.0.1:8000/health
```

The first backend startup can take time because Hugging Face model files may need to download.

## Frontend Setup

Install packages:

```bash
npm install
```

Start the React app:

```bash
npm start
```

Open:

```text
http://localhost:3000
```

## Smart Contract Configuration

Configure the contract in your local `.env` file:

- `REACT_APP_CONTRACT_ADDRESS`: deployed contract address.
- `contractABI` in `src/constants.js`: ABI copied from Remix, Hardhat, Foundry, or your deployment output.

The current frontend expects these contract functions:

- `registerRecord(string _patientId, string _imageHash)`
- `addReport(string _patientId, string _reportHash)`
- `getRecord(string _patientId)`
- `grantAccess(string _patientId, address _grantee)`

## Backend API

### `GET /health`

Returns service status, loaded models, active device, and PyTorch version.

### `POST /analyze/brain_tumor`

Accepts multipart form data:

```text
file: image file
```

Returns:

```json
{
  "top_predictions": [
    { "label": "Glioma", "score": 0.91 }
  ]
}
```

### `POST /analyze/chest_xray`

Accepts multipart form data:

```text
file: image file
```

Returns top predictions and an optional base64 heatmap image.

### `POST /generate-report/`

Accepts JSON:

```json
{
  "patientId": "P001",
  "patientName": "Patient Name",
  "patientAge": "45",
  "predictions": [
    { "label": "No Finding", "score": 0.88 }
  ],
  "imageIpfsHash": "Qm...",
  "heatmapImageBase64": null
}
```

Returns a PDF file.

## Testing

Frontend tests:

```bash
npm test
```

Production frontend build:

```bash
npm run build
```

Backend syntax check:

```bash
python -m py_compile main.py test_model.py
```

Backend model smoke test:

```bash
python test_model.py
```

## Team Workflow

1. Create a feature branch before making changes:

```bash
git checkout -b feature/short-description
```

2. Keep local secrets in `.env`; never commit `.env`.
3. Run checks before opening a pull request:

```bash
npm test -- --watchAll=false
npm run build
python -m py_compile main.py test_model.py
```

4. Push the branch and open a pull request:

```bash
git push -u origin feature/short-description
```

## Security Notes

- Do not commit `.env` files, private keys, seed phrases, JWTs, or API keys.
- Revoke and rotate any Pinata JWT that was previously hard-coded or shared.
- Use testnet contracts and test wallets for demonstrations.
- Do not upload real patient data for demos unless proper consent, compliance controls, and secure infrastructure are in place.
- For production, move IPFS uploads to the backend and authenticate users before accepting uploads.

## Current Limitations

- `SIMULATE_LABELS` is enabled in `main.py`, so clinical labels are simulated for demonstration.
- The default Hugging Face models are general-purpose placeholder models, not clinically validated diagnostic models.
- Blockchain storage only contains IPFS hashes and ownership/access metadata, not encrypted patient records.
- The frontend exposes any `REACT_APP_*` variable in the browser bundle.
- Access control and encryption are simplified for MVP demonstration.

## Future Scope

- Add encrypted IPFS storage for protected medical files.
- Add role-based access control for patients, doctors, and institutions.
- Implement consent-based sharing and revocation logic.
- Validate the AI pipeline with curated medical imaging datasets.
- Add audit logs for report access and modification attempts.
- Move Pinata/IPFS upload logic to a secured backend service.
- Deploy smart contracts and backend services on a testnet/cloud environment.

## Suggested Citation

If this repository is used as part of an academic submission, cite it as:

```text
Medichain: A Blockchain and IPFS Based Prototype for Verifiable AI-Assisted Medical Imaging Records.
```

## License

No license has been selected yet. Add a license before public distribution if reuse by others should be clearly permitted.
