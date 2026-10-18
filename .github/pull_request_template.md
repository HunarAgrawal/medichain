## Summary

-

## Checks

- [ ] `make lint` passes
- [ ] `make test` passes
- [ ] If the contract interface changed: `frontend/src/lib/chain.ts` (ABI) and `backend/app/chain.py` (selectors) are updated

## Security review

- [ ] No `.env` files, keys, JWTs, wallet secrets, patient data or generated reports are included
- [ ] New endpoints require sign-in unless they only expose public configuration
