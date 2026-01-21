const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const BankConnection = require('../models/BankConnection');
const Subscription = require('../models/Subscription');
const {
  createLinkToken,
  exchangePublicToken,
  syncTransactions,
  analyzeTransactionsForSubscriptions,
  disconnectBank
} = require('../services/plaidService');
const { processSubscriptionData } = require('../services/subscriptionService');
const { sendBankTransactionEmail } = require('../services/emailNotificationService');
const { analyzeTransaction, findEmailsWithoutTransactions } = require('../services/transactionMatcher');

/**
 * Middleware to authenticate user
 */
const authenticateUser = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.split(' ')[1];
    
    if (!token) {
      console.log('[Bank Auth] No token provided');
      return res.status(401).json({
        success: false,
        message: 'No token provided'
      });
    }

    const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (jwtError) {
      console.log('[Bank Auth] Token verification failed:', jwtError.message);
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired token'
      });
    }
    
    const user = await User.findById(decoded.userId);
    if (!user) {
      console.log('[Bank Auth] User not found for ID:', decoded.userId);
      return res.status(401).json({
        success: false,
        message: 'User not found'
      });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error('[Bank Auth] Authentication error:', error);
    res.status(401).json({
      success: false,
      message: 'Invalid token'
    });
  }
};

// Plan checks removed - bank connection is now free for all users

/**
 * POST /api/bank/create-link-token
 * Create Plaid Link token for frontend
 */
router.post('/create-link-token', authenticateUser, async (req, res) => {
  try {
    console.log('[Bank] Creating link token for user:', req.user._id, req.user.email);
    const linkToken = await createLinkToken(req.user._id);
    console.log('[Bank] Link token created successfully');

    res.status(200).json({
      success: true,
      linkToken: linkToken
    });
  } catch (error) {
    console.error('[Bank] Error creating link token:', error);
    console.error('[Bank] Error details:', {
      message: error.message,
      stack: error.stack
    });
    
    // Check if Plaid is configured
    if (error.message && error.message.includes('Plaid is not configured')) {
      return res.status(503).json({
        success: false,
        message: 'Bank connection service is not configured. Please contact support.',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Service unavailable'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Failed to create link token',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

/**
 * POST /api/bank/exchange-token
 * Exchange public token for access token
 */
router.post('/exchange-token', authenticateUser, async (req, res) => {
  try {
    const { publicToken } = req.body;

    if (!publicToken) {
      return res.status(400).json({
        success: false,
        message: 'Public token is required'
      });
    }

    const bankConnection = await exchangePublicToken(publicToken, req.user._id);

    res.status(200).json({
      success: true,
      message: 'Bank account connected successfully',
      bankConnection: {
        id: bankConnection._id,
        bankName: bankConnection.bankName,
        accountMask: bankConnection.accountMask,
        status: bankConnection.status
      }
    });
  } catch (error) {
    console.error('Error exchanging token:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to connect bank account',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

/**
 * GET /api/bank/status
 * Get bank connection status
 */
router.get('/status', authenticateUser, async (req, res) => {
  try {
    const bankConnection = await BankConnection.findOne({
      userId: req.user._id,
      status: 'active'
    });

    if (!bankConnection) {
      return res.status(200).json({
        success: true,
        connected: false,
        message: 'No bank account connected'
      });
    }

    res.status(200).json({
      success: true,
      connected: true,
      bankConnection: {
        id: bankConnection._id,
        bankName: bankConnection.bankName,
        accountMask: bankConnection.accountMask,
        accountType: bankConnection.accountType,
        connectedDate: bankConnection.connectedDate,
        lastSyncDate: bankConnection.lastSyncDate,
        status: bankConnection.status
      }
    });
  } catch (error) {
    console.error('Error getting bank status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get bank status',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

/**
 * POST /api/bank/sync
 * Manually sync transactions
 */
router.post('/sync', authenticateUser, async (req, res) => {
  try {
    console.log('[Bank Sync] Starting sync for user:', req.user._id, req.user.email);
    
    const transactions = await syncTransactions(req.user._id);
    console.log('[Bank Sync] Fetched', transactions.length, 'transactions');

    // Set OAuth credentials for email matching (with token refresh if needed)
    const { oauth2Client } = require('../config/oAuth');
    let user = req.user;
    if (user.googleTokens && user.googleTokens.access_token) {
      try {
        const { ensureValidToken } = require('../services/tokenRefresh');
        user = await ensureValidToken(user);
        console.log('[Bank Sync] Google OAuth credentials validated and set');
      } catch (tokenError) {
        console.warn('[Bank Sync] Token validation failed, email matching disabled:', tokenError.message);
        // Continue without email matching
      }
    } else {
      console.log('[Bank Sync] No Google OAuth credentials - email matching disabled');
    }

    // Analyze each transaction with smart matching
    const analyzedTransactions = [];
    const createdSubscriptions = [];
    const potentialSubscriptions = [];

    for (const transaction of transactions) {
      try {
        // Validate transaction has required fields
        if (!transaction.transaction_id) {
          console.warn('[Bank Sync] Skipping transaction without transaction_id:', transaction);
          continue;
        }
        
        if (!transaction.date) {
          console.warn('[Bank Sync] Skipping transaction without date:', transaction.transaction_id);
          continue;
        }
        
        const merchantName = transaction.merchant_name || transaction.name || 'Unknown Merchant';
        const amount = Math.abs(transaction.amount || 0);
        
        if (amount === 0) {
          console.log('[Bank Sync] Skipping transaction with zero amount:', transaction.transaction_id);
          continue;
        }
        
        // Use smart transaction analyzer
        const analysis = await analyzeTransaction(
          req.user._id,
          {
            merchantName: merchantName,
            amount: amount,
            date: transaction.date,
            transactionId: transaction.transaction_id,
            accountId: transaction.account_id || null
          },
          user.googleTokens && user.googleTokens.access_token ? oauth2Client : null
        );

        analyzedTransactions.push(analysis);

        // If confirmed, create subscription automatically
        if (analysis.confidence === 'confirmed') {
          // Check if subscription already exists
          const existing = await Subscription.findOne({
            userId: req.user._id,
            companyName: { $regex: new RegExp(analysis.merchantName, 'i') },
            price: { $gte: analysis.amount * 0.95, $lte: analysis.amount * 1.05 }
          });

          if (!existing) {
            // Create subscription from confirmed transaction
            const subscription = await processSubscriptionData(
              req.user._id,
              {
                serviceName: analysis.merchantName,
                eventType: 'start',
                amount: analysis.amount,
                currency: analysis.currency || 'USD',
                startDate: analysis.transactionDate,
                nextBillingDate: analysis.recurringPattern.detected && analysis.recurringPattern.frequency === 'monthly'
                  ? new Date(analysis.transactionDate.getTime() + 30 * 24 * 60 * 60 * 1000)
                  : null
              },
              {
                id: analysis.transactionId,
                date: analysis.transactionDate
              }
            );

            // Update subscription with confidence and source
            subscription.confidence = 'confirmed';
            subscription.source = analysis.reason === 'transaction_email_match' ? 'transaction_email' : 'transaction';
            await subscription.save();

            // Link potential subscription to created subscription
            analysis.subscriptionId = subscription._id;
            analysis.userAction.action = 'confirmed';
            analysis.userAction.actionDate = new Date();
            await analysis.save();

            createdSubscriptions.push(subscription);

            // Send email notification
            await sendBankTransactionEmail(req.user, {
              merchantName: analysis.merchantName,
              amount: analysis.amount,
              date: analysis.transactionDate
            }, subscription);
          }
        } else {
          // Potential subscription - needs user confirmation
          potentialSubscriptions.push(analysis);
        }
      } catch (error) {
        console.error(`[Bank Sync] Error analyzing transaction ${transaction.transaction_id}:`, error);
        console.error(`[Bank Sync] Transaction details:`, {
          merchantName: transaction.merchant_name || transaction.name,
          amount: transaction.amount,
          date: transaction.date
        });
        // Continue processing other transactions even if one fails
      }
    }

    console.log('[Bank Sync] Analysis complete:', {
      analyzed: analyzedTransactions.length,
      confirmed: analyzedTransactions.filter(a => a.confidence === 'confirmed').length,
      potential: potentialSubscriptions.length,
      created: createdSubscriptions.length
    });

    // Check for emails without matching transactions
    let emailsWithoutTransactions = [];
    if (req.user.googleTokens) {
      try {
        emailsWithoutTransactions = await findEmailsWithoutTransactions(req.user._id, oauth2Client);
        console.log('[Bank Sync] Found', emailsWithoutTransactions.length, 'emails without transactions');
      } catch (error) {
        console.error('[Bank Sync] Error finding emails without transactions:', error);
        // Don't fail the whole sync if email matching fails
      }
    }

    res.status(200).json({
      success: true,
      message: 'Transactions synced successfully',
      stats: {
        transactionsFound: transactions.length,
        analyzed: analyzedTransactions.length,
        confirmed: analyzedTransactions.filter(a => a.confidence === 'confirmed').length,
        potential: potentialSubscriptions.length,
        subscriptionsCreated: createdSubscriptions.length,
        emailsWithoutTransactions: emailsWithoutTransactions.length
      },
      potentialSubscriptions: potentialSubscriptions.map(p => ({
        id: p._id,
        merchantName: p.merchantName,
        amount: p.amount,
        date: p.transactionDate,
        reason: p.reason,
        recurringPattern: p.recurringPattern
      })),
      emailsNeedingConfirmation: emailsWithoutTransactions.map(e => ({
        emailId: e.emailId,
        subscriptionId: e.subscriptionId,
        companyName: e.subscription.companyName,
        amount: e.subscription.price,
        reason: e.reason
      }))
    });
  } catch (error) {
    console.error('[Bank Sync] Error syncing transactions:', error);
    console.error('[Bank Sync] Error stack:', error.stack);
    console.error('[Bank Sync] Error details:', {
      message: error.message,
      name: error.name,
      response: error.response?.data,
      status: error.response?.status
    });
    
    // Provide more specific error messages
    let errorMessage = 'Failed to sync transactions';
    if (error.message?.includes('Plaid is not configured')) {
      errorMessage = 'Bank connection service is not configured';
    } else if (error.message?.includes('No active bank connection')) {
      errorMessage = 'No active bank connection found. Please connect your bank account first.';
    } else if (error.response?.data?.error_code === 'ITEM_LOGIN_REQUIRED') {
      errorMessage = 'Your bank connection requires re-authentication. Please reconnect your bank account.';
    } else if (error.response?.data?.error_code) {
      errorMessage = `Plaid error: ${error.response.data.error_code} - ${error.response.data.error_message || error.message}`;
    }
    
    res.status(500).json({
      success: false,
      message: errorMessage,
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? {
        stack: error.stack,
        plaidError: error.response?.data
      } : undefined
    });
  }
});

/**
 * DELETE /api/bank/disconnect
 * Disconnect bank account
 */
router.delete('/disconnect', authenticateUser, async (req, res) => {
  try {
    const result = await disconnectBank(req.user._id);

    res.status(200).json({
      success: true,
      message: 'Bank account disconnected successfully',
      deleted: result.deleted || false
    });
  } catch (error) {
    console.error('Error disconnecting bank:', error);
    
    // If error is "No bank connection found", return 404
    if (error.message?.includes('No bank connection')) {
      return res.status(404).json({
        success: false,
        message: 'No bank connection found to disconnect'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Failed to disconnect bank account',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

/**
 * POST /api/bank/webhook
 * Handle Plaid webhooks for real-time transaction updates
 */
router.post('/webhook', async (req, res) => {
  try {
    const { webhook_type, webhook_code, item_id, error: webhookError } = req.body;

    // Acknowledge receipt immediately (Plaid expects quick response)
    res.status(200).json({ received: true });

    // Process webhook asynchronously
    setImmediate(async () => {
      try {
        // Find bank connection by item_id
        const bankConnection = await BankConnection.findOne({ itemId: item_id });
        
        if (!bankConnection) {
          console.log(`Bank connection not found for item_id: ${item_id}`);
          return;
        }

        // Handle different webhook types
        switch (webhook_type) {
          case 'TRANSACTIONS':
            if (webhook_code === 'INITIAL_UPDATE' || 
                webhook_code === 'HISTORICAL_UPDATE' || 
                webhook_code === 'DEFAULT_UPDATE' ||
                webhook_code === 'TRANSACTIONS_REMOVED') {
              console.log(`📧 Plaid webhook: ${webhook_code} for item ${item_id}`);
              
              // Trigger sync for this user
              const { syncUserBankTransactions } = require('../services/bankScheduler');
              const result = await syncUserBankTransactions(bankConnection);
              
              if (result.success) {
                console.log(`✅ Synced ${result.transactionsProcessed} transactions for user ${bankConnection.userId}`);
              }
            }
            break;

          case 'ITEM':
            if (webhook_code === 'ERROR') {
              console.error(`❌ Plaid item error for ${item_id}:`, webhookError);
              bankConnection.status = 'error';
              bankConnection.errorMessage = webhookError?.error_message || webhookError?.display_message || 'Unknown error';
              await bankConnection.save();
            } else if (webhook_code === 'PENDING_EXPIRATION') {
              console.warn(`⚠️ Plaid item ${item_id} will expire soon - user should reconnect`);
              bankConnection.errorMessage = 'Bank connection will expire soon. Please reconnect your account.';
              await bankConnection.save();
            } else if (webhook_code === 'USER_PERMISSION_REVOKED') {
              console.warn(`⚠️ User revoked permissions for item ${item_id}`);
              bankConnection.status = 'error';
              bankConnection.errorMessage = 'Bank connection permissions revoked. Please reconnect your account.';
              await bankConnection.save();
            }
            break;

          default:
            console.log(`ℹ️ Unhandled webhook type: ${webhook_type}, code: ${webhook_code}`);
        }
      } catch (error) {
        console.error('Error processing webhook:', error);
      }
    });
  } catch (error) {
    console.error('Error handling Plaid webhook:', error);
    // Still return 200 to acknowledge receipt
    res.status(200).json({ received: true, error: 'Processing failed but acknowledged' });
  }
});

module.exports = router;

