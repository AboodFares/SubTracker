const { Configuration, PlaidApi, PlaidEnvironments } = require('plaid');
const BankConnection = require('../models/BankConnection');
const Subscription = require('../models/Subscription');
const crypto = require('crypto');

// Initialize Plaid client only if credentials are provided
let plaidClient = null;
if (process.env.PLAID_CLIENT_ID && process.env.PLAID_SECRET_KEY) {
  // Determine Plaid environment (default to sandbox for development)
  let plaidEnvironment = PlaidEnvironments.sandbox; // Default to sandbox
  const env = (process.env.PLAID_ENV || '').toLowerCase();
  
  if (env === 'production') {
    plaidEnvironment = PlaidEnvironments.production;
  } else if (env === 'development') {
    plaidEnvironment = PlaidEnvironments.development;
  }
  // Otherwise use sandbox (default)
  
  const configuration = new Configuration({
    basePath: plaidEnvironment,
    baseOptions: {
      headers: {
        'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID,
        'PLAID-SECRET': process.env.PLAID_SECRET_KEY,
      },
    },
  });
  plaidClient = new PlaidApi(configuration);
  console.log(`✅ Plaid client initialized (${env || 'sandbox'} environment)`);
} else {
  console.warn('⚠️  Plaid credentials not found. Bank connection features will be disabled.');
}

// Encryption key for access tokens (should be in env)
// Generate a key: crypto.randomBytes(32).toString('hex')
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'default_key_change_in_production_32chars!!';
const ALGORITHM = 'aes-256-cbc';

// Ensure key is 32 bytes (64 hex characters)
function getEncryptionKey() {
  let key = ENCRYPTION_KEY;
  if (key.length < 64) {
    // Pad or hash to get 64 characters
    key = crypto.createHash('sha256').update(key).digest('hex');
  }
  return key.substring(0, 64);
}

/**
 * Encrypt Plaid access token before storing
 */
function encryptToken(text) {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(key, 'hex'), iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

/**
 * Decrypt Plaid access token
 */
function decryptToken(encryptedText) {
  const key = getEncryptionKey();
  const parts = encryptedText.split(':');
  const iv = Buffer.from(parts.shift(), 'hex');
  const encrypted = parts.join(':');
  const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(key, 'hex'), iv);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

/**
 * Refresh Plaid access token if expired
 * Checks token validity and handles expiration errors
 */
async function refreshAccessToken(bankConnection) {
  try {
    if (!plaidClient) {
      throw new Error('Plaid is not configured');
    }

    const accessToken = decryptToken(bankConnection.accessToken);
    
    // Try to get item status to check if token is valid
    try {
      await plaidClient.itemGet({
        access_token: accessToken,
      });
      // Token is still valid
      return accessToken;
    } catch (error) {
      // Check if token is expired or invalid
      const errorCode = error.response?.data?.error_code;
      const errorMessage = error.response?.data?.error_message || error.message;
      
      if (errorCode === 'ITEM_LOGIN_REQUIRED' || 
          errorCode === 'INVALID_ACCESS_TOKEN' ||
          errorCode === 'INVALID_API_KEYS') {
        // Mark connection as needing re-authentication
        bankConnection.status = 'error';
        bankConnection.errorMessage = `Token expired: ${errorMessage}. Please reconnect your bank account.`;
        await bankConnection.save();
        throw new Error('Access token expired. Please reconnect your bank account.');
      }
      // For other errors, still throw but don't mark as error
      throw error;
    }
  } catch (error) {
    console.error('Error refreshing access token:', error);
    throw error;
  }
}

/**
 * Create Plaid Link token for frontend
 */
async function createLinkToken(userId) {
  try {
    if (!plaidClient) {
      throw new Error('Plaid is not configured. Please set PLAID_CLIENT_ID and PLAID_SECRET_KEY in your .env file.');
    }

    const request = {
      user: {
        client_user_id: userId.toString(),
      },
      client_name: 'Subscription Tracker',
      products: ['transactions'],
      country_codes: ['US'],
      language: 'en',
    };
    
    // Only add webhook if BACKEND_URL is set
    if (process.env.BACKEND_URL) {
      request.webhook = `${process.env.BACKEND_URL}/api/bank/webhook`;
    }

    const response = await plaidClient.linkTokenCreate(request);
    return response.data.link_token;
  } catch (error) {
    console.error('Error creating Plaid link token:', error);
    throw error;
  }
}

/**
 * Exchange public token for access token
 */
async function exchangePublicToken(publicToken, userId) {
  try {
    if (!plaidClient) {
      throw new Error('Plaid is not configured. Please set PLAID_CLIENT_ID and PLAID_SECRET_KEY in your .env file.');
    }

    const response = await plaidClient.itemPublicTokenExchange({
      public_token: publicToken,
    });

    const accessToken = response.data.access_token;
    const itemId = response.data.item_id;

    // Get account information
    const accountsResponse = await plaidClient.accountsGet({
      access_token: accessToken,
    });

    const account = accountsResponse.data.accounts[0]; // Use first account

    // Encrypt access token
    const encryptedToken = encryptToken(accessToken);

    // Create or update bank connection
    const bankConnection = await BankConnection.findOneAndUpdate(
      { userId: userId, itemId: itemId },
      {
        userId: userId,
        bankName: account.name || 'Unknown Bank',
        accountId: account.account_id,
        accessToken: encryptedToken,
        itemId: itemId,
        accountType: account.type,
        accountMask: account.mask,
        status: 'active',
        connectedDate: new Date(),
        lastSyncDate: new Date()
      },
      { upsert: true, new: true }
    );

    return bankConnection;
  } catch (error) {
    console.error('Error exchanging public token:', error);
    throw error;
  }
}

/**
 * Sync transactions from bank
 * Includes: token refresh, pagination, and incremental sync
 */
async function syncTransactions(userId) {
  try {
    if (!plaidClient) {
      throw new Error('Plaid is not configured. Please set PLAID_CLIENT_ID and PLAID_SECRET_KEY in your .env file.');
    }

    const bankConnection = await BankConnection.findOne({
      userId: userId,
      status: 'active'
    });

    if (!bankConnection) {
      throw new Error('No active bank connection found');
    }

    // Check and refresh access token if needed
    let accessToken;
    try {
      accessToken = await refreshAccessToken(bankConnection);
    } catch (error) {
      // If refresh fails, try decrypting anyway (might still be valid for this call)
      accessToken = decryptToken(bankConnection.accessToken);
    }

    // Use incremental sync: start from last sync date if available
    const now = new Date();
    let startDate;
    
    if (bankConnection.lastSyncDate) {
      // Start from last sync date (minus 1 day to catch any missed transactions)
      const lastSync = new Date(bankConnection.lastSyncDate);
      startDate = new Date(lastSync.getTime() - 24 * 60 * 60 * 1000); // 1 day before last sync
    } else {
      // First sync - get last 30 days
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    // Get transactions with pagination
    let allTransactions = [];
    let cursor = null;
    let hasMore = true;
    const maxTransactions = 10000; // Safety limit

    while (hasMore && allTransactions.length < maxTransactions) {
      const request = {
        access_token: accessToken,
        start_date: startDate.toISOString().split('T')[0],
        end_date: now.toISOString().split('T')[0],
      };
      
      // Add cursor if we have one (for pagination)
      if (cursor) {
        request.cursor = cursor;
      }
      
      try {
        console.log(`[Plaid] Fetching transactions (page ${Math.floor(allTransactions.length / 500) + 1})...`);
        const transactionsResponse = await plaidClient.transactionsGet(request);
        
        // Add transactions from this page
        const pageTransactions = transactionsResponse.data.transactions || [];
        allTransactions = allTransactions.concat(pageTransactions);
        console.log(`[Plaid] Fetched ${pageTransactions.length} transactions (total: ${allTransactions.length})`);
        
        // Check if there are more pages
        cursor = transactionsResponse.data.next_cursor;
        hasMore = !!cursor;
      } catch (plaidError) {
        console.error('[Plaid] Error fetching transactions:', plaidError);
        console.error('[Plaid] Error details:', {
          error_code: plaidError.response?.data?.error_code,
          error_message: plaidError.response?.data?.error_message,
          request_id: plaidError.response?.data?.request_id
        });
        throw plaidError; // Re-throw to be caught by outer try-catch
      }
    }

    if (allTransactions.length >= maxTransactions) {
      console.warn(`Transaction limit reached for user ${userId}. Fetched ${maxTransactions} transactions.`);
    }

    // Update last sync date
    bankConnection.lastSyncDate = new Date();
    if (allTransactions.length > 0) {
      // Sort by date descending and get the most recent transaction date
      const sortedTransactions = allTransactions.sort((a, b) => new Date(b.date) - new Date(a.date));
      bankConnection.lastTransactionDate = new Date(sortedTransactions[0].date);
    }
    await bankConnection.save();

    return allTransactions;
  } catch (error) {
    console.error('Error syncing transactions:', error);
    throw error;
  }
}

/**
 * Analyze transactions for subscription charges
 */
async function analyzeTransactionsForSubscriptions(userId, transactions) {
  try {
    const subscriptionKeywords = [
      'subscription', 'recurring', 'monthly', 'annual', 'yearly',
      'netflix', 'spotify', 'amazon prime', 'disney', 'hulu',
      'adobe', 'microsoft', 'apple', 'google'
    ];

    const potentialSubscriptions = [];

    for (const transaction of transactions) {
      // Skip if already processed
      const existing = await Subscription.findOne({
        userId: userId,
        sourceEmailId: transaction.transaction_id
      });

      if (existing) continue;

      // Check if transaction looks like a subscription
      const merchantName = transaction.merchant_name?.toLowerCase() || '';
      const name = transaction.name?.toLowerCase() || '';
      const category = transaction.category?.join(' ')?.toLowerCase() || '';

      const isSubscriptionLike = subscriptionKeywords.some(keyword =>
        merchantName.includes(keyword) ||
        name.includes(keyword) ||
        category.includes(keyword)
      );

      // Check if it's a recurring charge (same amount, similar merchant)
      const isRecurring = await checkIfRecurring(userId, transaction);

      if (isSubscriptionLike || isRecurring) {
        potentialSubscriptions.push({
          transactionId: transaction.transaction_id,
          merchantName: transaction.merchant_name || transaction.name,
          amount: Math.abs(transaction.amount),
          date: transaction.date,
          category: transaction.category,
          accountId: transaction.account_id
        });
      }
    }

    return potentialSubscriptions;
  } catch (error) {
    console.error('Error analyzing transactions:', error);
    throw error;
  }
}

/**
 * Check if transaction is recurring
 */
async function checkIfRecurring(userId, transaction) {
  try {
    // Look for similar transactions in the past
    const similarTransactions = await Subscription.find({
      userId: userId,
      companyName: { $regex: new RegExp(transaction.merchant_name || transaction.name, 'i') },
      price: Math.abs(transaction.amount)
    });

    return similarTransactions.length > 0;
  } catch (error) {
    return false;
  }
}

/**
 * Disconnect bank account
 */
async function disconnectBank(userId) {
  try {
    console.log(`[disconnectBank] Attempting to disconnect bank for user: ${userId}`);
    
    // Find any bank connection for this user (regardless of status)
    const bankConnection = await BankConnection.findOne({ userId: userId });

    if (!bankConnection) {
      console.log(`[disconnectBank] No bank connection found for user: ${userId}`);
      throw new Error('No bank connection found');
    }

    console.log(`[disconnectBank] Found bank connection: ${bankConnection._id}, status: ${bankConnection.status}`);

    // Try to remove from Plaid if client is available and token is valid
    if (plaidClient && bankConnection.accessToken) {
      try {
        const accessToken = decryptToken(bankConnection.accessToken);
        await plaidClient.itemRemove({
          access_token: accessToken,
        });
        console.log('✅ Successfully removed item from Plaid');
      } catch (plaidError) {
        // If Plaid removal fails (e.g., wrong environment, expired token), 
        // we still want to remove it from our database
        console.warn('⚠️ Could not remove from Plaid (may be from different environment):', plaidError.message);
        // Continue to remove from database anyway
      }
    } else {
      console.log('[disconnectBank] Skipping Plaid removal (no client or token)');
    }

    // Always remove from database regardless of Plaid API result
    const deleteResult = await BankConnection.deleteOne({ _id: bankConnection._id });
    console.log(`[disconnectBank] Delete result:`, deleteResult);
    
    if (deleteResult.deletedCount === 0) {
      throw new Error('Failed to delete bank connection from database');
    }
    
    console.log('✅ Bank connection removed from database');

    return { deleted: true, bankConnection };
  } catch (error) {
    console.error('[disconnectBank] Error disconnecting bank:', error);
    throw error;
  }
}

module.exports = {
  createLinkToken,
  exchangePublicToken,
  syncTransactions,
  analyzeTransactionsForSubscriptions,
  disconnectBank,
  decryptToken,
  refreshAccessToken
};

