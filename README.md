# Medichain

Verifiable, AI-assisted medical imaging records. Medichain classifies a brain MRI or chest X-ray,
renders a PDF report, stores the scan and the report **encrypted** on IPFS, and anchors both on an
EVM chain under the uploader's wallet. The record owner decides on-chain which other wallets may open
it.

> **Research prototype.** Not a medical device and not clinically validated. AI findings are
> preliminary and must be reviewed by a qualified clinician. Use synthetic or consented data only.

## How it works

```text
Browser (React + wallet)
  1. Sign in: the wallet signs a one-time message, the API returns a 60-minute session token
  2. Upload scan + patient details
        │
        ▼
API (FastAPI)
  • validates the image, runs the ViT classifier, computes an attention heatmap
  • renders the PDF report (findings, heatmap, scan SHA-256, record QR code)
  • encrypts scan and report with AES-256-GCM and pins both to IPFS
  • returns predictions and the two CIDs
        │
        ▼
Browser → wallet sends createRecord(patientId, scanCid, reportCid) to MediChainRecords

Opening a record later:
  GET /api/v1/records/{id}/report → the API asks the contract (eth_call from the signed-in wallet)
  whether that wallet may read the record, fetches the blob from IPFS, decrypts and streams it.
```

## Security model

| Concern         | How it is handled                                                                                                                                                                                                  |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Authentication  | Sign-In-with-Ethereum style challenge (single use, 5 min) exchanged for an HS256 JWT. Optional wallet allowlist (`ALLOWED_WALLETS`).                                                                               |
| Authorization   | The contract is the single source of truth. Owners grant and revoke wallets on-chain. The API checks access with `eth_call` from the caller's address and never holds a private key.                              |
| Confidentiality | Files are encrypted before they leave the server, so IPFS only ever sees ciphertext. Third-party API keys (Pinata) stay on the server.                                                                              |
| Integrity       | AES-GCM authentication plus on-chain CIDs reject tampered or substituted blobs. Ciphertexts are bound to their patient ID and file kind, so they cannot be swapped between records. Reports embed the scan's SHA-256. |
| Hardening       | Upload size, type and pixel limits; decompression-bomb guard; strict input validation; per-IP and per-wallet rate limits; CORS allowlist; security headers; no stack traces in responses; patient IDs never logged; safetensors-only model loading. |
| Public data     | Patient IDs, owner addresses, CIDs and timestamps are on-chain and public. Use pseudonymous patient IDs.                                                                                                            |

## Models

| Analysis                | Model                                                                                                         | Classes                                  | Reported val. accuracy |
| ----------------------- | ------------------------------------------------------------------------------------------------------------- | ---------------------------------------- | ---------------------- |
| Brain tumor (MRI)       | [`Hemgg/brain-tumor-classification`](https://huggingface.co/Hemgg/brain-tumor-classification)                 | glioma, meningioma, pituitary, no tumor | 97.6%                  |
| Pneumonia (chest X-ray) | [`lxyuan/vit-xray-pneumonia-classification`](https://huggingface.co/lxyuan/vit-xray-pneumonia-classification) | normal, pneumonia                        | 97.4%                  |

Both are ViT-B/16 fine-tunes (86M parameters, Apache-2.0): about 70 ms per image on CPU and 25 ms on
Apple GPUs. Accuracies are the authors' validation figures, not independent clinical validation.
Weights download once (about 700 MB in total) on first use. Swap models with `BRAIN_TUMOR_MODEL` /
`CHEST_XRAY_MODEL`; CNN models get Grad-CAM heatmaps, ViT models get attention rollout.

## Repository layout

```text
backend/     FastAPI service: auth, inference, reports, encryption, IPFS, chain reads (+ tests)
contracts/   MediChainRecords.sol, Hardhat 3 tests and Ignition deployment
frontend/    React 19 + TypeScript + Tailwind app (Vite, Vitest)
Makefile     One entry point for setup, running, testing and linting
```

## Quick start

Prerequisites: Python 3.12, Node.js 22, Docker, and the MetaMask browser extension.

```bash
make setup      # Python venv, npm installs, .env files with freshly generated secrets
make ipfs       # local IPFS node (Docker)
make chain      # terminal 1: local chain on :8545
make deploy     # deploy the contract (its address matches the backend/.env default)
make backend    # terminal 2: API on :8000
make frontend   # terminal 3: app on http://localhost:5173
```

In MetaMask, import Hardhat's first test account (private key
`0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80`; it is public, never use it on a
real network). The app offers to add the "Hardhat local" network for you. After restarting
`make chain`, run `make deploy` again and clear MetaMask's activity data for that account
(Settings → Advanced), because the local chain starts again from block zero.

Run `make help` to list every command.

## API

| Method | Path                                          | Auth                     | Purpose                                            |
| ------ | --------------------------------------------- | ------------------------ | -------------------------------------------------- |
| GET    | `/api/v1/health`                              | none                     | Liveness                                           |
| GET    | `/api/v1/meta`                                | none                     | Chain ID, contract address, analyses, upload limit |
| POST   | `/api/v1/auth/challenge`                      | none                     | One-time sign-in message                           |
| POST   | `/api/v1/auth/session`                        | none                     | Signed message → session token                     |
| POST   | `/api/v1/analyses`                            | Bearer                   | Analyze, render report, encrypt, pin               |
| GET    | `/api/v1/records/{patient_id}/{scan\|report}` | Bearer + on-chain access | Decrypt and return a stored file                   |

Interactive docs are served at `/docs` when `ENABLE_DOCS=true`.

## Configuration

The backend reads `backend/.env`; every setting is documented in
[`backend/.env.example`](backend/.env.example). The frontend only needs `VITE_API_URL` and reads the
chain and contract from `GET /api/v1/meta`.

## Deploying beyond localhost

- **Contract:** store credentials with `npx hardhat keystore set SEPOLIA_RPC_URL` and
  `npx hardhat keystore set SEPOLIA_PRIVATE_KEY` in `contracts/`, then run `npm run deploy:sepolia`.
- **Backend:** set `ENVIRONMENT=production`, `ENABLE_DOCS=false`, real `CORS_ORIGINS` and
  `PUBLIC_APP_URL`, the chain settings (`CHAIN_ID=11155111`, `CHAIN_RPC_URL`, `CONTRACT_ADDRESS`)
  and `IPFS_PROVIDER=pinata` with `PINATA_JWT`. Run one worker behind an HTTPS reverse proxy with
  `uvicorn app.main:create_app --factory --proxy-headers --no-access-log` (the app logs route templates itself, so patient IDs never reach the logs).
- **Frontend:** run `npm run build` with `VITE_API_URL` set, then serve `frontend/dist` as static
  files.

## Limitations

- The models are community fine-tunes, not clinically validated.
- One server-held encryption key; there is no key rotation or per-user key yet.
- Sign-in challenges and rate limits live in memory, so the API runs as a single instance.
- PNG and JPEG only; DICOM is not supported.
- Files stay pinned if the on-chain transaction is abandoned.

## Research

An early, high-level write-up of this work: H. S. Agrawal, V. Bhatnagar, A. Kumar, K. Singla,
"Trusted Medical Imaging: A Blockchain Enabled Deep Learning Framework for Secure Healthcare,"
ACET 2025, [doi:10.1109/ACET67282.2025.11430313](https://doi.org/10.1109/ACET67282.2025.11430313).
This repository is the reference implementation and supersedes the paper's details.

## License

No license has been selected yet. All rights are reserved until one is added.
