const express = require('express');
const router = express.Router();
const { getSubscriptionEmails } = require('../services/filter');
const { extractFromSingleEmail } = require('../services/aiService');
const { oauth2Client } = require('../config/oAuth');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { ensureValidToken } = require('../services/tokenRefresh');

/**
 * Middleware to authenticate user and set up OAuth client
 */
const authenticateUser = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1]; // Bearer token
    
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'No token provided'
      });
    }

    const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Find user and get their OAuth tokens
    const user = await User.findById(decoded.userId);
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User not found'
      });
    }

    // Set OAuth credentials from user (you'll need to store these in User model)
    // For now, assuming tokens are stored in user.googleTokens
    if (user.googleTokens) {
      oauth2Client.setCredentials(user.googleTokens);
    }

    req.user = user;
    next();
  } catch (error) {
    res.status(401).json({
      success: false,
      message: 'Invalid token'
    });
  }
};


/**
 * POST /api/ai/extract
 * Extract subscription info from a single email text
 * Body: { emailText: string }
 */
router.post('/extract', authenticateUser, async (req, res) => {
  try {
    const { emailText } = req.body;

    if (!emailText) {
      return res.status(400).json({
        success: false,
        message: 'Email text is required'
      });
    }

    // Call ChatGPT to extract information (one email at a time)
    const extractedData = await extractFromSingleEmail(emailText);

    res.status(200).json({
      success: true,
      data: extractedData // Will be null if not a subscription email
    });

  } catch (error) {
    console.error('Error extracting subscription info:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to extract subscription information',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

/**
 * POST /api/ai/extract-batch
 * Extract subscription info from multiple emails
 * Body: { emails: Array<{id: string, text: string}> }
 * Each email is processed individually with a separate AI call
 */
router.post('/extract-batch', authenticateUser, async (req, res) => {
  try {
    const { emails } = req.body;

    if (!emails || !Array.isArray(emails)) {
      return res.status(400).json({
        success: false,
        message: 'Emails array is required'
      });
    }

    const results = [];

    // Loop over emails - ONE AI call per email
    for (const email of emails) {
      try {
        // Call ChatGPT for this single email
        const extractedData = await extractFromSingleEmail(email.text);
        
        // If not a subscription email, return null
        results.push({
          emailId: email.id,
          success: true,
          data: extractedData // null if not a subscription email
        });
      } catch (error) {
        // Handle error for this email without stopping the batch
        console.error(`Error extracting from email ${email.id}:`, error);
        results.push({
          emailId: email.id,
          success: false,
          error: error.message,
          data: null
        });
      }
    }

    res.status(200).json({
      success: true,
      results: results
    });

  } catch (error) {
    console.error('Error in batch extraction:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to extract subscription information',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

/**
 * GET /api/ai/fetch-and-extract
 * Fetch emails from Gmail and extract subscription info in one go
 * Query params: maxResults (optional, default: 20)
 * Each email is processed individually with a separate AI call
 */
router.get('/fetch-and-extract', authenticateUser, async (req, res) => {
  try {
    const maxResults = parseInt(req.query.maxResults) || 20;

    console.log(`[fetch-and-extract] Starting for user: ${req.user.email}`);

    // Check if user has Google tokens
    if (!req.user.googleTokens || !req.user.googleTokens.access_token) {
      return res.status(400).json({
        success: false,
        message: 'Google account not connected. Please sign in with Google to process emails.',
        error: 'No Google OAuth tokens found'
      });
    }

    // Ensure token is valid (refresh if expired)
    let user;
    try {
      user = await ensureValidToken(req.user);
      console.log(`[fetch-and-extract] Token validated for user: ${user.email}`);
    } catch (tokenError) {
      console.error(`[fetch-and-extract] Token validation failed:`, tokenError);
      return res.status(401).json({
        success: false,
        message: tokenError.message || 'Please reconnect your Google account',
        error: 'Token validation failed'
      });
    }

    // Fetch emails using filter service with retry logic
    let emails;
    let retryCount = 0;
    const maxRetries = 1;
    
    while (retryCount <= maxRetries) {
      try {
        emails = await getSubscriptionEmails(oauth2Client, {
          maxResults: maxResults,
          query: 'newer_than:90d' // Last 90 days
        });
        console.log(`[fetch-and-extract] Successfully fetched ${emails.length} emails`);
        break;
      } catch (gmailError) {
        console.error(`[fetch-and-extract] Error fetching emails (attempt ${retryCount + 1}):`, gmailError.message);
        
        if ((gmailError.message?.includes('invalid_grant') || 
             gmailError.message?.includes('Token has been expired') ||
             gmailError.code === 401) && 
            retryCount < maxRetries) {
          console.log(`[fetch-and-extract] Token expired, attempting refresh and retry...`);
          try {
            user = await ensureValidToken(user);
            retryCount++;
            continue;
          } catch (refreshError) {
            return res.status(401).json({
              success: false,
              message: refreshError.message || 'Please reconnect your Google account',
              error: 'Token refresh failed'
            });
          }
        }
        throw gmailError;
      }
    }

    if (emails.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'No subscription emails found',
        results: []
      });
    }

    const results = [];

    // Loop over emails - ONE AI call per email
    for (const email of emails) {
      try {
        // Call ChatGPT for this single email
        const extractedData = await extractFromSingleEmail(email.text);
        
        // If not a subscription email, return null
        results.push({
          emailId: email.id,
          emailSubject: email.subject,
          emailFrom: email.from,
          emailDate: email.date,
          success: true,
          extractedData: extractedData // null if not a subscription email
        });
      } catch (error) {
        // Handle error for this email without stopping the batch
        console.error(`Error extracting from email ${email.id}:`, error);
        results.push({
          emailId: email.id,
          emailSubject: email.subject,
          emailFrom: email.from,
          emailDate: email.date,
          success: false,
          error: error.message,
          extractedData: null
        });
      }
    }

    res.status(200).json({
      success: true,
      totalEmails: emails.length,
      results: results
    });

  } catch (error) {
    console.error('[fetch-and-extract] Error:', error);
    console.error('[fetch-and-extract] Error stack:', error.stack);
    
    let errorMessage = 'Failed to fetch and extract subscription information';
    let statusCode = 500;
    
    if (error.message?.includes('Please reconnect your Google account') || 
        error.message?.includes('refresh token')) {
      errorMessage = error.message;
      statusCode = 401;
    } else if (error.message?.includes('insufficient permission') || error.code === 403) {
      errorMessage = 'Gmail access permission required. Please sign in with Google and grant Gmail access.';
      statusCode = 403;
    }
    
    res.status(statusCode).json({
      success: false,
      message: errorMessage,
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? {
        stack: error.stack,
        code: error.code
      } : undefined
    });
  }
});

module.exports = router;

