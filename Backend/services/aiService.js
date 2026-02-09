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
- One-time purchases or order confirmations (Amazon, Walmart, eBay orders)
- Order cancellations or shipping notifications
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

ASK YOURSELF: Does this email confirm that money was charged or will be charged for a RECURRING subscription? If NO, return {"isSubscription": false}.

Return ONLY one of these two JSON objects:
{"isSubscription": true}
{"isSubscription": false}`;

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: 'You are a strict subscription detector. You ONLY flag emails that CONFIRM the user has paid for or is actively subscribed to a recurring service. Marketing emails, upsell promotions, failed payments, and feature announcements are NOT subscriptions — even if they mention prices. When in doubt, return {"isSubscription": false}. Always return valid JSON only.'
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
  const prompt = `This email has been confirmed as a subscription-related email. Extract the precise details.

Email content:
${emailText}

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
        content: 'You are a precise data extractor for subscription emails. Extract exact values from the email — never guess or hallucinate. If a field is not explicitly stated in the email, return null. Always return valid JSON only, no markdown or explanation.'
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

    // Stage 2: Extraction (GPT-4o — precise, only runs on confirmed subscriptions)
    console.log('[aiService] Stage 1 confirmed subscription — sending to GPT-4o for extraction');
    const extractedData = await extractSubscriptionDetails(emailText);

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
 * Analyzes bank statement transactions in a single batch to identify recurring subscriptions
 * @param {Array<{date: string, description: string, amount: number}>} transactions
 * @returns {Promise<Array>} Array of detected subscriptions
 */
async function analyzeStatementTransactions(transactions) {
  try {
    const transactionsText = JSON.stringify(transactions);

    const prompt = `You are analyzing bank statement transactions to find RECURRING SUBSCRIPTIONS.

Here are all the transactions from a bank statement:
${transactionsText}

Your task:
1. Look at ALL transactions
2. Find recurring subscriptions by identifying the SAME merchant charging the SAME (or very similar) amount multiple times
3. Also identify single charges that are clearly from known subscription services (Netflix, Spotify, iCloud, etc.)

For each detected subscription, return:
- merchantName: Clean, short brand name (e.g., "Netflix", "Spotify", "Apple", not "APPLE.COM/BILL" or "NETFLIX.COM")
- amount: The recurring charge amount
- currency: Currency code (default "CAD")
- frequency: "monthly", "yearly", "weekly", or "unknown"
- occurrences: How many times this charge appears in the statement
- transactionDates: Array of dates when charges occurred (use the dates from the transactions)
- confidence: "high" if 3+ occurrences with same amount, "medium" if 2 occurrences, "low" if 1 occurrence but clearly a known subscription

DO NOT include:
- One-time purchases (Amazon orders, grocery stores, gas stations, restaurants)
- ATM withdrawals or transfers
- Utility bills (electricity, water, internet) unless clearly a streaming/digital service
- Rent or mortgage payments

Return ONLY a JSON array of detected subscriptions. If none found, return an empty array [].
Example: [{"merchantName": "Netflix", "amount": 16.49, "currency": "CAD", "frequency": "monthly", "occurrences": 3, "transactionDates": ["2026-01-15", "2025-12-15", "2025-11-15"], "confidence": "high"}]

Return ONLY the JSON array, no additional text.`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are a financial analyst that identifies recurring subscription charges from bank statements. Return valid JSON arrays only, no markdown or explanation.'
        },
        { role: 'user', content: prompt }
      ],
      temperature: 0.2
    });

    let responseContent = completion.choices[0].message.content.trim();
    responseContent = responseContent.replace(/^```json\n?/i, '').replace(/\n?```$/i, '');
    responseContent = responseContent.replace(/^```\n?/i, '').replace(/\n?```$/i, '');

    const results = JSON.parse(responseContent);
    return Array.isArray(results) ? results : [];
  } catch (error) {
    console.error('Error in analyzeStatementTransactions:', error);

    if (error.status === 429) {
      throw new Error('OpenAI API quota exceeded. Please check your OpenAI account billing.');
    } else if (error.status === 401) {
      throw new Error('OpenAI API key is invalid or expired.');
    }

    throw error;
  }
}

module.exports = {
  extractFromSingleEmail,
  analyzeStatementTransactions,
  VALID_EVENT_TYPES,
  isValidEventType
};
