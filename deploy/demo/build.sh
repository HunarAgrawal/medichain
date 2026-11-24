#!/bin/sh
# Build everything the self-contained demo needs, inside the image (see Dockerfile).
set -eu
cd "$(dirname "$0")/../.."

echo "==> Web app"
(cd frontend && npm ci --no-audit --no-fund && npm run build && rm -rf node_modules)

echo "==> Contracts (the local chain and the deployment run from here at start-up)"
(cd contracts && npm ci --no-audit --no-fund && npx hardhat build)

echo "==> API, with CPU-only PyTorch (a fraction of the CUDA build's size)"
pip install --index-url https://download.pytorch.org/whl/cpu torch
pip install -e ./backend

echo "==> AI models, baked in so start-up needs no network"
python - <<'PY'
from huggingface_hub import snapshot_download

for model in ("Hemgg/brain-tumor-classification", "lxyuan/vit-xray-pneumonia-classification"):
    snapshot_download(model, allow_patterns=["*.json", "*.safetensors"])
    print("cached", model)
PY

npm cache clean --force >/dev/null 2>&1 || true
