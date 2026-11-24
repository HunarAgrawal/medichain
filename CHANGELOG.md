# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.4.0] - 2026-11-24

The hospital edition: a demo-ready product for hospitals, imaging centres, diagnostic labs and
teleradiology.

### Added

- Organizations (a hospital, imaging centre or teleradiology provider) with sites, editable
  letterhead details and tenant-scoped data.
- Hospital roles: technician, radiologist, pathologist, referring doctor, patient and admin, each
  with its own pages.
- Laboratory reporting alongside imaging: complete blood count and urine drug screen panels,
  results flagged as they are typed against sex-specific reference intervals and critical limits,
  a pathologist worklist, and a lab report PDF with the results table. Each reporting doctor signs
  only their own discipline.
- A patient registry with automatic UHIDs, optional ABHA numbers and optional patient-portal access.
- Studies with accession numbers, priority (routine, urgent or STAT), clinical indication, site and
  referring doctor, and a worklist ordered by priority and waiting time against targets.
- Reports with findings, impression and a critical-finding flag, templates per finding, and a PDF on
  the hospital's letterhead with the radiologist's registration number and times in IST.
- Referring doctors can read the reports they referred: the registry records each report's referrer.
- An operations dashboard: volume by department, turnaround against target, AI agreement for
  imaging, critical findings, and load per site and per reporting doctor.
- A landing page that shows every report type (live in the demo, or configurable per client),
  one-click demo roles with a presenter bar, sample scans and sample lab results.
- A one-command demo image (`make demo`), a free Hugging Face Space, a demo guide and a
  hosted-demo guide.
- Fifteen more openly licensed sample scans, including two the models get wrong.

### Changed

- `publishRecord` takes a `referrer`, and records store it (contract, ABI and backend).
- The seed builds a fictional Indian hospital with a month of history, anchored on-chain at the
  times each report was signed.
- File storage defaults to a local encrypted store; IPFS (Kubo or Pinata) remains available.
  `IPFS_PROVIDER` is now `STORAGE_PROVIDER`; the old name still works.
- The API can serve the built web app (`STATIC_DIR`) for single-server installs.

### Removed

- The single clinician role (now radiologist, pathologist and referring doctor) and the admin
  overview page (now the dashboard).

### Security

- The seed script no longer writes the demo password to its log (CodeQL clear-text logging alert).

## [0.3.0] - 2026-10-23

The role-based platform.

### Added

- Patient, clinician and admin roles, each with its own pages, and a public report verification page.
- Email and password accounts with revocable server-side sessions and one-click demo accounts.
- Clinician review workflow: AI draft, final finding, impression and attestation, then a signed one-page PDF report.
- `MediChainRegistry` contract: clinician registry, patient-owned consent, report hash index and `Ownable2Step`.
- Platform-held wallets for patients and clinicians, so each on-chain action is signed by the person who took it.
- Audit log, record history for patients and a system overview for admins.
- Openly licensed sample scans, `make seed` and `make fresh`.
- AGPL-3.0-only license, citation metadata, code of conduct, issue forms and Dependabot.

### Changed

- One on-chain record per study with a random ID. No names or IDs are stored on-chain.
- Heatmaps highlight only the strongest regions. Reports embed JPEG images, cutting their size by about 90%.
- The development server runs on `localhost:3000` and proxies `/api` to the backend.

### Removed

- MetaMask sign-in and all wallet code in the browser.
- The `MediChainRecords` contract, which is incompatible with the new registry.

## [0.2.0] - 2026-10-18

The secure rebuild.

### Added

- Modular FastAPI backend with wallet sign-in, AES-256-GCM encryption before IPFS and on-chain access checks.
- Fine-tuned ViT models for brain MRI and chest X-ray, with attention heatmaps.
- `MediChainRecords` contract with Hardhat 3 tests.
- Vite, React 19, TypeScript and Tailwind frontend.
- Makefile, Docker Compose for local IPFS, and CI for all three packages.

### Removed

- Simulated AI labels and the Pinata JWT in the browser bundle.

### Security

- Patient files were stored unencrypted on public IPFS. They are now encrypted before upload.

## [0.1.0] - 2026-06-03

- Initial MVP: Create React App frontend, a single-file FastAPI service and a contract deployed from Remix.

[Unreleased]: https://github.com/HunarAgrawal/medichain/compare/v0.4.0...HEAD
[0.4.0]: https://github.com/HunarAgrawal/medichain/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/HunarAgrawal/medichain/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/HunarAgrawal/medichain/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/HunarAgrawal/medichain/releases/tag/v0.1.0
