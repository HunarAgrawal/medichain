# Security policy

## Reporting a vulnerability

Report security issues privately to the maintainer through a
[GitHub security advisory](https://github.com/HunarAgrawal/MEDICHAIN/security/advisories/new).
Do not open a public issue.

## Security model

The README's [security model](README.md#security-model) describes how authentication, on-chain
authorization, encryption at rest and request hardening work.

## Keys and secrets

| Secret                | Where it lives      | If it leaks                                                                                  |
| --------------------- | ------------------- | -------------------------------------------------------------------------------------------- |
| `ENCRYPTION_KEY`      | `backend/.env`      | Every stored file can be decrypted by whoever holds it and the CIDs. Rotate and re-encrypt.   |
| `JWT_SECRET`          | `backend/.env`      | Sessions can be forged. Rotate it; all users must sign in again.                             |
| `PINATA_JWT`          | `backend/.env`      | Revoke it in the Pinata dashboard and create a new one.                                      |
| Deployer private key  | Hardhat keystore    | Move funds and contract ownership work to a new key.                                         |

- **Back up `ENCRYPTION_KEY`.** Losing it makes every stored scan and report unreadable.
- Never put secrets in `frontend/.env`: everything there is bundled into public JavaScript.
- After any leak: revoke, rotate, update only your local `.env`, and check git history before
  pushing.

## Data handling

- Do not commit `.env` files, real patient scans, patient identifiers or generated reports.
- Patient IDs are stored on-chain in plain text. Use pseudonymous IDs.
- Use synthetic or properly consented data for demos, on testnets only.
