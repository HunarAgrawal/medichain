# Contributing

## Setup

Follow the quick start in the [README](README.md). `make setup` installs everything and creates
`.env` files with fresh secrets.

## Workflow

1. Branch from `main` with a prefix: `feature/`, `fix/`, `docs/`, `refactor/`, `test/` or `chore/`.
2. Keep each pull request focused on one change.
3. Write commit messages in the [Conventional Commits](https://www.conventionalcommits.org) style,
   for example `feat(backend): add DICOM upload support` or `fix(frontend): keep form on API error`.
4. Run the checks below, then open a pull request. CI runs the same checks.

```bash
make lint    # ruff, eslint, tsc, prettier
make test    # pytest, vitest, hardhat tests
make format  # auto-fix formatting
```

## Conventions

- **Backend:** routes stay thin. Business logic lives in plain modules (`pipeline`, `crypto`,
  `storage`, `chain`, `ml/`). Domain errors are mapped to HTTP responses in `app/errors.py`. Every
  new behavior gets a test; tests use the fakes in `tests/conftest.py` and never download models or
  touch the network.
- **Frontend:** feature code lives in `src/features/<feature>/`, shared primitives in
  `src/components/ui`. API types mirror the backend's snake_case fields.
- **Contract:** if you change the external interface, update the ABI in `frontend/src/lib/chain.ts`
  and the selectors in `backend/app/chain.py`. `backend/tests/test_chain.py` pins the selectors.

## Security rules

- Never commit `.env` files, keys, JWTs, wallet secrets, patient data or generated reports.
- Use testnet wallets and synthetic patient data.
- If a secret leaks, rotate it immediately (see [SECURITY.md](SECURITY.md)).
