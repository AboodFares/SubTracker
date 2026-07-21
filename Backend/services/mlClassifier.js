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
 * If anything is missing (model file, Python, venv) every function degrades
 * to null and the caller falls back to the original GPT-only flow.
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { analyzeFilteredTransactions } = require('./aiService');

const ML_DIR = path.join(__dirname, '..', 'ml');
const MODEL_PATH = path.join(ML_DIR, 'model', 'classifier.joblib');
const GPT_LABELS_PATH = path.join(ML_DIR, 'data', 'gpt_labeled.csv');
const VENV_PYTHON = path.join(ML_DIR, '.venv', 'bin', 'python');
const CLASSIFY_SCRIPT = path.join(ML_DIR, 'classify.py');
const PYTHON_TIMEOUT_MS = 15000;

/** Prefer the project venv's Python; fall back to system python3. */
function resolvePython() {
  return fs.existsSync(VENV_PYTHON) ? VENV_PYTHON : 'python3';
}

/** Cheap availability check so we can skip spawning a process entirely. */
function isModelAvailable() {
  return fs.existsSync(MODEL_PATH) && fs.existsSync(CLASSIFY_SCRIPT);
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
 * Run the local model on a batch of lines via the Python subprocess.
 * Resolves to the parsed result object, or null on ANY failure
 * (missing python, timeout, bad JSON, model unavailable...).
 */
function classifyLines(lines) {
  return new Promise((resolve) => {
    if (!isModelAvailable() || lines.length === 0) return resolve(null);

    const proc = spawn(resolvePython(), [CLASSIFY_SCRIPT], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';
    let settled = false;
    const settle = (value) => { if (!settled) { settled = true; resolve(value); } };

    const timer = setTimeout(() => {
      proc.kill('SIGKILL');
      console.warn('[ML] classify.py timed out — falling back to GPT-only flow');
      settle(null);
    }, PYTHON_TIMEOUT_MS);

    proc.stdout.on('data', (d) => { stdout += d; });
    proc.stderr.on('data', (d) => { stderr += d; });
    proc.on('error', () => { clearTimeout(timer); settle(null); }); // python not found
    proc.on('close', () => {
      clearTimeout(timer);
      try {
        const parsed = JSON.parse(stdout);
        if (!parsed.available) {
          console.warn(`[ML] local model unavailable: ${parsed.reason}`);
          return settle(null);
        }
        settle(parsed);
      } catch {
        if (stderr) console.warn(`[ML] classify.py error: ${stderr.slice(0, 300)}`);
        settle(null);
      }
    });

    proc.stdin.write(JSON.stringify({ lines }));
    proc.stdin.end();
  });
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
