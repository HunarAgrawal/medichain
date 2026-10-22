## Summary

-

## Checks

- [ ] `make lint` passes
- [ ] `make test` passes
- [ ] If the contract changed: `npm run export-abi` was run and `backend/app/chain.py` is updated

## Security review

- [ ] No `.env` files, databases, keys, patient data or generated reports are included
- [ ] New endpoints have a role guard, and published-record access still goes through the contract
