/**
 * mlClassifier.js — hybrid ML + GPT statement analysis.
 *
 * Flow per PDF:
 *   raw text → extract transaction lines → local scikit-learn model classifies
 *   every line with a confidence score →
 *     confident NOT-sub  → dropped (never sent to GPT — this is the saving)
 *     confident sub      → kept, sent to GPT only for structured extraction
 *     uncertain          → batched to GPT-4o (the expert) for classification
 *   GPT's verdicts on uncertain lines are appended to ml/data/gpt_labeled.csv
 *   so `npm run ml:retrain` makes the local model smarter over time.
 *
 * The classifier now runs as a separate FastAPI service (Backend/ml-service),
 * reached over HTTP. If that service is unreachable (down, timeout, error),
 * classifyLines() returns null and the caller falls back to the Claude flow —
 * exactly as it did when the model was a spawned Python subprocess.
 */

const fs = require('fs');
const path = require('path');
const { analyzeFilteredTransactions } = require('./aiService');

const ML_DIR = path.join(__dirname, '..', 'ml');
const GPT_LABELS_PATH = path.join(ML_DIR, 'data', 'gpt_labeled.csv');

// Where the FastAPI classifier lives. In docker-compose this is the service
// name (http://ml-service:8000); for local dev it defaults to localhost.
const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://localhost:8000';
const REQUEST_TIMEOUT_MS = 15000;

/** The classifier is "available" as long as we have a URL to try. Whether it
 *  actually answers is decided per-request (a failed call → null → fallback). */
function isModelAvailable() {
  return Boolean(ML_SERVICE_URL);
}

/**
 * Pull individual transaction lines out of raw pdf-parse text.
 * Heuristic: a transaction line contains a money amount (e.g. 16.49) and
 * some letters (a merchant name). Headers, page numbers and legal
 * boilerplate don't match. We don't need perfection — anything we miss is
 * simply never charged for, and the GPT-only fallback still exists.
 */
function extractTransactionLines(rawText) {
  const seen = new Set();
  const lines = [];
  for (let line of rawText.split(/\r?\n/)) {
    line = line.trim().replace(/\s{2,}/g, ' ');
    if (line.length < 8 || line.length > 220) continue;
    if (!/\d+[.,]\d{2}\b/.test(line)) continue;        // has an amount
    if ((line.match(/[a-zA-Z]/g) || []).length < 3) continue; // has a merchant
    const key = line.toLowerCase();
    if (seen.has(key)) continue;                        // statements repeat lines
    seen.add(key);
    lines.push(line);
    if (lines.length >= 400) break;                     // sanity cap
  }
  return lines;
}

/**
 * Run the local model on a batch of lines by POSTing to the FastAPI service.
 * Resolves to the parsed result object ({ available, threshold, results }),
 * or null on ANY failure (service down, timeout, HTTP error, unavailable) —
 * the same null-means-fallback contract the subprocess version had.
 */
async function classifyLines(lines) {
  if (lines.length === 0) return null;

  // AbortController enforces a hard timeout: if the service doesn't answer in
  // REQUEST_TIMEOUT_MS, we abort the fetch and fall back rather than hang.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(`${ML_SERVICE_URL}/classify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lines }),
      signal: controller.signal,
    });

    if (!res.ok) {
      console.warn(`[ML] classifier service HTTP ${res.status} — falling back to Claude-only`);
      return null;
    }

    const parsed = await res.json();
    if (!parsed.available) {
      console.warn(`[ML] classifier unavailable: ${parsed.reason}`);
      return null;
    }
    return parsed;
  } catch (err) {
    // Service unreachable, DNS failure, or timeout/abort — degrade gracefully
    console.warn(`[ML] classifier service unreachable (${err.name}) — falling back to Claude-only`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Escape one CSV field (quotes doubled, field wrapped in quotes). */
function csvField(text) {
  return `"${String(text).replace(/"/g, '""')}"`;
}

/**
 * Append GPT's verdicts on uncertain lines to gpt_labeled.csv.
 * Only GPT-labeled lines are saved — NOT the lines the local model was
 * already confident about. Saving the model's own predictions back as
 * training data would just teach it to agree with itself (feedback bias);
 * GPT's answers are the genuinely new information.
 */
function appendGptLabels(labeledLines) {
  if (!labeledLines.length) return;
  try {
    if (!fs.existsSync(GPT_LABELS_PATH)) {
      fs.mkdirSync(path.dirname(GPT_LABELS_PATH), { recursive: true });
      fs.writeFileSync(GPT_LABELS_PATH, 'text,label\n');
    }
    const rows = labeledLines
      .map(({ text, label }) => `${csvField(text)},${label ? 1 : 0}`)
      .join('\n') + '\n';
    fs.appendFileSync(GPT_LABELS_PATH, rows);
  } catch (err) {
    // Label logging is best-effort — never fail the upload over it
    console.warn(`[ML] could not append GPT labels: ${err.message}`);
  }
}

/**
 * Full hybrid analysis for one statement.
 * Returns { subscriptions, stats } in the exact same `subscriptions` shape
 * as analyzeStatementTransactions, or null → caller uses the GPT-only flow.
 */
async function runHybridStatementAnalysis(rawText, previousSubscriptions = []) {
  const lines = extractTransactionLines(rawText);
  if (lines.length < 3) {
    // Line extraction failed (unusual PDF layout) — let GPT read the full text
    return null;
  }

  const ml = await classifyLines(lines);
  if (!ml) return null;

  // Route each line based on local prediction + confidence
  const subLines = [];        // confident subscriptions → GPT extracts details
  const uncertainLines = [];  // low confidence → GPT classifies (the expert)
  let droppedCount = 0;       // confident non-subs → never reach GPT
  for (const r of ml.results) {
    if (r.confident && r.label === 1) subLines.push(r.text);
    else if (r.confident && r.label === 0) droppedCount += 1;
    else uncertainLines.push(r.text);
  }

  const stats = {
    totalLines: lines.length,
    droppedLocally: droppedCount,
    confidentSubs: subLines.length,
    uncertainToGpt: uncertainLines.length,
    gptInputReduction: `${Math.round((droppedCount / lines.length) * 100)}%`,
    threshold: ml.threshold
  };
  console.log(
    `[ML] lines: ${stats.totalLines} | dropped locally: ${droppedCount} ` +
    `(${stats.gptInputReduction}) | confident subs: ${subLines.length} | ` +
    `uncertain → GPT: ${uncertainLines.length}`
  );

  // Nothing subscription-like at all → done, zero GPT calls for this PDF
  if (subLines.length === 0 && uncertainLines.length === 0) {
    return { subscriptions: [], stats };
  }

  const { uncertainClassifications, subscriptions } =
    await analyzeFilteredTransactions(subLines, uncertainLines, previousSubscriptions);

  // Feedback loop: save GPT's verdicts as future training data
  const labeled = (uncertainClassifications || [])
    .filter((c) => Number.isInteger(c.index) && c.index >= 0 && c.index < uncertainLines.length)
    .map((c) => ({ text: uncertainLines[c.index], label: c.isSubscription === true }));
  appendGptLabels(labeled);
  if (labeled.length) {
    console.log(`[ML] saved ${labeled.length} GPT-labeled lines for retraining`);
  }

  return { subscriptions: subscriptions || [], stats };
}

module.exports = {
  runHybridStatementAnalysis,
  extractTransactionLines,
  classifyLines,
  isModelAvailable
};
