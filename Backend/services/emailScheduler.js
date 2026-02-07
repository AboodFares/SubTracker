const cron = require('node-cron');
const User = require('../models/User');
const ProcessedEmail = require('../models/ProcessedEmail');
const { getSubscriptionEmails } = require('./filter');
const { extractFromSingleEmail } = require('./aiService');
const { processSubscriptionData } = require('./subscriptionService');
const { oauth2Client } = require('../config/oAuth');
const { ensureValidToken } = require('./tokenRefresh');

/**
 * Processes emails for a single user
 * Only processes emails newer than their last scan date
 */
async function processUserEmails(user) {
  try {
    // Skip if user doesn't have Google tokens
    if (!user.googleTokens || !user.googleTokens.access_token) {
      console.log(`Skipping user ${user.email}: No Google tokens`);
      return { skipped: true, reason: 'No Google tokens' };
    }

    // Skip if email scanning is disabled
    if (user.emailScanEnabled === false) {
      console.log(`Skipping user ${user.email}: Email scanning disabled`);
      return { skipped: true, reason: 'Email scanning disabled' };
    }

    // Ensure token is valid (refresh if expired)
    try {
      user = await ensureValidToken(user);
      console.log(`[emailScheduler] Token validated for user: ${user.email}`);
    } catch (tokenError) {
      console.error(`[emailScheduler] Token validation failed for user ${user.email}:`, tokenError);
      return { 
        skipped: true, 
        reason: tokenError.message || 'Token validation failed. Please reconnect Google account.' 
      };
    }

    // Build query for new emails only (search all emails, not just inbox)
    let emailQuery = '';
    
    // If user has a last scan date, only get emails after that date
    if (user.lastEmailScanDate) {
      const lastScanDate = new Date(user.lastEmailScanDate);
      // Gmail query format: after:YYYY/MM/DD
      const dateStr = `${lastScanDate.getFullYear()}/${String(lastScanDate.getMonth() + 1).padStart(2, '0')}/${String(lastScanDate.getDate()).padStart(2, '0')}`;
      emailQuery = `after:${dateStr}`;
    } else {
      // First time scanning - get emails from last 90 days
      emailQuery = 'newer_than:90d';
    }

    // Fetch new emails with retry logic
    let emails;
    let retryCount = 0;
    const maxRetries = 1;
    
    while (retryCount <= maxRetries) {
      try {
        emails = await getSubscriptionEmails(oauth2Client, {
          maxResults: 500,
          query: emailQuery
        });
        console.log(`[emailScheduler] Successfully fetched ${emails.length} emails for user: ${user.email}`);
        break;
      } catch (gmailError) {
        console.error(`[emailScheduler] Error fetching emails (attempt ${retryCount + 1}) for user ${user.email}:`, gmailError.message);
        
        if ((gmailError.message?.includes('invalid_grant') || 
             gmailError.message?.includes('Token has been expired') ||
             gmailError.code === 401) && 
            retryCount < maxRetries) {
          console.log(`[emailScheduler] Token expired, attempting refresh and retry...`);
          try {
            user = await ensureValidToken(user);
            retryCount++;
            continue;
          } catch (refreshError) {
            console.error(`[emailScheduler] Token refresh failed for user ${user.email}:`, refreshError);
            return { 
              skipped: true, 
              reason: refreshError.message || 'Token refresh failed. Please reconnect Google account.' 
            };
          }
        }
        throw gmailError;
      }
    }

    if (emails.length === 0) {
      // Update last scan date even if no emails found
      user.lastEmailScanDate = new Date();
      await user.save();
      return { processed: 0, message: 'No new emails' };
    }

    // Get list of already processed email IDs for this user
    const processedEmailIds = await ProcessedEmail.find({ userId: user._id })
      .select('emailId')
      .lean();
    const processedIdsSet = new Set(processedEmailIds.map(p => p.emailId));

    // Process each email
    let processed = 0;
    let created = 0;
    let updated = 0;
    let cancelled = 0;
    let skipped = 0;
    let alreadyProcessed = 0;

    for (const email of emails) {
      try {
        // Skip if email was already processed
        if (processedIdsSet.has(email.id)) {
          alreadyProcessed++;
          continue;
        }

        // Extract subscription data using AI
        const extractedData = await extractFromSingleEmail(email.text);

        if (!extractedData) {
          // Mark as skipped
          await ProcessedEmail.create({
            userId: user._id,
            emailId: email.id,
            status: 'skipped'
          });
          skipped++;
          continue;
        }

        // Validate required fields
        if (!extractedData.serviceName || !extractedData.eventType) {
          // Mark as skipped
          await ProcessedEmail.create({
            userId: user._id,
            emailId: email.id,
            status: 'skipped'
          });
          skipped++;
          continue;
        }

        // Process and save subscription
        const subscription = await processSubscriptionData(
          user._id,
          extractedData,
          {
            id: email.id,
            date: email.date
          }
        );

        // Mark email as processed
        await ProcessedEmail.create({
          userId: user._id,
          emailId: email.id,
          status: 'processed',
          subscriptionId: subscription._id
        });

        processed++;
        if (extractedData.eventType === 'start') {
          created++;
        } else if (extractedData.eventType === 'renewal' || extractedData.eventType === 'change') {
          updated++;
        } else if (extractedData.eventType === 'cancellation') {
          cancelled++;
        }

      } catch (error) {
        console.error(`Error processing email ${email.id} for user ${user.email}:`, error.message);
        
        // Mark as failed
        try {
          await ProcessedEmail.create({
            userId: user._id,
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

    return {
      processed,
      created,
      updated,
      cancelled,
      skipped,
      alreadyProcessed,
      totalEmails: emails.length
    };

  } catch (error) {
    console.error(`Error processing emails for user ${user.email}:`, error);
    return { error: error.message };
  }
}

/**
 * Scans emails for all users with Google OAuth tokens
 */
async function scanAllUsersEmails() {
  try {
    console.log(`[${new Date().toISOString()}] Starting automated email scan...`);
    
    // Find all users with Google tokens and email scanning enabled
    const users = await User.find({
      'googleTokens.access_token': { $exists: true, $ne: null },
      emailScanEnabled: { $ne: false }
    });

    console.log(`Found ${users.length} users to process`);

    const results = [];
    
    for (const user of users) {
      try {
        const result = await processUserEmails(user);
        results.push({
          userId: user._id,
          email: user.email,
          ...result
        });
      } catch (error) {
        console.error(`Failed to process emails for user ${user.email}:`, error);
        results.push({
          userId: user._id,
          email: user.email,
          error: error.message
        });
      }
    }

    const summary = {
      totalUsers: users.length,
      successful: results.filter(r => !r.error && !r.skipped).length,
      skipped: results.filter(r => r.skipped).length,
      errors: results.filter(r => r.error).length,
      totalProcessed: results.reduce((sum, r) => sum + (r.processed || 0), 0),
      totalCreated: results.reduce((sum, r) => sum + (r.created || 0), 0),
      totalUpdated: results.reduce((sum, r) => sum + (r.updated || 0), 0),
      totalCancelled: results.reduce((sum, r) => sum + (r.cancelled || 0), 0)
    };

    console.log(`[${new Date().toISOString()}] Email scan complete:`, summary);
    return summary;

  } catch (error) {
    console.error('Error in scanAllUsersEmails:', error);
    throw error;
  }
}

/**
 * Initialize the email scanning scheduler
 * Runs twice daily: 9:00 AM and 9:00 PM
 */
function initializeEmailScheduler() {
  // Schedule to run at 9:00 AM and 9:00 PM every day
  // Cron format: minute hour day month dayOfWeek
  // '0 9,21 * * *' = at minute 0 of hours 9 and 21, every day
  
  const timezone = process.env.TIMEZONE || 'America/New_York';
  
  const job = cron.schedule('0 9,21 * * *', async () => {
    try {
      await scanAllUsersEmails();
    } catch (error) {
      console.error('Error in scheduled email scan:', error);
    }
  }, {
    scheduled: true,
    timezone: timezone
  });

  console.log('✅ Automated email scanner initialized');
  console.log(`   Schedule: Twice daily at 9:00 AM and 9:00 PM`);
  console.log(`   Timezone: ${timezone}`);
  console.log('   To change timezone, set TIMEZONE in .env (e.g., TIMEZONE=America/Los_Angeles)');
  
  return job;
}

module.exports = {
  processUserEmails,
  scanAllUsersEmails,
  initializeEmailScheduler
};

