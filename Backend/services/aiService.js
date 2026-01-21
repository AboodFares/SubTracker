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
 * Creates a prompt for ChatGPT to extract subscription information
 */
function createExtractionPrompt(emailText) {
  return `Analyze the following email and determine if it is subscription-related. If it is NOT a subscription email, return {"isSubscription": false}. If it IS a subscription email, extract the information and return a JSON object with the following structure.

Email content:
${emailText}

If this is NOT a subscription-related email, return:
{"isSubscription": false}

If this IS a subscription-related email, return ONLY a valid JSON object with this exact structure:
{
  "isSubscription": true,
  "serviceName": "company/service name (e.g., Netflix, Spotify)",
  "eventType": "MUST be exactly one of: start, renewal, cancellation, change",
  "amount": "price/amount as number (e.g., 9.99) or null",
  "currency": "currency code (USD, EUR, GBP, etc.) or null",
  "startDate": "subscription start date in YYYY-MM-DD format or null",
  "nextBillingDate": "next renewal/billing date in YYYY-MM-DD format or null",
  "cancellationDate": "cancellation date in YYYY-MM-DD format or null (only for cancellation events)",
  "planName": "subscription plan name (e.g., Premium, Pro) or null"
}

IMPORTANT RULES FOR eventType:
- "start" = New subscription started or trial began
- "renewal" = Subscription renewed or payment processed
- "cancellation" = Subscription was cancelled
- "change" = Plan changed (upgrade/downgrade) or subscription modified
- If the email does not clearly match one of these four types, return {"isSubscription": false}
- DO NOT use any other event types (no "failed_billing", "payment_update", "other", etc.)

Return ONLY the JSON object, no additional text or explanation.`;
}

/**
 * Validates that the event type is one of the allowed types
 * @param {string} eventType - The event type to validate
 * @returns {boolean} True if valid, false otherwise
 */
function isValidEventType(eventType) {
  return VALID_EVENT_TYPES.includes(eventType);
}

/**
 * Extracts subscription information from a single email using ChatGPT
 * @param {string} emailText - The email text to analyze
 * @returns {Promise<Object|null>} Extracted data or null if not a subscription email or invalid event type
 */
async function extractFromSingleEmail(emailText) {
  try {
    const prompt = createExtractionPrompt(emailText);
    
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are a helpful assistant that extracts subscription information from emails. Always return valid JSON only, no markdown, no code blocks, just the JSON object. The eventType field MUST be exactly one of: start, renewal, cancellation, change.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.3
    });

    // Parse JSON response (handle cases where it might be wrapped in markdown)
    let responseContent = completion.choices[0].message.content.trim();
    responseContent = responseContent.replace(/^```json\n?/i, '').replace(/\n?```$/i, '');
    responseContent = responseContent.replace(/^```\n?/i, '').replace(/\n?```$/i, '');
    
    const extractedData = JSON.parse(responseContent);

    // If not a subscription email, return null
    if (extractedData.isSubscription === false) {
      return null;
    }

    // Validate event type - MUST be one of the allowed types
    if (!extractedData.eventType || !isValidEventType(extractedData.eventType)) {
      console.warn(`Invalid event type received: ${extractedData.eventType}. Returning null.`);
      return null;
    }

    // Remove isSubscription flag from response
    delete extractedData.isSubscription;
    return extractedData;

  } catch (error) {
    console.error('Error in extractFromSingleEmail:', error);
    
    // Handle specific OpenAI API errors
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
}

module.exports = {
  extractFromSingleEmail,
  VALID_EVENT_TYPES,
  isValidEventType
};

