# ── Backend image: the Node.js API ─────────────────────────────────────
#
# node:22-slim is a small Debian-based Node image. The ML classifier used to
# run *inside* this image as a Python subprocess, which forced us to install
# Python + scikit-learn here (~1.9GB image). It now runs as its own FastAPI
# service (Backend/ml-service), so this image is pure Node again — much smaller.

FROM node:22-slim

# All app code lives under /app inside the container
WORKDIR /app

# Copy ONLY the manifests first, then install. Docker caches this layer, so
# "npm ci" re-runs only when package.json / package-lock.json change — not on
# every code edit. --omit=dev skips eslint/test deps we don't need at runtime.
COPY package*.json ./
RUN npm ci --omit=dev

# Copy the rest of the source. .dockerignore keeps out node_modules and the
# host's ml/.venv, so this layer stays small (just our source code).
COPY . .

# The API listens on 3000 (server.js reads process.env.PORT, default 3000).
# EXPOSE is documentation — the actual port mapping happens in compose/run.
EXPOSE 3000

# Start the server. Secrets (ANTHROPIC_API_KEY, MONGODB_URI, ...) and the
# ML_SERVICE_URL are injected at runtime via env vars — never baked in.
CMD ["node", "server.js"]
