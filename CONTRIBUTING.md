# Contributing

## Setup

Follow the quick start in the [README](README.md). `make setup` installs everything and creates
`backend/.env` with fresh keys; `make seed` adds the demo accounts.

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

- **Backend:** routes stay thin. Business rules (who can see or change what) live in
  `app/workflows.py`; infrastructure lives in plain modules (`chain`, `storage`, `crypto`,
  `wallets`, `ml/`, `report`). Domain errors become HTTP responses in `app/errors.py`. Every new
  behavior gets a test; tests use the fakes in `tests/conftest.py` (including an in-memory model
  of the contract) and never download models or touch the network.
- **Frontend:** pages live in `src/pages/<role>/`, shared building blocks in `src/components`,
  primitives in `src/components/ui`. Server state goes through TanStack Query. API types in
  `src/lib/api.ts` mirror the backend's snake_case fields.
- **Contract:** after changing `MediChainRegistry.sol`, run `npm run export-abi` in `contracts/`
  and update the signatures in `backend/app/chain.py`. Backend tests check them against
  `contracts/abi/`, and CI fails if the committed ABI is stale.

## License of contributions

By submitting a contribution, you agree that it is licensed under the project's license,
[AGPL-3.0-only](LICENSE).

## Security rules

- Never commit `.env` files, databases, keys, patient data or generated reports.
- Use testnets and synthetic data.
- If a secret leaks, rotate it immediately (see [SECURITY.md](SECURITY.md)).
