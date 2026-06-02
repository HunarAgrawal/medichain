# Contributing

Use small branches and pull requests so the team can review changes safely.

## Local Setup

1. Copy `.env.example` to `.env`.
2. Add your own Pinata JWT and deployed contract address.
3. Start the backend with `uvicorn main:app --reload --host 127.0.0.1 --port 8000`.
4. Start the frontend with `npm start`.

## Branches

Create a branch for each task:

```bash
git checkout -b feature/short-description
```

Recommended prefixes:

- `feature/` for new functionality
- `fix/` for bug fixes
- `docs/` for documentation-only changes
- `chore/` for maintenance

## Checks Before Pull Request

Run:

```bash
npm test -- --watchAll=false
npm run build
python -m py_compile main.py test_model.py
```

## Security Rules

- Do not commit `.env`, private keys, seed phrases, API keys, JWTs, patient data, or generated reports.
- Use testnet wallets and test data for demos.
- Rotate any credential that was accidentally committed or shared.
- Keep patient identifiers synthetic unless the project has proper compliance approval.
