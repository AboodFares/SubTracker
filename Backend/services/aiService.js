const Anthropic = require('@anthropic-ai/sdk');

// Initialize Anthropic client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

// Model cascade: cheap/fast classifier -> most capable extractor
// (mirrors the old gpt-4o-mini -> gpt-4o / gpt-4.1 cost architecture)
const CLASSIFIER_MODEL = 'claude-haiku-4-5';
const EXTRACTION_MODEL = 'claude-opus-4-8';

/**
 * Valid event types allowed in the system
 */
const VALID_EVENT_TYPES = ['start', 'renewal', 'cancellation', 'change'];

/**
 * Validates that the event type is one of the allowed types
 */
function isValidEventType(eventType) {
  return VALID_EVENT_TYPES.includes(eventType);
}

/**
 * Pulls the text block out of a Claude response.
 * With adaptive thinking enabled, thinking blocks precede the text block,
 * so we search by type instead of assuming content[0].
 */
function responseText(response) {
  if (response.stop_reason === 'refusal') {
    throw new Error('AI declined to process this content.');
  }
  if (response.stop_reason === 'max_tokens') {
    throw new Error('AI response was truncated (max_tokens reached). Try again or increase the limit.');
  }
  const block = response.content.find((b) => b.type === 'text');
  if (!block) {
    throw new Error('AI response contained no text content.');
  }
  return block.text;
}

/**
 * Maps Anthropic SDK typed errors onto the error shape the routes expect
 * (error.status + human-readable message). Most-specific first.
 */
function handleAnthropicError(error) {
  if (error instanceof Anthropic.RateLimitError) {
    const rateError = new Error('Anthropic API rate limit exceeded. Please wait a moment and try again, or check your plan quota.');
    rateError.status = 429;
    throw rateError;
  }
  if (error instanceof Anthropic.AuthenticationError) {
    const authError = new Error('Anthropic API key is invalid or expired. Please check your ANTHROPIC_API_KEY in .env file.');
    authError.status = 401;
    throw authError;
  }
  if (error instanceof Anthropic.APIConnectionError) {
    const connError = new Error('Could not reach the Anthropic API. Check your network connection.');
    connError.status = 503;
    throw connError;
  }
  if (error instanceof Anthropic.APIError) {
    const apiError = new Error(`Anthropic API error: ${error.message}`);
    apiError.status = error.status || 500;
    throw apiError;
  }
  throw error;
}

// ============================================================
// STAGE 1: Classification (Claude Haiku 4.5) — Is this a subscription email?
// ============================================================

// Structured output schema: the API guarantees the response matches this,
// so no JSON parsing edge cases (markdown fences, extra prose, etc.)
const CLASSIFY_SCHEMA = {
  type: 'json_schema',
  schema: {
    type: 'object',
    properties: {
      isSubscription: { type: 'boolean' }
    },
    required: ['isSubscription'],
    additionalProperties: false
  }
};

/**
 * Classifies whether an email is a confirmed subscription email
 * Uses Claude Haiku 4.5 (cheap, fast) since this is a simple yes/no task
 * @param {string} emailText - The email text to classify
 * @returns {Promise<boolean>} true if subscription email, false otherwise
 */
async function classifyEmail(emailText) {
  const prompt = `Analyze the following email. Determine if it CONFIRMS that the user HAS an active paid recurring subscription.

Email content:
${emailText}

CRITICAL RULE: The email must be a TRANSACTIONAL email that confirms the user has paid for or is actively subscribed to a service. It must NOT be a marketing, promotional, or informational email.

WHAT COUNTS (return true):
- Payment receipts/invoices that confirm a recurring charge was processed
- Subscription signup confirmations that explicitly state the user has subscribed
- Subscription renewal notices that confirm a payment happened
- Subscription cancellation confirmations
- Plan upgrade/downgrade confirmations

WHAT DOES NOT COUNT (return false):
- ANY email trying to SELL, UPSELL, or PROMOTE a subscription
- ANY email mentioning a price as part of an ADVERTISEMENT, not a confirmed charge
- Failed payment or declined card notifications
- "You're missing out" or "unused benefit" reminder emails
- Free trial promotions or invitations to try something
- Feature announcements, product updates, or onboarding emails
- Price adjustment notifications that don't confirm an active payment
- Marketing emails from banks, credit cards, or rewards programs
- One-time purchases or order confirmations (Amazon orders, Walmart orders, eBay orders — NOT Amazon Prime or other subscriptions)
- One-time ORDER cancellations or shipping notifications (NOT subscription cancellations — those DO count above)
- Ride-hailing receipts (Uber, Lyft trips) or food delivery orders
- Video game purchases or free trial codes
- University/school course access or textbook access
- Meeting invitations or account notifications
- Password reset or account security emails
- One-time Apple App Store or Google Play purchases
- Survey, feedback, social impact, or newsletter emails
- Platform notifications (e.g., "Your document has been published")
- API credit top-ups or pay-as-you-go purchases
- Credit notes, refunds, or invoices for one-time purchases (not recurring)

ASK YOURSELF: Does this email confirm a RECURRING subscription event — a payment, renewal, signup, plan change, OR cancellation of a subscription?`;

  try {
    const response = await anthropic.messages.create({
      model: CLASSIFIER_MODEL,
      max_tokens: 256,
      system: 'You are a strict subscription detector. You ONLY flag emails that CONFIRM a recurring subscription event: a payment, renewal, signup, plan change, or cancellation of a subscription. Marketing emails, upsell promotions, failed payments, and feature announcements are NOT subscriptions — even if they mention prices. A subscription CANCELLATION confirmation IS a valid subscription event. When in doubt, return isSubscription: false.',
      messages: [{ role: 'user', content: prompt }],
      output_config: { format: CLASSIFY_SCHEMA },
      temperature: 0
    });

    const result = JSON.parse(responseText(response));
    return result.isSubscription === true;
  } catch (error) {
    handleAnthropicError(error);
  }
}

// ============================================================
// STAGE 2: Extraction (Claude Opus 4.8) — Extract precise subscription details
// ============================================================

const EXTRACTION_SCHEMA = {
  type: 'json_schema',
  schema: {
    type: 'object',
    properties: {
      isSubscription: { type: 'boolean' },
      serviceName: { type: ['string', 'null'] },
      eventType: { type: ['string', 'null'], enum: ['start', 'renewal', 'cancellation', 'change', null] },
      amount: { type: ['number', 'null'] },
      currency: { type: ['string', 'null'] },
      startDate: { type: ['string', 'null'] },
      nextBillingDate: { type: ['string', 'null'] },
      cancellationDate: { type: ['string', 'null'] },
      planName: { type: ['string', 'null'] }
    },
    required: ['isSubscription', 'serviceName', 'eventType', 'amount', 'currency', 'startDate', 'nextBillingDate', 'cancellationDate', 'planName'],
    additionalProperties: false
  }
};

/**
 * Extracts detailed subscription data from a confirmed subscription email
 * Uses Claude Opus 4.8 (accurate, precise) since this needs exact dates and amounts
 * @param {string} emailText - The email text to extract from
 * @returns {Promise<Object>} Extracted subscription details
 */
async function extractSubscriptionDetails(emailText) {
  const prompt = `FIRST, verify whether this email is a REAL subscription confirmation. Then, if verified, extract the details.

Email content:
${emailText}

STEP 1 — VERIFICATION:
Before extracting any data, determine if this email is a GENUINE transactional subscription email (payment receipt, renewal confirmation, cancellation confirmation, plan change confirmation).

If the email is ANY of the following, return isSubscription: false with all other fields null:
- A marketing, promotional, or upsell email (e.g., "Try Premium!", "Get 50% off!", "Upgrade now!")
- An advertisement disguised as a receipt
- A feature announcement or product update
- A "you're missing out" or engagement reminder
- A free trial invitation or promotion
- A one-time purchase, order, or delivery notification
- A ride-hailing receipt, food delivery order, or one-time service
- An email that mentions a price as part of an AD, not a confirmed charge

STEP 2 — EXTRACTION (only if the email is a real subscription):
Return isSubscription: true and fill in:
- serviceName: short brand name only (e.g., 'Netflix', 'Spotify', 'Apple', 'Anthropic')
- eventType: exactly one of: start, renewal, cancellation, change
- amount: charged amount as a number (e.g., 9.99) or null if not stated
- currency: currency code (USD, EUR, GBP, CAD, etc.) or null
- startDate: YYYY-MM-DD or null
- nextBillingDate: YYYY-MM-DD or null
- cancellationDate: YYYY-MM-DD or null
- planName: plan/tier name (e.g., 'Premium', 'Standard With Ads', 'Pro') or null

RULES FOR serviceName:
- Use ONLY the short brand name: "Netflix", "Crave", "Spotify", "Disney+", "Apple", "Adobe", "Anthropic", "Hulu"
- NEVER include plan tier in serviceName. Wrong: "Crave Standard With Ads". Correct: "Crave"
- NEVER include "Premium", "Basic", "Standard", "Pro", "Plus", "Family" in serviceName
- Put ALL plan/tier details in planName instead

RULES FOR eventType:
- "start" = New subscription started with a confirmed payment
- "renewal" = Subscription renewed or recurring payment processed
- "cancellation" = Subscription was cancelled or refund issued for a subscription
- "change" = Plan changed (upgrade/downgrade confirmed)

RULES FOR dates:
- Extract dates ONLY if they are explicitly stated in the email
- If a date is not mentioned, return null — do NOT guess or infer dates
- For cancellation emails: the cancellationDate is when the cancellation takes effect. If the email doesn't state a specific date, use the email's own date (the date it was sent)
- startDate = when the subscription originally started or the current billing period began
- nextBillingDate = the next scheduled charge date

RULES FOR amount:
- Only extract the ACTUAL charged amount, not advertised prices
- If the email is a cancellation and no charge amount is mentioned, return null`;

  try {
    const response = await anthropic.messages.create({
      model: EXTRACTION_MODEL,
      max_tokens: 16000,
      thinking: { type: 'adaptive' },
      system: 'You are a precise subscription verifier and data extractor. FIRST verify the email is a genuine subscription event (payment, renewal, cancellation, plan change) — not a marketing/promotional email. If it is NOT a real subscription, return isSubscription: false with all other fields null. If it IS real, extract exact values — never guess or hallucinate. If a field is not explicitly stated, return null.',
      messages: [{ role: 'user', content: prompt }],
      output_config: { format: EXTRACTION_SCHEMA }
    });

    return JSON.parse(responseText(response));
  } catch (error) {
    handleAnthropicError(error);
  }
}

// ============================================================
// Main entry point — two-stage pipeline
// ============================================================

/**
 * Extracts subscription information from a single email using a two-stage AI pipeline:
 * Stage 1 (Claude Haiku 4.5): Cheap classification — is this a subscription email?
 * Stage 2 (Claude Opus 4.8): Precise extraction — what are the exact details?
 * @param {string} emailText - The email text to analyze
 * @returns {Promise<Object|null>} Extracted data or null if not a subscription email
 */
async function extractFromSingleEmail(emailText) {
  // Stage 1: Classification (Haiku — cheap, runs on every email)
  const isSubscription = await classifyEmail(emailText);

  if (!isSubscription) {
    return null;
  }

  // Stage 2: Verification + Extraction (Opus — precise, only runs on Stage 1 positives)
  console.log('[aiService] Stage 1 confirmed subscription — sending to Opus for verification + extraction');
  const extractedData = await extractSubscriptionDetails(emailText);

  // Check if Opus rejected the email (Stage 2 verification)
  if (extractedData.isSubscription === false) {
    console.log('[aiService] Stage 2 (Opus) rejected email as not a real subscription — false positive caught');
    return null;
  }

  // Validate event type
  if (!extractedData.eventType || !isValidEventType(extractedData.eventType)) {
    console.warn(`[aiService] Invalid event type from Opus: ${extractedData.eventType}. Returning null.`);
    return null;
  }

  return extractedData;
}

// ============================================================
// Bank statement analysis (Claude Opus 4.8)
// ============================================================

// Shared sub-schema for a detected subscription entry
const DETECTED_SUBSCRIPTION_SCHEMA = {
  type: 'object',
  properties: {
    merchantName: { type: 'string' },
    amount: { type: 'number' },
    currency: { type: 'string' },
    frequency: { type: 'string', enum: ['monthly', 'yearly', 'weekly', 'unknown'] },
    occurrences: { type: 'integer' },
    transactionDates: { type: 'array', items: { type: 'string' } },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] }
  },
  required: ['merchantName', 'amount', 'currency', 'frequency', 'occurrences', 'transactionDates', 'confidence'],
  additionalProperties: false
};

// Structured outputs require a top-level object, so the array is wrapped
const STATEMENT_SCHEMA = {
  type: 'json_schema',
  schema: {
    type: 'object',
    properties: {
      subscriptions: { type: 'array', items: DETECTED_SUBSCRIPTION_SCHEMA }
    },
    required: ['subscriptions'],
    additionalProperties: false
  }
};

function buildPreviousContext(previousSubscriptions) {
  if (previousSubscriptions.length === 0) return '';
  const summary = previousSubscriptions.map(sub =>
    `- ${sub.merchantName}: $${sub.amount} ${sub.currency || 'CAD'}, seen on [${(sub.transactionDates || []).join(', ')}], frequency: ${sub.frequency || 'unknown'}`
  ).join('\n');
  return `

IMPORTANT — PREVIOUSLY DETECTED SUBSCRIPTIONS FROM EARLIER BANK STATEMENTS:
${summary}

Use this context to:
1. CONFIRM subscriptions that appear again in the new transactions (boost their confidence to "high")
2. Flag if a previously detected subscription is MISSING from this month (it may have been cancelled)
3. Even if a merchant name is slightly different (e.g., "NFLX" vs "NETFLIX"), match them if the amount is the same`;
}

/**
 * Analyzes bank statement raw text to identify recurring subscriptions.
 * Sends raw PDF text directly to Claude Opus which can understand any bank format.
 * Uses cross-PDF context from previously detected subscriptions.
 * @param {string} rawText - Raw text extracted from the PDF
 * @param {Array<{merchantName: string, amount: number, transactionDates: string[]}>} previousSubscriptions - Subscriptions detected from earlier PDFs
 * @returns {Promise<Array>} Array of detected subscriptions
 */
async function analyzeStatementTransactions(rawText, previousSubscriptions = []) {
  const prompt = `You are analyzing a bank statement to find RECURRING SUBSCRIPTIONS.

The following is RAW TEXT extracted from a bank statement PDF. Read through it carefully, identify all transactions, and find subscription charges.

RAW BANK STATEMENT TEXT:
${rawText}
${buildPreviousContext(previousSubscriptions)}

Your task:
1. Read the entire statement and identify individual transactions (look for dates, merchant names, and amounts)
2. DEDUPLICATION: Bank statements often list the same transaction in multiple sections (summary, details, pending, posted). A transaction with the SAME merchant, SAME amount, and SAME date appearing in different sections is ONE transaction, not two. Only count unique date+merchant+amount combinations.
3. Find recurring subscriptions: the SAME merchant charging the SAME (or very similar) amount on DIFFERENT dates
4. Cross-reference with previously detected subscriptions (if any) — if the same merchant+amount appears again, that strongly confirms it's a subscription
5. Also identify single charges clearly from known subscription services (Netflix, Spotify, iCloud, etc.)

CRITICAL RULES FOR merchantName:
- Extract the merchant name from the transaction lines in the statement
- Clean it up to the SHORT consumer-facing brand name (e.g., "APPLE.COM/BILL" → "Apple", "NETFLIX.COM" → "Netflix", "SPOTIFY AB" → "Spotify", "GOOGLE *YouTube Premium" → "YouTube Premium", "AMZN*Prime" → "Amazon Prime")
- Do NOT prefix with parent company names. Wrong: "Google YouTube Premium". Correct: "YouTube Premium"
- NEVER return "Unknown" as a merchantName — if you cannot identify the merchant, SKIP that transaction entirely
- Do NOT group unrelated transactions together just because they have the same amount

WHAT IS a subscription (include these):
- Digital streaming services (Netflix, Spotify, Disney+, YouTube Premium, Crave, etc.)
- Software/SaaS (Adobe, Microsoft 365, ChatGPT, iCloud, Google One, etc.)
- Membership services (Amazon Prime, Costco, gym memberships)
- App subscriptions (mobile apps with recurring billing)

WHAT IS NOT a subscription (exclude these):
- Coffee shops, fast food, restaurants (Tim Hortons, Starbucks, McDonald's) — even if they repeat
- Grocery stores, convenience stores (7-Eleven, Walmart, No Frills)
- Gas stations, parking, transit
- ATM withdrawals, bank fees, e-transfers
- One-time purchases (Amazon orders, online shopping)
- Utility bills (electricity, water, phone, internet)
- Rent, mortgage, insurance payments
- Any charge under $1.00

For each detected subscription, return:
- merchantName: Clean, short brand name (NEVER "Unknown")
- amount: The charge amount
- currency: Currency code (default "CAD")
- frequency: "monthly", "yearly", "weekly", or "unknown"
- occurrences: Total times this charge has been seen (including previous statements)
- transactionDates: ALL dates when charges occurred (YYYY-MM-DD, extract from statement text, combine with previous statement dates)
- confidence: "high" if seen across multiple statements OR 3+ times, "medium" if 2 occurrences, "low" if 1 occurrence but clearly a known subscription

If no subscriptions are found, return an empty subscriptions array.`;

  try {
    const response = await anthropic.messages.create({
      model: EXTRACTION_MODEL,
      max_tokens: 16000,
      thinking: { type: 'adaptive' },
      system: 'You are a financial analyst that identifies recurring subscription charges from bank statements. You cross-reference new transactions against previously detected subscriptions to improve accuracy.',
      messages: [{ role: 'user', content: prompt }],
      output_config: { format: STATEMENT_SCHEMA }
    });

    const result = JSON.parse(responseText(response));
    return Array.isArray(result.subscriptions) ? result.subscriptions : [];
  } catch (error) {
    console.error('Error in analyzeStatementTransactions:', error);
    handleAnthropicError(error);
  }
}

// Hybrid ML pipeline: classify uncertain lines + extract, in one call
const FILTERED_SCHEMA = {
  type: 'json_schema',
  schema: {
    type: 'object',
    properties: {
      uncertainClassifications: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            index: { type: 'integer' },
            isSubscription: { type: 'boolean' }
          },
          required: ['index', 'isSubscription'],
          additionalProperties: false
        }
      },
      subscriptions: { type: 'array', items: DETECTED_SUBSCRIPTION_SCHEMA }
    },
    required: ['uncertainClassifications', 'subscriptions'],
    additionalProperties: false
  }
};

/**
 * Hybrid-pipeline companion to analyzeStatementTransactions.
 *
 * The local ML model (services/mlClassifier.js) has already filtered the
 * statement: confident non-subscriptions were dropped, so Claude only sees
 *   A) lines the model is confident ARE subscriptions (need extraction), and
 *   B) lines the model is unsure about (need expert classification).
 * One Opus call handles both, on a fraction of the original token count.
 *
 * @param {string[]} subLines - lines pre-classified as subscriptions
 * @param {string[]} uncertainLines - lines needing Claude's verdict
 * @param {Array} previousSubscriptions - cross-PDF context (same as analyzeStatementTransactions)
 * @returns {Promise<{uncertainClassifications: Array<{index: number, isSubscription: boolean}>, subscriptions: Array}>}
 */
async function analyzeFilteredTransactions(subLines, uncertainLines, previousSubscriptions = []) {
  const numberedUncertain = uncertainLines.map((l, i) => `${i}: ${l}`).join('\n');

  const prompt = `You are analyzing PRE-FILTERED transaction lines from a bank statement. A local classifier already removed obvious non-subscriptions.

SECTION A — LINES ALREADY CLASSIFIED AS SUBSCRIPTIONS (extract details from these):
${subLines.length > 0 ? subLines.join('\n') : '(none)'}

SECTION B — UNCERTAIN LINES (classify EACH ONE: subscription or not):
${uncertainLines.length > 0 ? numberedUncertain : '(none)'}
${buildPreviousContext(previousSubscriptions)}

WHAT IS a subscription: digital streaming (Netflix, Spotify, Disney+...), software/SaaS (Adobe, Microsoft 365, ChatGPT, iCloud...), memberships (Amazon Prime, gyms), app subscriptions with recurring billing.
WHAT IS NOT: restaurants/coffee/fast food (even if they repeat), groceries, gas, transit, parking, ATM/bank fees, e-transfers, payroll, one-time purchases, utility bills (phone, internet, hydro), rent, insurance, charges under $1.00.

TASK 1 — For every line in SECTION B, decide isSubscription true/false (one entry per line, using the line's index).
TASK 2 — Build the final subscriptions list from SECTION A lines PLUS the SECTION B lines you classified as true:
- Group lines belonging to the same merchant (same merchant + same/similar amount on different dates = one recurring subscription with multiple transactionDates)
- merchantName: clean, SHORT consumer brand name ("APPLE.COM/BILL" → "Apple", "SPOTIFY AB" → "Spotify", "GOOGLE *YouTube Premium" → "YouTube Premium"). NEVER "Unknown" — skip unidentifiable merchants.
- amount: the charge amount; currency: code (default "CAD")
- frequency: "monthly", "yearly", "weekly", or "unknown"
- occurrences: total charges seen (including previous statements' context)
- transactionDates: all dates seen for this merchant (YYYY-MM-DD, combine with previous context dates)
- confidence: "high" if seen across multiple statements OR 3+ times, "medium" if 2, "low" if 1 but clearly a known subscription service`;

  try {
    const response = await anthropic.messages.create({
      model: EXTRACTION_MODEL,
      max_tokens: 16000,
      thinking: { type: 'adaptive' },
      system: 'You are a financial analyst that classifies bank transaction lines and identifies recurring subscription charges.',
      messages: [{ role: 'user', content: prompt }],
      output_config: { format: FILTERED_SCHEMA }
    });

    const result = JSON.parse(responseText(response));
    return {
      uncertainClassifications: Array.isArray(result.uncertainClassifications) ? result.uncertainClassifications : [],
      subscriptions: Array.isArray(result.subscriptions) ? result.subscriptions : []
    };
  } catch (error) {
    console.error('Error in analyzeFilteredTransactions:', error);
    handleAnthropicError(error);
  }
}

module.exports = {
  extractFromSingleEmail,
  analyzeStatementTransactions,
  analyzeFilteredTransactions,
  VALID_EVENT_TYPES,
  isValidEventType
};
