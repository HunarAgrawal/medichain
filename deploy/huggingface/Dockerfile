# Hugging Face Space (Docker SDK): builds the demo image from the public GitHub repository.
# Copy this file and README.md into a new Docker Space; see docs/hosted-demo.md.
FROM python:3.12-slim-bookworm

COPY --from=node:22-bookworm-slim /usr/local/bin/node /usr/local/bin/node
COPY --from=node:22-bookworm-slim /usr/local/lib/node_modules /usr/local/lib/node_modules
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && ln -s /usr/local/lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm \
 && ln -s /usr/local/lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx \
 && useradd --create-home --uid 1000 medichain \
 && python -m venv /opt/venv \
 && mkdir /app && chown -R medichain:medichain /opt/venv /app

ENV PATH=/opt/venv/bin:$PATH \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    HF_HOME=/app/models \
    PORT=7860

# A branch or tag of https://github.com/HunarAgrawal/medichain. Change it and rebuild to update.
ARG MEDICHAIN_REF=main
USER medichain
RUN git clone --depth 1 --branch "$MEDICHAIN_REF" https://github.com/HunarAgrawal/medichain /app
WORKDIR /app
RUN deploy/demo/build.sh

EXPOSE 7860
CMD ["deploy/demo/start.sh"]
