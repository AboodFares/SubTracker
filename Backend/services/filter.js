const { google } = require('googleapis');

// Subscription-related keywords to search for
const SUBSCRIPTION_KEYWORDS = [
  'subscription',
  'subscribed',
  'receipt',
  'invoice',
  'renewal',
  'renew',
  'billed',
  'billing',
  'payment',
  'paid',
  'charge',
  'charged',
  'plan',
  'membership',
  'monthly',
  'yearly',
  'trial',
  'cancel',
  'cancelled',
  'canceled',
  'cancellation',
  'recurring',
  'annual',
  'annually',
  'weekly',
  'upgrade',
  'downgrade',
  'refund',
  'refunded',
  'expired',
  'expiring',
  'auto-renew'
];

/**
 * Builds a Gmail search query from keywords
 * @param {Array<string>} keywords - Array of keywords to search for
 * @returns {string} Gmail search query
 */
function buildSearchQuery(keywords) {
  // Create OR query: (keyword1 OR keyword2 OR keyword3...)
  const keywordQuery = keywords.map(keyword => `"${keyword}"`).join(' OR ');
  return `(${keywordQuery})`;
}

/**
 * Fetches emails from Gmail matching subscription keywords
 * @param {Object} oauth2Client - Authenticated OAuth2 client
 * @param {Object} options - Optional parameters
 * @param {number} options.maxResults - Maximum number of emails to fetch (default: 50)
 * @param {string} options.query - Additional Gmail query filters (e.g., 'newer_than:30d')
 * @returns {Promise<Array>} Array of email objects with subscription-related content
 */
async function fetchSubscriptionEmails(oauth2Client, options = {}) {
  try {
    const { maxResults = 50, query: additionalQuery = '' } = options;
    
    // Build the search query
    const keywordQuery = buildSearchQuery(SUBSCRIPTION_KEYWORDS);
    // Search all emails (not just inbox)
    const fullQuery = additionalQuery 
      ? `${keywordQuery} ${additionalQuery}` 
      : keywordQuery;

    // Initialize Gmail API
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    // Search for emails matching the keywords
    const searchResponse = await gmail.users.messages.list({
      userId: 'me',
      q: fullQuery,
      maxResults: maxResults
    });

    const messages = searchResponse.data.messages || [];
    
    if (messages.length === 0) {
      return [];
    }

    // Fetch full email details for each message
    const emailPromises = messages.map(async (message) => {
      try {
        const emailData = await gmail.users.messages.get({
          userId: 'me',
          id: message.id,
          format: 'full'
        });

        return parseEmailData(emailData.data);
      } catch (error) {
        console.error(`Error fetching email ${message.id}:`, error.message);
        return null;
      }
    });

    // Wait for all emails to be fetched and filter out nulls
    const emails = await Promise.all(emailPromises);
    return emails.filter(email => email !== null);

  } catch (error) {
    console.error('Error fetching subscription emails:', error);
    throw new Error(`Failed to fetch emails: ${error.message}`);
  }
}

/**
 * Parses Gmail message data into a structured format
 * @param {Object} messageData - Raw Gmail message data
 * @returns {Object} Parsed email object
 */
function parseEmailData(messageData) {
  const headers = messageData.payload.headers;
  
  // Extract headers
  const getHeader = (name) => {
    const header = headers.find(h => h.name.toLowerCase() === name.toLowerCase());
    return header ? header.value : '';
  };

  // Extract email body
  let body = '';
  let htmlBody = '';
  
  const extractBody = (part) => {
    if (part.body && part.body.data) {
      const content = Buffer.from(part.body.data, 'base64').toString('utf-8');
      if (part.mimeType === 'text/plain') {
        body = content;
      } else if (part.mimeType === 'text/html') {
        htmlBody = content;
      }
    }
    
    if (part.parts) {
      part.parts.forEach(extractBody);
    }
  };

  extractBody(messageData.payload);

  // Use plain text body, fallback to stripped HTML if no plain text
  let emailBody = body;
  if (!emailBody && htmlBody) {
    // Strip HTML tags to get clean text for AI processing
    emailBody = htmlBody
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')   // Remove style blocks
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')  // Remove script blocks
      .replace(/<[^>]+>/g, ' ')                           // Remove all HTML tags
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/\s+/g, ' ')                              // Collapse whitespace
      .trim();
  }

  return {
    id: messageData.id,
    threadId: messageData.threadId,
    subject: getHeader('subject'),
    from: getHeader('from'),
    to: getHeader('to'),
    date: getHeader('date'),
    snippet: messageData.snippet,
    body: emailBody,
    labels: messageData.labelIds || [],
    internalDate: messageData.internalDate
  };
}

/**
 * Fetches subscription emails and returns text content for AI processing
 * @param {Object} oauth2Client - Authenticated OAuth2 client
 * @param {Object} options - Optional parameters
 * @returns {Promise<Array>} Array of email text objects ready for AI
 */
async function getSubscriptionEmails(oauth2Client, options = {}) {
  try {
    // Fetch emails matching keywords
    const emails = await fetchSubscriptionEmails(oauth2Client, options);

    // Filter out promotional emails — Gmail's Promotions category is almost always
    // marketing/ads, never real subscription confirmations. This prevents false positives
    // from emails like "Get DashPass for $0!" or "Try Premium for €29.99/month!"
    const filtered = emails.filter(email => {
      if (email.labels && email.labels.includes('CATEGORY_PROMOTIONS')) {
        console.log(`[filter] Skipping promotional email: ${email.subject}`);
        return false;
      }
      return true;
    });

    console.log(`[filter] ${emails.length} emails fetched, ${emails.length - filtered.length} promotional skipped, ${filtered.length} sent to AI`);

    // Return simplified format with just text content for AI
    return filtered.map(email => ({
      id: email.id,
      subject: email.subject,
      from: email.from,
      date: email.date,
      text: `${email.subject}\n\n${email.body || email.snippet}` // Combined text for AI
    }));
  } catch (error) {
    console.error('Error in getSubscriptionEmails:', error);
    throw error;
  }
}

module.exports = {
  fetchSubscriptionEmails,
  getSubscriptionEmails,
  SUBSCRIPTION_KEYWORDS,
  buildSearchQuery
};

