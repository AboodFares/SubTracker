const cron = require('node-cron');
const BankConnection = require('../models/BankConnection');
const User = require('../models/User');
const { syncTransactions } = require('./plaidService');
const { analyzeTransaction } = require('./transactionMatcher');
const { processSubscriptionData } = require('./subscriptionService');
const Subscription = require('../models/Subscription');
const { oauth2Client } = require('../config/oAuth');

/**
 * Sync transactions for a single user's bank connection
 */
async function syncUserBankTransactions(bankConnection) {
  try {
    const user = await User.findById(bankConnection.userId);
    if (!user) {
      console.log(`User not found for bank connection ${bankConnection._id}`);
      return { skipped: true, reason: 'User not found' };
    }

    // Sync transactions
    const transactions = await syncTransactions(user._id);

    // Set OAuth credentials for email matching
    if (user.googleTokens) {
      oauth2Client.setCredentials(user.googleTokens);
    }

    let subscriptionsCreated = 0;
    let potentialSubscriptions = 0;

    // Analyze each transaction
    for (const transaction of transactions) {
      try {
        const analysis = await analyzeTransaction(
          user._id,
          {
            merchantName: transaction.merchant_name || transaction.name,
            amount: Math.abs(transaction.amount),
            date: transaction.date,
            transactionId: transaction.transaction_id,
            accountId: transaction.account_id
          },
          user.googleTokens ? oauth2Client : null
        );

        // If confirmed, create subscription automatically
        if (analysis.confidence === 'confirmed') {
          // Check if subscription already exists
          const existing = await Subscription.findOne({
            userId: user._id,
            companyName: { $regex: new RegExp(analysis.merchantName, 'i') },
            price: { $gte: analysis.amount * 0.95, $lte: analysis.amount * 1.05 }
          });

          if (!existing) {
            await processSubscriptionData(
              user._id,
              {
                serviceName: analysis.merchantName,
                eventType: 'start',
                amount: analysis.amount,
                currency: analysis.currency || 'USD',
                startDate: analysis.transactionDate,
                nextBillingDate: analysis.recurringPattern.detected && analysis.recurringPattern.frequency === 'monthly'
                  ? new Date(analysis.transactionDate.getTime() + 30 * 24 * 60 * 60 * 1000)
                  : null,
                confidence: 'confirmed',
                source: analysis.reason === 'transaction_email_match' ? 'transaction_email' : 'transaction'
              },
              {
                id: analysis.transactionId,
                date: analysis.transactionDate
              }
            );
            subscriptionsCreated++;
          }
        } else {
          potentialSubscriptions++;
        }
      } catch (error) {
        console.error(`Error analyzing transaction ${transaction.transaction_id}:`, error);
      }
    }

    return { 
      success: true, 
      transactionsProcessed: transactions.length,
      subscriptionsCreated,
      potentialSubscriptions
    };
  } catch (error) {
    console.error(`Error syncing bank transactions for connection ${bankConnection._id}:`, error);
    // Update connection status if it's a token error
    if (error.message && error.message.includes('expired')) {
      bankConnection.status = 'error';
      bankConnection.errorMessage = error.message;
      await bankConnection.save();
    }
    return { error: error.message };
  }
}

/**
 * Sync all active bank connections
 */
async function syncAllBankConnections() {
  try {
    const activeConnections = await BankConnection.find({ status: 'active' });
    
    console.log(`🔄 Starting automatic bank sync for ${activeConnections.length} connections`);
    
    let successCount = 0;
    let errorCount = 0;
    let totalTransactions = 0;
    let totalSubscriptions = 0;

    for (const connection of activeConnections) {
      try {
        const result = await syncUserBankTransactions(connection);
        if (result.success) {
          successCount++;
          totalTransactions += result.transactionsProcessed || 0;
          totalSubscriptions += result.subscriptionsCreated || 0;
        } else {
          errorCount++;
        }
      } catch (error) {
        console.error(`Error syncing connection ${connection._id}:`, error);
        errorCount++;
      }
    }

    console.log(`✅ Bank sync complete: ${successCount} successful, ${errorCount} errors`);
    console.log(`   Processed ${totalTransactions} transactions, created ${totalSubscriptions} subscriptions`);
    return { successCount, errorCount, totalTransactions, totalSubscriptions };
  } catch (error) {
    console.error('Error in syncAllBankConnections:', error);
    throw error;
  }
}

/**
 * Initialize automatic bank transaction syncing
 * Runs daily at 2 AM
 */
function initializeBankScheduler() {
  // Run daily at 2 AM
  cron.schedule('0 2 * * *', async () => {
    console.log('⏰ Starting scheduled bank transaction sync...');
    try {
      await syncAllBankConnections();
    } catch (error) {
      console.error('Error in scheduled bank sync:', error);
    }
  });

  console.log('✅ Bank transaction scheduler initialized (runs daily at 2 AM)');
}

module.exports = {
  syncAllBankConnections,
  syncUserBankTransactions,
  initializeBankScheduler
};

