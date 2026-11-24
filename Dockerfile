# The complete demo in one container: local chain, API, encrypted file store and web app.
#
#   make demo        (or: docker build -t medichain-demo . && docker run --rm -p 3000:7860 medichain-demo)
#
# Every start is a fresh demo workspace with new keys. For production, see the README.
FROM python:3.12-slim-bookworm

# Node.js runs the local chain and builds the web app and contracts.
COPY --from=node:22-bookworm-slim /usr/local/bin/node /usr/local/bin/node
COPY --from=node:22-bookworm-slim /usr/local/lib/node_modules /usr/local/lib/node_modules
RUN ln -s /usr/local/lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm \
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

USER medichain
WORKDIR /app
COPY --chown=medichain:medichain . .
RUN deploy/demo/build.sh

EXPOSE 7860
CMD ["deploy/demo/start.sh"]
