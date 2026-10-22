# Security policy

## Reporting a vulnerability

Report security issues privately through a
[GitHub security advisory](https://github.com/HunarAgrawal/medichain/security/advisories/new).
Do not open a public issue.

## Security model

The README's [security model](README.md#security-model) describes sign-in, sessions, on-chain
authorization, custodial keys, encryption at rest and request hardening.

## Keys and secrets

| Secret | Where it lives | If it leaks |
| --- | --- | --- |
| `ENCRYPTION_KEY` | `backend/.env` | Stored scans and reports can be decrypted by whoever also has the ciphertext. Rotate and re-encrypt. |
| `WALLET_ENCRYPTION_KEY` | `backend/.env` | Users' wallet keys can be unsealed from a database copy. Rotate, re-seal, and move consents to new keys. |
| `OPERATOR_PRIVATE_KEY` | `backend/.env` | Anyone can verify or remove clinicians on the registry. Transfer contract ownership (`transferOwnership` + `acceptOwnership`) to a new key. |
| `PINATA_JWT` | `backend/.env` | Revoke it in the Pinata dashboard and create a new one. |
| Database | `DATABASE_URL` | Holds sealed keys, sessions (hashed) and clinical text. Encrypt it at rest and restrict access. |
| Deployer key | Hardhat keystore | Only deploys. Keep it separate from the operator key in production. |

- **Back up both encryption keys.** Losing either makes data unreadable.
- The two encryption keys must differ; the API refuses to start otherwise.
- The public Hardhat key is only accepted on the local chain (31337), and never in production.
- After any leak: revoke, rotate, update only your local `.env`, and check git history before
  pushing.

## Data handling

- Do not commit `.env` files, databases, real patient scans, identifiers or generated reports.
- Use synthetic or properly consented data, on testnets only.
- The sample scans in `samples/` are de-identified public research images (CC BY 4.0).
