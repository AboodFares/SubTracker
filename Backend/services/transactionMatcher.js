const Subscription = require('../models/Subscription');
const PotentialSubscription = require('../models/PotentialSubscription');
const ProcessedEmail = require('../models/ProcessedEmail');
const { getSubscriptionEmails } = require('./filter');
const { oauth2Client } = require('../config/oAuth');

/**
 * Detect if a transaction has a recurring pattern
 */
async function detectRecurringPattern(userId, merchantName, amount, transactionDate) {
  try {
    // Look for similar transactions in the past 6 months
    const sixMonthsAgo = new Date(transactionDate);
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const similarTransactions = await PotentialSubscription.find({
      userId: userId,
      merchantName: { $regex: new RegExp(merchantName, 'i') },
      amount: { $gte: amount * 0.95, $lte: amount * 1.05 }, // Within 5% variance
      transactionDate: { $gte: sixMonthsAgo },
      confidence: { $in: ['confirmed', 'potential'] }
    }).sort({ transactionDate: 1 });

    // Also check existing subscriptions
    const existingSubscriptions = await Subscription.find({
      userId: userId,
      companyName: { $regex: new RegExp(merchantName, 'i') },
      price: { $gte: amount * 0.95, $lte: amount * 1.05 }
    });

    const allOccurrences = [
      ...similarTransactions.map(t => t.transactionDate),
      ...existingSubscriptions.map(s => s.startDate)
    ].filter(Boolean).sort((a, b) => a - b);

    if (allOccurrences.length >= 2) {
      // Calculate average interval
      const intervals = [];
      for (let i = 1; i < allOccurrences.length; i++) {
        const diff = allOccurrences[i] - allOccurrences[i - 1];
        intervals.push(diff);
      }
      const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      const days = avgInterval / (1000 * 60 * 60 * 24);

      let frequency = 'unknown';
      if (days >= 25 && days <= 35) {
        frequency = 'monthly';
      } else if (days >= 350 && days <= 380) {
        frequency = 'yearly';
      } else if (days >= 6 && days <= 8) {
        frequency = 'weekly';
      }

      return {
        detected: true,
        frequency: frequency,
        occurrences: allOccurrences.length + 1
      };
    }

    return {
      detected: false,
      frequency: 'unknown',
      occurrences: 1
    };
  } catch (error) {
    console.error('Error detecting recurring pattern:', error);
    return {
      detected: false,
      frequency: 'unknown',
      occurrences: 1
    };
  }
}

/**
 * Match transaction with emails
 */
async function matchTransactionWithEmails(userId, merchantName, amount, transactionDate, oauth2Client) {
  try {
    // Search for emails around the transaction date (±7 days)
    const startDate = new Date(transactionDate);
    startDate.setDate(startDate.getDate() - 7);
    const endDate = new Date(transactionDate);
    endDate.setDate(endDate.getDate() + 7);

    const dateStr = `${startDate.getFullYear()}/${String(startDate.getMonth() + 1).padStart(2, '0')}/${String(startDate.getDate()).padStart(2, '0')}`;
    const endDateStr = `${endDate.getFullYear()}/${String(endDate.getMonth() + 1).padStart(2, '0')}/${String(endDate.getDate()).padStart(2, '0')}`;

    // Fetch emails around transaction date (search all emails, not just inbox)
    const emails = await getSubscriptionEmails(oauth2Client, {
      maxResults: 50,
      query: `after:${dateStr} before:${endDateStr}`
    });

    // Check if any email mentions this merchant and amount
    const merchantKeywords = merchantName.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    const amountStr = amount.toFixed(2);

    for (const email of emails) {
      const emailText = `${email.subject} ${email.text}`.toLowerCase();
      
      // Check if email contains merchant name keywords
      const hasMerchant = merchantKeywords.some(keyword => emailText.includes(keyword));
      
      // Check if email mentions the amount (within 5% variance)
      const amountRegex = new RegExp(`\\$${amountStr}|${amountStr}|\\$${amount.toFixed(0)}`, 'i');
      const hasAmount = amountRegex.test(emailText);

      if (hasMerchant && hasAmount) {
        // Check if this email was already processed
        const processed = await ProcessedEmail.findOne({
          userId: userId,
          emailId: email.id
        });

        return {
          matched: true,
          emailId: email.id,
          emailDate: email.date,
          emailSubject: email.subject,
          alreadyProcessed: !!processed
        };
      }
    }

    return {
      matched: false
    };
  } catch (error) {
    console.error('Error matching transaction with emails:', error);
    return {
      matched: false,
      error: error.message
    };
  }
}

/**
 * Analyze transaction and determine subscription confidence
 */
async function analyzeTransaction(userId, transaction, oauth2Client) {
  try {
    const { merchantName, amount, date, transactionId, accountId } = transaction;

    // Step 1: Check for recurring pattern
    const pattern = await detectRecurringPattern(userId, merchantName, amount, new Date(date));

    // Step 2: Try to match with emails
    const emailMatch = await matchTransactionWithEmails(
      userId,
      merchantName,
      amount,
      new Date(date),
      oauth2Client
    );

    // Step 3: Determine confidence and reason
    let confidence = 'potential';
    let reason = 'transaction_only';

    if (emailMatch.matched) {
      // Transaction + Email = Confirmed
      confidence = 'confirmed';
      reason = 'transaction_email_match';
    } else if (pattern.detected) {
      // Transaction with pattern but no email = Confirmed
      confidence = 'confirmed';
      reason = 'transaction_pattern';
    } else {
      // Transaction only, no email, no pattern = Potential
      confidence = 'potential';
      reason = 'transaction_only';
    }

    // Check if already exists
    const existing = await PotentialSubscription.findOne({
      userId: userId,
      transactionId: transactionId
    });

    if (existing) {
      // Update existing
      existing.confidence = confidence;
      existing.reason = reason;
      existing.recurringPattern = pattern;
      if (emailMatch.matched) {
        existing.matchedEmailId = emailMatch.emailId;
        existing.matchedEmailDate = emailMatch.emailDate;
      }
      await existing.save();
      return existing;
    }

    // Create new potential subscription
    const potentialSub = await PotentialSubscription.create({
      userId: userId,
      merchantName: merchantName,
      amount: amount,
      currency: 'USD',
      transactionDate: new Date(date),
      transactionId: transactionId,
      accountId: accountId,
      confidence: confidence,
      reason: reason,
      recurringPattern: pattern,
      matchedEmailId: emailMatch.matched ? emailMatch.emailId : null,
      matchedEmailDate: emailMatch.matched ? emailMatch.emailDate : null,
      userAction: {
        action: confidence === 'confirmed' ? 'confirmed' : 'pending'
      }
    });

    return potentialSub;
  } catch (error) {
    console.error('Error analyzing transaction:', error);
    throw error;
  }
}

/**
 * Check for emails without matching transactions
 */
async function findEmailsWithoutTransactions(userId, oauth2Client) {
  try {
    // Get all processed emails that created subscriptions
    const processedEmails = await ProcessedEmail.find({
      userId: userId,
      status: 'processed',
      subscriptionId: { $exists: true }
    }).populate('subscriptionId');

    const emailsNeedingConfirmation = [];

    for (const processed of processedEmails) {
      if (!processed.subscriptionId) continue;

      const subscription = processed.subscriptionId;
      
      // Check if there's a matching transaction
      const matchingTransaction = await PotentialSubscription.findOne({
        userId: userId,
        merchantName: { $regex: new RegExp(subscription.companyName, 'i') },
        amount: { $gte: subscription.price * 0.95, $lte: subscription.price * 1.05 },
        confidence: { $in: ['confirmed', 'potential'] }
      });

      if (!matchingTransaction) {
        // Email subscription without matching transaction
        emailsNeedingConfirmation.push({
          emailId: processed.emailId,
          subscriptionId: subscription._id,
          subscription: subscription,
          reason: 'email_only'
        });
      }
    }

    return emailsNeedingConfirmation;
  } catch (error) {
    console.error('Error finding emails without transactions:', error);
    return [];
  }
}

module.exports = {
  analyzeTransaction,
  detectRecurringPattern,
  matchTransactionWithEmails,
  findEmailsWithoutTransactions
};

