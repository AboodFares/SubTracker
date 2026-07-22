# ── ML classifier service: FastAPI + scikit-learn ──────────────────────
# python:3.11-slim (Debian/glibc) so scikit-learn's prebuilt wheels install
# cleanly — the same reason the backend uses node:22-slim, not Alpine.
#
# NOTE: this image builds from the *Backend* directory as its context (see
# docker-compose.yml and render.yaml), so it can copy the model from ml/model.

FROM python:3.11-slim

WORKDIR /app

# Install deps first so this layer is cached and only re-runs when
# requirements.txt changes (not on every code edit).
COPY ml-service/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the app code
COPY ml-service/app.py .

# Bake the trained model into the image at /models. Locally, docker-compose
# also mounts ./Backend/ml/model over /models so a freshly retrained model is
# picked up on restart. In the cloud (Render — no shared volumes) this baked-in
# copy is what the service loads.
COPY ml/model /models

EXPOSE 8000

# uvicorn is the ASGI server that runs the FastAPI `app` object in app.py.
# We listen on $PORT if the platform sets one (Render does), else default 8000
# (local docker-compose). Shell form so the ${PORT:-8000} variable expands.
CMD uvicorn app:app --host 0.0.0.0 --port ${PORT:-8000}
