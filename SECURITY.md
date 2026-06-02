# Security Policy

## Sensitive Data

Do not commit:

- `.env` files
- API keys or JWTs
- Wallet private keys or seed phrases
- Real patient scans, patient identifiers, or medical reports
- Generated PDFs containing patient data

Use `.env.example` to document required variables without exposing real values.

## Credential Rotation

If a credential is committed, pasted into chat, or shared in a screenshot:

1. Revoke it immediately in the provider dashboard.
2. Create a new credential.
3. Update only your local `.env`.
4. Check Git history before pushing.

## Reporting Issues

Report security issues privately to the project maintainer instead of opening a public issue.
