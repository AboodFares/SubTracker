const OpenAI = require('openai');

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

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
 * Strips markdown code fences from AI response
 */
function cleanJsonResponse(text) {
  let cleaned = text.trim();
  cleaned = cleaned.replace(/^```json\n?/i, '').replace(/\n?```$/i, '');
  cleaned = cleaned.replace(/^```\n?/i, '').replace(/\n?```$/i, '');
  return cleaned;
}

/**
 * Handles common OpenAI API errors and throws appropriate errors
 */
function handleOpenAIError(error) {
  if (error.status === 429) {
    const quotaError = new Error('OpenAI API quota exceeded. Please check your OpenAI account billing or upgrade your plan.');
    quotaError.status = 429;
    throw quotaError;
  } else if (error.status === 401) {
    const authError = new Error('OpenAI API key is invalid or expired. Please check your OPENAI_API_KEY in .env file.');
    authError.status = 401;
    throw authError;
  } else if (error.message && error.message.includes('quota')) {
    const quotaError = new Error('OpenAI API quota exceeded. Please check your OpenAI account billing.');
    quotaError.status = 429;
    throw quotaError;
  }
  throw error;
}

// ============================================================
// STAGE 1: Classification (GPT-4o-mini) — Is this a subscription email?
// ============================================================

/**
 * Classifies whether an email is a confirmed subscription email
 * Uses GPT-4o-mini (cheap, fast) since this is a simple yes/no task
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

ASK YOURSELF: Does this email confirm a RECURRING subscription event — a payment, renewal, signup, plan change, OR cancellation of a subscription? If NO, return {"isSubscription": false}.

Return ONLY one of these two JSON objects:
{"isSubscription": true}
{"isSubscription": false}`;

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: 'You are a strict subscription detector. You ONLY flag emails that CONFIRM a recurring subscription event: a payment, renewal, signup, plan change, or cancellation of a subscription. Marketing emails, upsell promotions, failed payments, and feature announcements are NOT subscriptions — even if they mention prices. A subscription CANCELLATION confirmation IS a valid subscription event. When in doubt, return {"isSubscription": false}. Always return valid JSON only.'
      },
      { role: 'user', content: prompt }
    ],
    temperature: 0.1
  });

  const response = cleanJsonResponse(completion.choices[0].message.content);
  const result = JSON.parse(response);
  return result.isSubscription === true;
}

// ============================================================
// STAGE 2: Extraction (GPT-4o) — Extract precise subscription details
// ============================================================

/**
 * Extracts detailed subscription data from a confirmed subscription email
 * Uses GPT-4o (accurate, precise) since this needs exact dates and amounts
 * @param {string} emailText - The email text to extract from
 * @returns {Promise<Object>} Extracted subscription details
 */
async function extractSubscriptionDetails(emailText) {
  const prompt = `FIRST, verify whether this email is a REAL subscription confirmation. Then, if verified, extract the details.

Email content:
${emailText}

STEP 1 — VERIFICATION:
Before extracting any data, determine if this email is a GENUINE transactional subscription email (payment receipt, renewal confirmation, cancellation confirmation, plan change confirmation).

If the email is ANY of the following, return ONLY {"isSubscription": false}:
- A marketing, promotional, or upsell email (e.g., "Try Premium!", "Get 50% off!", "Upgrade now!")
- An advertisement disguised as a receipt
- A feature announcement or product update
- A "you're missing out" or engagement reminder
- A free trial invitation or promotion
- A one-time purchase, order, or delivery notification
- A ride-hailing receipt, food delivery order, or one-time service
- An email that mentions a price as part of an AD, not a confirmed charge

STEP 2 — EXTRACTION (only if the email is a real subscription):
Extract and return a JSON object with these fields:
{
  "serviceName": "short brand name only (e.g., 'Netflix', 'Spotify', 'Apple', 'Anthropic')",
  "eventType": "exactly one of: start, renewal, cancellation, change",
  "amount": "charged amount as a number (e.g., 9.99) or null if not stated",
  "currency": "currency code (USD, EUR, GBP, CAD, etc.) or null",
  "startDate": "YYYY-MM-DD or null",
  "nextBillingDate": "YYYY-MM-DD or null",
  "cancellationDate": "YYYY-MM-DD or null",
  "planName": "plan/tier name (e.g., 'Premium', 'Standard With Ads', 'Pro') or null"
}

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
- If the email is a cancellation and no charge amount is mentioned, return null

Return ONLY the JSON object, no additional text.`;

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: 'You are a precise subscription verifier and data extractor. FIRST verify the email is a genuine subscription event (payment, renewal, cancellation, plan change) — not a marketing/promotional email. If it is NOT a real subscription, return {"isSubscription": false}. If it IS real, extract exact values — never guess or hallucinate. If a field is not explicitly stated, return null. Always return valid JSON only, no markdown or explanation.'
      },
      { role: 'user', content: prompt }
    ],
    temperature: 0.1
  });

  const response = cleanJsonResponse(completion.choices[0].message.content);
  return JSON.parse(response);
}

// ============================================================
// Main entry point — two-stage pipeline
// ============================================================

/**
 * Extracts subscription information from a single email using a two-stage AI pipeline:
 * Stage 1 (GPT-4o-mini): Cheap classification — is this a subscription email?
 * Stage 2 (GPT-4o): Precise extraction — what are the exact details?
 * @param {string} emailText - The email text to analyze
 * @returns {Promise<Object|null>} Extracted data or null if not a subscription email
 */
async function extractFromSingleEmail(emailText) {
  try {
    // Stage 1: Classification (GPT-4o-mini — cheap, runs on every email)
    const isSubscription = await classifyEmail(emailText);

    if (!isSubscription) {
      return null;
    }

    // Stage 2: Verification + Extraction (GPT-4o — precise, only runs on Stage 1 positives)
    console.log('[aiService] Stage 1 confirmed subscription — sending to GPT-4o for verification + extraction');
    const extractedData = await extractSubscriptionDetails(emailText);

    // Check if GPT-4o rejected the email (Stage 2 verification)
    if (extractedData.isSubscription === false) {
      console.log('[aiService] Stage 2 (GPT-4o) rejected email as not a real subscription — false positive caught');
      return null;
    }

    // Validate event type
    if (!extractedData.eventType || !isValidEventType(extractedData.eventType)) {
      console.warn(`[aiService] Invalid event type from GPT-4o: ${extractedData.eventType}. Returning null.`);
      return null;
    }

    return extractedData;

  } catch (error) {
    console.error('Error in extractFromSingleEmail:', error);
    handleOpenAIError(error);
  }
}

/**
 * Analyzes bank statement raw text to identify recurring subscriptions.
 * Sends raw PDF text directly to GPT-4.1 which can understand any bank format.
 * Uses cross-PDF context from previously detected subscriptions.
 * @param {string} rawText - Raw text extracted from the PDF
 * @param {Array<{merchantName: string, amount: number, transactionDates: string[]}>} previousSubscriptions - Subscriptions detected from earlier PDFs
 * @returns {Promise<Array>} Array of detected subscriptions
 */
async function analyzeStatementTransactions(rawText, previousSubscriptions = []) {
  try {
    let previousContext = '';
    if (previousSubscriptions.length > 0) {
      const summary = previousSubscriptions.map(sub =>
        `- ${sub.merchantName}: $${sub.amount} ${sub.currency || 'CAD'}, seen on [${(sub.transactionDates || []).join(', ')}], frequency: ${sub.frequency || 'unknown'}`
      ).join('\n');
      previousContext = `

IMPORTANT — PREVIOUSLY DETECTED SUBSCRIPTIONS FROM EARLIER BANK STATEMENTS:
${summary}

Use this context to:
1. CONFIRM subscriptions that appear again in the new transactions (boost their confidence to "high")
2. Flag if a previously detected subscription is MISSING from this month (it may have been cancelled)
3. Even if a merchant name is slightly different (e.g., "NFLX" vs "NETFLIX"), match them if the amount is the same`;
    }

    const prompt = `You are analyzing a bank statement to find RECURRING SUBSCRIPTIONS.

The following is RAW TEXT extracted from a bank statement PDF. Read through it carefully, identify all transactions, and find subscription charges.

RAW BANK STATEMENT TEXT:
${rawText}
${previousContext}

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
- transactionDates: ALL dates when charges occurred (extract from statement text, combine with previous statement dates)
- confidence: "high" if seen across multiple statements OR 3+ times, "medium" if 2 occurrences, "low" if 1 occurrence but clearly a known subscription

Return ONLY a JSON array of detected subscriptions. If none found, return an empty array [].
Example: [{"merchantName": "Netflix", "amount": 16.49, "currency": "CAD", "frequency": "monthly", "occurrences": 3, "transactionDates": ["2026-01-15", "2025-12-15", "2025-11-15"], "confidence": "high"}]

Return ONLY the JSON array, no additional text.`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4.1',
      messages: [
        {
          role: 'system',
          content: 'You are a financial analyst that identifies recurring subscription charges from bank statements. You cross-reference new transactions against previously detected subscriptions to improve accuracy. Return valid JSON arrays only, no markdown or explanation.'
        },
        { role: 'user', content: prompt }
      ],
      temperature: 0.2
    });

    const responseContent = cleanJsonResponse(completion.choices[0].message.content);
    const results = JSON.parse(responseContent);
    return Array.isArray(results) ? results : [];
  } catch (error) {
    console.error('Error in analyzeStatementTransactions:', error);
    handleOpenAIError(error);
  }
}

module.exports = {
  extractFromSingleEmail,
  analyzeStatementTransactions,
  VALID_EVENT_TYPES,
  isValidEventType
};
