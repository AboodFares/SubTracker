"""
Inference script — called by the Node backend (services/mlClassifier.js).

Protocol (JSON over stdin/stdout, one shot per process):
  stdin : {"lines": ["06/12 NETFLIX.COM $16.49", ...]}
  stdout: {"available": true, "threshold": 0.9,
           "results": [{"text": "...", "probability": 0.98,
                        "label": 1, "confident": true}, ...]}

If the model or its dependencies are missing we print
{"available": false, "reason": "..."} and exit 0 — the Node side treats
that as "fall back to the GPT-only flow". We never crash the caller.

WHY A SUBPROCESS? The model is scikit-learn (Python); the backend is Node.
Spawning a short-lived process per PDF is the simplest bridge — no extra
server to run, and a PDF's worth of lines classifies in well under a second.
"""

import json
import sys
from pathlib import Path

MODEL_PATH = Path(__file__).parent / "model" / "classifier.joblib"
META_PATH = Path(__file__).parent / "model" / "metadata.json"


def unavailable(reason: str):
    print(json.dumps({"available": False, "reason": reason}))
    sys.exit(0)


def main():
    if not MODEL_PATH.exists():
        unavailable(f"model file not found: {MODEL_PATH}")

    try:
        import joblib  # imported lazily so a broken env reports cleanly
    except ImportError:
        unavailable("joblib/scikit-learn not installed")

    try:
        payload = json.load(sys.stdin)
        lines = payload.get("lines", [])
    except (json.JSONDecodeError, AttributeError):
        unavailable("invalid JSON on stdin")

    threshold = 0.90
    if META_PATH.exists():
        try:
            threshold = json.loads(META_PATH.read_text()).get(
                "confidence_threshold", threshold)
        except (json.JSONDecodeError, OSError):
            pass  # keep the default

    try:
        pipe = joblib.load(MODEL_PATH)
        # predict_proba returns [P(not-sub), P(sub)] per line; [:, 1] = P(sub)
        probs = pipe.predict_proba(lines)[:, 1] if lines else []
    except Exception as e:  # corrupt model, version mismatch, etc.
        unavailable(f"model failed to load/predict: {e}")

    results = []
    for text, p in zip(lines, probs):
        p = float(p)
        results.append({
            "text": text,
            "probability": round(p, 4),
            "label": 1 if p >= 0.5 else 0,
            # confident = far enough from 0.5 that we trust it without GPT
            "confident": p >= threshold or p <= (1 - threshold),
        })

    print(json.dumps({"available": True, "threshold": threshold,
                      "results": results}))


if __name__ == "__main__":
    main()
