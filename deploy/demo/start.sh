#!/bin/sh
# Start the self-contained demo: a local chain, the registry contract, a freshly seeded demo
# workspace, then the API serving the web app. Every start is a clean workspace with new keys.
set -eu
cd "$(dirname "$0")/../.."
ROOT="$(pwd)"
DATA="$ROOT/data"

if [ -n "${SPACE_HOST:-}" ]; then
  # Hugging Face Spaces: HTTPS at https://<owner>-<space>.hf.space behind Hugging Face's proxy.
  export PUBLIC_APP_URL="https://$SPACE_HOST" COOKIE_SECURE=true FORWARDED_ALLOW_IPS="*"
fi
key() { python -c 'import base64, os; print(base64.b64encode(os.urandom(32)).decode())'; }
export PUBLIC_APP_URL="${PUBLIC_APP_URL:-http://localhost:3000}"
export CORS_ORIGINS="${CORS_ORIGINS:-$PUBLIC_APP_URL}"
export ENCRYPTION_KEY="$(key)" WALLET_ENCRYPTION_KEY="$(key)"
export DATABASE_URL="sqlite+aiosqlite:///$DATA/medichain.db"
export STORAGE_PROVIDER=local STORAGE_DIR="$DATA/files" STATIC_DIR="$ROOT/frontend/dist"
export DEMO_MODE=true ENABLE_DOCS=false DEVICE=cpu HF_HUB_OFFLINE=1

rm -rf "$DATA" && mkdir -p "$DATA"

echo "==> Starting the local chain (its clock starts 45 days ago, for a month of history)"
(cd contracts && CHAIN_START_DAYS_AGO=45 ./node_modules/.bin/hardhat node --network devchain \
  --hostname 127.0.0.1 >"$DATA/chain.log" 2>&1 &)
python - <<'PY'
import json, time, urllib.request

request = urllib.request.Request(
    "http://127.0.0.1:8545",
    data=json.dumps({"jsonrpc": "2.0", "id": 1, "method": "eth_chainId", "params": []}).encode(),
    headers={"Content-Type": "application/json"},
)
for _ in range(120):
    try:
        urllib.request.urlopen(request, timeout=2)
        break
    except OSError:
        time.sleep(1)
else:
    raise SystemExit("The local chain did not start; see data/chain.log")
PY

echo "==> Deploying the registry contract"
(cd contracts && ./node_modules/.bin/hardhat ignition deploy ignition/modules/MediChainRegistry.ts \
  --network localhost --reset >"$DATA/deploy.log" 2>&1)

# The demo chain's operator is Hardhat's public development account (accepted only on chain 31337).
export CHAIN_ID=31337 CHAIN_RPC_URL=http://127.0.0.1:8545
export OPERATOR_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
CONTRACT_ADDRESS="$(python -c 'import json; print(json.load(open("contracts/ignition/deployments/chain-31337/deployed_addresses.json"))["MediChainRegistryModule#MediChainRegistry"])')"
export CONTRACT_ADDRESS

echo "==> Seeding the demo workspace"
(cd backend && python -m app.seed)

echo "==> Medichain is ready on port ${PORT:-7860} ($PUBLIC_APP_URL)"
cd backend
exec uvicorn app.main:create_app --factory --host 0.0.0.0 --port "${PORT:-7860}" \
  --no-access-log --proxy-headers
