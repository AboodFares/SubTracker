# ── ML classifier service: FastAPI + scikit-learn ──────────────────────
# python:3.11-slim (Debian/glibc) so scikit-learn's prebuilt wheels install
# cleanly — the same reason the backend uses node:22-slim, not Alpine.

FROM python:3.11-slim

WORKDIR /app

# Install deps first so this layer is cached and only re-runs when
# requirements.txt changes (not on every code edit).
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the app code. The MODEL itself is NOT baked in — it's mounted at
# /models at runtime via docker-compose (single source of truth, and picks up
# retrained models on restart without rebuilding this image).
COPY app.py .

# The service listens on 8000
EXPOSE 8000

# uvicorn is the ASGI server that actually runs the FastAPI `app` object in
# app.py. --host 0.0.0.0 makes it reachable from other containers, not just
# localhost inside this one.
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
