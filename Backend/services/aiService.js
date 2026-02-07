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
  return `Analyze the following email. Your job is to determine if it is about a PAID RECURRING SUBSCRIPTION service (like Netflix, Spotify, Crave, Adobe, Claude/Anthropic, etc.).

Email content:
${emailText}

WHAT COUNTS AS A SUBSCRIPTION (return isSubscription: true):
- Monthly or yearly recurring payment confirmations (streaming, software, AI tools, cloud storage, delivery passes)
- Subscription signup confirmations that mention a recurring charge amount
- Subscription renewal/billing receipts showing a recurring charge
- Subscription cancellation or refund confirmations for a recurring service
- Plan upgrade/downgrade notifications for a recurring service
- Free trial signups that will convert to a paid recurring subscription (extract the RECURRING price, not $0)

WHAT DOES NOT COUNT AS A SUBSCRIPTION (return isSubscription: false):
- One-time purchases or order confirmations (e.g., buying something on Amazon, Walmart, eBay)
- Order cancellations or order status updates (e.g., "Order cancelled", "Order shipped", "Order delivered")
- Ride-hailing receipts (Uber, Lyft trips)
- Food delivery orders (DoorDash, Uber Eats individual orders)
- Video game purchases or free trial codes (Call of Duty, Steam, Epic Games)
- University/school course access or textbook access (Pearson, Chegg, McGraw-Hill)
- Meeting invitations or account notifications (Zoom meeting links, Slack messages)
- Shipping notifications or tracking emails
- Marketing/promotional emails or special offer emails (e.g., "Special offer inside!", discount codes, sale announcements)
- Password reset or account security emails
- One-time Apple App Store or Google Play purchases (NOT recurring)
- Free accounts or free tier signups with NO recurring charge
- Survey or feedback request emails
- Weekly flyer or newsletter emails

If this is NOT a paid recurring subscription email, return:
{"isSubscription": false}

If this IS a paid recurring subscription email, return ONLY a valid JSON object:
{
  "isSubscription": true,
  "serviceName": "company name (see rules below)",
  "eventType": "MUST be exactly one of: start, renewal, cancellation, change",
  "amount": "the RECURRING price as number (e.g., 9.99) - for free trials, use the price AFTER the trial ends, NOT $0",
  "currency": "currency code (USD, EUR, GBP, CAD, etc.)",
  "startDate": "subscription start date in YYYY-MM-DD format or null",
  "nextBillingDate": "next renewal/billing date in YYYY-MM-DD format or null",
  "cancellationDate": "cancellation date in YYYY-MM-DD format or null (only for cancellation events)",
  "planName": "subscription plan name (e.g., Premium, Standard With Ads, Pro) or null"
}

CRITICAL RULES FOR serviceName:
- Use ONLY the short brand name: "Netflix", "Crave", "Spotify", "Disney+", "Apple", "Adobe", "Anthropic", "Hulu"
- NEVER include the plan tier in serviceName. Wrong: "Crave Standard With Ads". Correct: "Crave"
- NEVER include "Premium", "Basic", "Standard", "Pro", "Plus", "Family" in serviceName
- Put ALL plan/tier details in planName instead
- The serviceName must be the SAME across signup, renewal, cancellation, and refund emails for the same service

RULES FOR eventType:
- "start" = New subscription started (with a real payment or confirmed recurring charge)
- "renewal" = Subscription renewed or recurring payment processed
- "cancellation" = Subscription was cancelled or refund was issued
- "change" = Plan changed (upgrade/downgrade)
- If the email does not clearly match one of these four types, return {"isSubscription": false}

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

