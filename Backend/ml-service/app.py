"""
FastAPI microservice wrapping the scikit-learn subscription-line classifier.

This replaces the old "spawn a Python process per request" approach. The model
is loaded ONCE when the service boots and stays hot in memory, so each
/classify call is just a function call + a small HTTP round trip — no cold
Python startup, no re-reading the model file every time.

Endpoints:
  GET  /health   -> {"status": "ok", "model_loaded": true}
  POST /classify -> classify a batch of transaction lines

The JSON shape returned by /classify is IDENTICAL to what the old classify.py
printed, so the Node side didn't need its logic changed — only its transport.
"""

import os
import json
from contextlib import asynccontextmanager
from pathlib import Path

import joblib
from fastapi import FastAPI
from pydantic import BaseModel

# The model + metadata are mounted into the container at /models (see
# docker-compose.yml). Overridable via env vars for local runs.
MODEL_PATH = Path(os.environ.get("MODEL_PATH", "/models/classifier.joblib"))
META_PATH = Path(os.environ.get("META_PATH", "/models/metadata.json"))

# A tiny in-memory holder for things we load once at startup.
state = {"pipe": None, "threshold": 0.90}


# ── Startup / shutdown hook ──────────────────────────────────────────
# `lifespan` is FastAPI's startup-event mechanism. Everything BEFORE `yield`
# runs ONCE when the service starts; everything AFTER `yield` runs once on
# shutdown. We use the startup half to load the ~MB joblib model a single
# time into `state`, instead of loading it on every request.
@asynccontextmanager
async def lifespan(app: FastAPI):
    if MODEL_PATH.exists():
        state["pipe"] = joblib.load(MODEL_PATH)
    if META_PATH.exists():
        try:
            state["threshold"] = json.loads(META_PATH.read_text()).get(
                "confidence_threshold", state["threshold"])
        except (json.JSONDecodeError, OSError):
            pass  # keep the default threshold
    print(f"[ml-service] model loaded: {state['pipe'] is not None}, "
          f"threshold={state['threshold']}")
    yield
    # (nothing to clean up on shutdown)


# `lifespan=lifespan` wires the startup hook above into the app.
app = FastAPI(title="Sub-Tracker ML Classifier", lifespan=lifespan)


# Pydantic model = the expected request body. FastAPI validates incoming JSON
# against it automatically: a body that isn't {"lines": ["...", ...]} gets a
# 422 error for free, before our code even runs.
class ClassifyRequest(BaseModel):
    lines: list[str]


@app.get("/health")
def health():
    return {"status": "ok", "model_loaded": state["pipe"] is not None}


# ── The endpoint decorator ───────────────────────────────────────────
# `@app.post("/classify")` registers the function below as the handler for
# HTTP POST requests to the /classify path. FastAPI parses + validates the
# JSON body into a ClassifyRequest, calls the function, and serializes the
# returned dict back into a JSON response — all automatically.
@app.post("/classify")
def classify(req: ClassifyRequest):
    pipe = state["pipe"]
    threshold = state["threshold"]

    # Same "never crash the caller" contract as the old script: if the model
    # isn't loaded, report unavailable so Node falls back to the Claude flow.
    if pipe is None:
        return {"available": False, "reason": "model not loaded"}

    lines = req.lines
    # predict_proba returns [P(not-sub), P(sub)] per line; column 1 = P(sub)
    probs = pipe.predict_proba(lines)[:, 1] if lines else []

    results = []
    for text, p in zip(lines, probs):
        p = float(p)
        results.append({
            "text": text,
            "probability": round(p, 4),
            "label": 1 if p >= 0.5 else 0,
            # confident = far enough from 0.5 that we trust it without Claude
            "confident": p >= threshold or p <= (1 - threshold),
        })

    return {"available": True, "threshold": threshold, "results": results}
