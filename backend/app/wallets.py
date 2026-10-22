"""Custodial wallets: every patient and clinician gets an Ethereum key held by the platform.

Keys are sealed with WALLET_ENCRYPTION_KEY (separate from the file key) and bound to the user,
so a leaked database alone reveals no keys and a sealed key cannot be moved to another account.
"""

from eth_account import Account
from eth_account.signers.local import LocalAccount

from app.crypto import seal, unseal
from app.models import User


class WalletVault:
    def __init__(self, key: bytes) -> None:
        self._key = key

    def create(self, user: User) -> None:
        account = Account.create()
        user.wallet_address = account.address
        user.wallet_key = seal(self._key, bytes(account.key), kind="wallet", subject=user.id)

    def import_key(self, user: User, private_key: str) -> None:
        """Attach a known key (used to give demo accounts deterministic addresses)."""
        account = Account.from_key(private_key)
        user.wallet_address = account.address
        user.wallet_key = seal(self._key, bytes(account.key), kind="wallet", subject=user.id)

    def signer(self, user: User) -> LocalAccount:
        if user.wallet_key is None:
            raise ValueError(f"User {user.id} has no wallet")
        key = unseal(self._key, user.wallet_key, kind="wallet", subject=user.id)
        return Account.from_key(key)
