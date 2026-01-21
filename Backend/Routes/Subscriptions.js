const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Subscription = require('../models/Subscription');
const ProcessedEmail = require('../models/ProcessedEmail');
const { oauth2Client } = require('../config/oAuth');
const { getSubscriptionEmails } = require('../services/filter');
const { extractFromSingleEmail } = require('../services/aiService');
const { processSubscriptionData, getUserSubscriptions, cancelSubscription } = require('../services/subscriptionService');
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

    // Set OAuth credentials from user
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
 * POST /api/subscriptions/process-emails
 * Main orchestration endpoint: Fetch emails, filter, extract, and save subscriptions
 * Query params: maxResults (optional, default: 50)
 */
router.post('/process-emails', authenticateUser, async (req, res) => {
  try {
    const maxResults = parseInt(req.query.maxResults) || 50;
    const userId = req.user._id;

    console.log(`[process-emails] Starting email processing for user: ${req.user.email}`);

    // Check if user has Google tokens
    if (!req.user.googleTokens || !req.user.googleTokens.access_token) {
      console.error(`[process-emails] No Google tokens found for user: ${req.user.email}`);
      return res.status(400).json({
        success: false,
        message: 'Google account not connected. Please sign in with Google to process emails.',
        error: 'No Google OAuth tokens found'
      });
    }

    // Ensure token is valid (refresh if expired)
    let user;
    try {
      // Reload user from database to ensure we have fresh data
      const freshUser = await User.findById(req.user._id);
      if (!freshUser) {
        throw new Error('User not found');
      }
      
      user = await ensureValidToken(freshUser);
      console.log(`[process-emails] Token validated for user: ${user.email}`);
    } catch (tokenError) {
      console.error(`[process-emails] Token validation failed for user ${req.user.email}:`, tokenError);
      console.error(`[process-emails] Token error stack:`, tokenError.stack);
      return res.status(401).json({
        success: false,
        message: tokenError.message || 'Please reconnect your Google account',
        error: 'Token validation failed',
        details: process.env.NODE_ENV === 'development' ? tokenError.stack : undefined
      });
    }

    // Build query based on last scan date (search all emails, not just inbox)
    let emailQuery = '';
    
    if (user.lastEmailScanDate) {
      const lastScanDate = new Date(user.lastEmailScanDate);
      const dateStr = `${lastScanDate.getFullYear()}/${String(lastScanDate.getMonth() + 1).padStart(2, '0')}/${String(lastScanDate.getDate()).padStart(2, '0')}`;
      emailQuery = `after:${dateStr}`;
    } else {
      // First time scanning - get emails from last 90 days
      emailQuery = 'newer_than:90d';
    }

    console.log(`[process-emails] Fetching emails for user ${user.email}, query: ${emailQuery}`);

    // Step 1: Fetch emails from Gmail (subject + body only) with retry logic
    let emails;
    let retryCount = 0;
    const maxRetries = 1; // Retry once after token refresh
    
    while (retryCount <= maxRetries) {
      try {
        emails = await getSubscriptionEmails(oauth2Client, {
          maxResults: maxResults,
          query: emailQuery
        });
        console.log(`[process-emails] Successfully fetched ${emails.length} emails`);
        break; // Success, exit retry loop
      } catch (gmailError) {
        console.error(`[process-emails] Error fetching emails (attempt ${retryCount + 1}):`, gmailError.message);
        
        // Check if it's a token expiration error and we haven't retried yet
        if ((gmailError.message?.includes('invalid_grant') || 
             gmailError.message?.includes('Token has been expired') ||
             gmailError.code === 401) && 
            retryCount < maxRetries) {
          console.log(`[process-emails] Token expired, attempting refresh and retry...`);
          try {
            // Refresh token and retry
            user = await ensureValidToken(user);
            retryCount++;
            continue; // Retry the request
          } catch (refreshError) {
            console.error(`[process-emails] Token refresh failed:`, refreshError);
            return res.status(401).json({
              success: false,
              message: refreshError.message || 'Please reconnect your Google account',
              error: 'Token refresh failed'
            });
          }
        }
        
        // Check if it's a permission error
        if (gmailError.message?.includes('insufficient permission') || gmailError.code === 403) {
          return res.status(403).json({
            success: false,
            message: 'Gmail access permission required. Please sign in with Google and grant Gmail access.',
            error: 'Insufficient Gmail permissions'
          });
        }
        
        // If we've exhausted retries or it's not a token error, throw
        throw gmailError;
      }
    }

    if (emails.length === 0) {
      // Update last scan date even if no emails found
      user.lastEmailScanDate = new Date();
      await user.save();
      return res.status(200).json({
        success: true,
        message: 'No subscription emails found',
        processed: 0,
        created: 0,
        updated: 0,
        cancelled: 0,
        skipped: 0,
        alreadyProcessed: 0
      });
    }

    // Get list of already processed email IDs for this user
    const processedEmailIds = await ProcessedEmail.find({ userId })
      .select('emailId')
      .lean();
    const processedIdsSet = new Set(processedEmailIds.map(p => p.emailId));

    // Step 2 & 3: Process each email individually
    let processed = 0;
    let created = 0;
    let updated = 0;
    let cancelled = 0;
    let skipped = 0;
    let alreadyProcessed = 0;
    const errors = [];

    for (const email of emails) {
      try {
        // Skip if email was already processed
        if (processedIdsSet.has(email.id)) {
          alreadyProcessed++;
          continue;
        }

        // Step 3a: Send email to AI (one email per request)
        const extractedData = await extractFromSingleEmail(email.text);

        // Step 3b & 4: Validate AI output
        if (!extractedData) {
          // Mark as skipped
          await ProcessedEmail.create({
            userId,
            emailId: email.id,
            status: 'skipped'
          });
          skipped++;
          continue; // Not a subscription email or invalid
        }

        // Validate required fields
        if (!extractedData.serviceName || !extractedData.eventType) {
          // Mark as skipped
          await ProcessedEmail.create({
            userId,
            emailId: email.id,
            status: 'skipped'
          });
          skipped++;
          continue; // Incomplete data
        }

        // Step 5 & 6: Process and save subscription
        const subscription = await processSubscriptionData(
          userId,
          extractedData,
          {
            id: email.id,
            date: email.date
          }
        );

        // Mark email as processed
        await ProcessedEmail.create({
          userId,
          emailId: email.id,
          status: 'processed',
          subscriptionId: subscription._id
        });

        // Track actions
        processed++;
        if (extractedData.eventType === 'start') {
          created++;
        } else if (extractedData.eventType === 'renewal' || extractedData.eventType === 'change') {
          updated++;
        } else if (extractedData.eventType === 'cancellation') {
          cancelled++;
        }

      } catch (error) {
        console.error(`Error processing email ${email.id}:`, error);
        errors.push({
          emailId: email.id,
          error: error.message
        });
        
        // Mark as failed
        try {
          await ProcessedEmail.create({
            userId,
            emailId: email.id,
            status: 'failed'
          });
        } catch (saveError) {
          // Ignore duplicate key errors (email already marked)
        }
        
        skipped++;
      }
    }

    // Update last scan date
    user.lastEmailScanDate = new Date();
    await user.save();

    res.status(200).json({
      success: true,
      message: 'Emails processed successfully',
      stats: {
        totalEmails: emails.length,
        processed,
        created,
        updated,
        cancelled,
        skipped,
        alreadyProcessed
      },
      errors: errors.length > 0 ? errors : undefined
    });

  } catch (error) {
    console.error('[process-emails] Error in process-emails:', error);
    console.error('[process-emails] Error stack:', error.stack);
    console.error('[process-emails] Error details:', {
      message: error.message,
      code: error.code,
      response: error.response?.data
    });
    
    let errorMessage = 'Failed to process emails';
    let statusCode = 500;
    
    // Handle specific Gmail API errors
    if (error.message?.includes('invalid_grant') || error.message?.includes('Token has been expired')) {
      errorMessage = 'Your Google session has expired. Please sign in with Google again.';
      statusCode = 401;
    } else if (error.message?.includes('insufficient permission') || error.code === 403) {
      errorMessage = 'Gmail access permission required. Please sign in with Google and grant Gmail access.';
      statusCode = 403;
    } else if (error.message?.includes('No Google OAuth tokens')) {
      errorMessage = 'Google account not connected. Please sign in with Google to process emails.';
      statusCode = 400;
    }
    
    res.status(statusCode).json({
      success: false,
      message: errorMessage,
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? {
        stack: error.stack,
        code: error.code,
        response: error.response?.data
      } : undefined
    });
  }
});

/**
 * GET /api/subscriptions
 * Get all subscriptions for the authenticated user
 * Query params: status (optional, 'active' or 'cancelled')
 */
router.get('/', authenticateUser, async (req, res) => {
  try {
    const userId = req.user._id;
    const status = req.query.status; // Optional filter

    // Step 7: Return stored subscriptions as JSON
    const subscriptions = await getUserSubscriptions(userId, { status });

    res.status(200).json({
      success: true,
      count: subscriptions.length,
      subscriptions: subscriptions
    });

  } catch (error) {
    console.error('Error getting subscriptions:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get subscriptions',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

/**
 * PUT /api/subscriptions/:id
 * Update a subscription
 * Body: { price?, nextRenewalDate?, planName?, companyName? }
 */
router.put('/:id', authenticateUser, async (req, res) => {
  try {
    const { id } = req.params;
    const { price, nextRenewalDate, planName, companyName } = req.body;

    // Find subscription and verify ownership
    const subscription = await Subscription.findOne({
      _id: id,
      userId: req.user._id
    });

    if (!subscription) {
      return res.status(404).json({
        success: false,
        message: 'Subscription not found'
      });
    }

    // Build update object
    const updateData = {};
    if (price !== undefined) updateData.price = price;
    if (nextRenewalDate !== undefined) updateData.nextRenewalDate = nextRenewalDate;
    if (planName !== undefined) updateData.planName = planName;
    if (companyName !== undefined) updateData.companyName = companyName;

    // Update subscription
    const updated = await Subscription.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true, runValidators: true }
    );

    res.status(200).json({
      success: true,
      message: 'Subscription updated successfully',
      subscription: updated
    });
  } catch (error) {
    console.error('Error updating subscription:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update subscription',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

/**
 * POST /api/subscriptions/:id/cancel
 * Cancel a subscription
 * Body: { cancellationDate?, accessEndDate? }
 */
router.post('/:id/cancel', authenticateUser, async (req, res) => {
  try {
    const { id } = req.params;
    const { cancellationDate, accessEndDate } = req.body;

    // Find subscription and verify ownership
    const subscription = await Subscription.findOne({
      _id: id,
      userId: req.user._id
    });

    if (!subscription) {
      return res.status(404).json({
        success: false,
        message: 'Subscription not found'
      });
    }

    if (subscription.status === 'cancelled') {
      return res.status(400).json({
        success: false,
        message: 'Subscription is already cancelled'
      });
    }

    // Cancel subscription
    const cancelled = await cancelSubscription(id, {
      cancellationDate: cancellationDate || new Date(),
      accessEndDate: accessEndDate || null
    });

    res.status(200).json({
      success: true,
      message: 'Subscription cancelled successfully',
      subscription: cancelled
    });
  } catch (error) {
    console.error('Error cancelling subscription:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to cancel subscription',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

/**
 * DELETE /api/subscriptions/:id
 * Delete a subscription permanently
 */
router.delete('/:id', authenticateUser, async (req, res) => {
  try {
    const { id } = req.params;

    // Find subscription and verify ownership
    const subscription = await Subscription.findOne({
      _id: id,
      userId: req.user._id
    });

    if (!subscription) {
      return res.status(404).json({
        success: false,
        message: 'Subscription not found'
      });
    }

    // Delete subscription
    await Subscription.findByIdAndDelete(id);

    res.status(200).json({
      success: true,
      message: 'Subscription deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting subscription:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete subscription',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

/**
 * GET /api/subscriptions/stats
 * Get subscription statistics for the authenticated user
 */
router.get('/stats', authenticateUser, async (req, res) => {
  try {
    const userId = req.user._id;

    const subscriptions = await Subscription.find({ userId });

    const activeSubscriptions = subscriptions.filter(s => s.status === 'active');
    const cancelledSubscriptions = subscriptions.filter(s => s.status === 'cancelled');

    // Calculate totals
    const totalMonthly = activeSubscriptions.reduce((sum, sub) => sum + (sub.price || 0), 0);
    const totalYearly = totalMonthly * 12;

    // Find upcoming renewals (next 30 days)
    const now = new Date();
    const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const upcomingRenewals = activeSubscriptions.filter(sub => {
      if (!sub.nextRenewalDate) return false;
      const renewalDate = new Date(sub.nextRenewalDate);
      return renewalDate >= now && renewalDate <= thirtyDaysFromNow;
    });

    // Calculate by source
    const bySource = subscriptions.reduce((acc, sub) => {
      const source = sub.source || 'unknown';
      acc[source] = (acc[source] || 0) + 1;
      return acc;
    }, {});

    res.status(200).json({
      success: true,
      stats: {
        total: subscriptions.length,
        active: activeSubscriptions.length,
        cancelled: cancelledSubscriptions.length,
        totalMonthly,
        totalYearly,
        upcomingRenewals: upcomingRenewals.length,
        bySource
      }
    });
  } catch (error) {
    console.error('Error getting subscription stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get subscription statistics',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

/**
 * GET /api/subscriptions/export
 * Export subscriptions to JSON
 */
router.get('/export', authenticateUser, async (req, res) => {
  try {
    const userId = req.user._id;
    const status = req.query.status; // Optional filter

    const subscriptions = await getUserSubscriptions(userId, { status });

    res.status(200).json({
      success: true,
      count: subscriptions.length,
      exportedAt: new Date().toISOString(),
      subscriptions: subscriptions
    });
  } catch (error) {
    console.error('Error exporting subscriptions:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to export subscriptions',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

/**
 * POST /api/subscriptions/trigger-scan
 * Manually trigger email scan for the authenticated user
 */
router.post('/trigger-scan', authenticateUser, async (req, res) => {
  try {
    const userId = req.user._id;
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Import the scheduler service
    const { processUserEmails } = require('../services/emailScheduler');
    
    // Set OAuth credentials
    if (user.googleTokens) {
      oauth2Client.setCredentials(user.googleTokens);
    }

    // Process emails for this user
    const result = await processUserEmails(user);

    res.status(200).json({
      success: true,
      message: 'Email scan completed',
      result: result
    });

  } catch (error) {
    console.error('Error in trigger-scan:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to trigger email scan',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

module.exports = router;

