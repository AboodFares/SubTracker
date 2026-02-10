const cron = require('node-cron');
const { google } = require('googleapis');
const User = require('../models/User');
const Subscription = require('../models/Subscription');
const { oauth2Client } = require('../config/oAuth');
const { ensureValidToken } = require('./tokenRefresh');
const { sendEmail } = require('./emailNotificationService');

const ALERT_DAYS = 5; // Send alert when renewal is within this many days

/**
 * Sends an email via Gmail API using the user's own OAuth tokens
 */
async function sendViaGmailAPI(user, subject, htmlBody) {
  try {
    // Set user's OAuth credentials
    oauth2Client.setCredentials(user.googleTokens);

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    // Build RFC 2822 formatted email
    const message = [
      `To: ${user.email}`,
      `From: Sub-Tracker <${user.email}>`,
      `Subject: ${subject}`,
      'MIME-Version: 1.0',
      'Content-Type: text/html; charset=utf-8',
      '',
      htmlBody
    ].join('\r\n');

    // Base64url encode the message
    const encodedMessage = Buffer.from(message)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    await gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw: encodedMessage }
    });

    return { sent: true, method: 'gmail_api' };
  } catch (error) {
    console.error(`[renewalNotifier] Gmail API send failed for ${user.email}:`, error.message);
    return { sent: false, error: error.message };
  }
}

/**
 * Builds the HTML email body for renewal alerts
 */
function buildAlertEmail(user, subscriptions) {
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

  const rows = subscriptions.map(sub => {
    const daysUntil = Math.ceil((new Date(sub.nextRenewalDate) - new Date()) / (1000 * 60 * 60 * 24));
    const urgency = daysUntil === 0 ? '#dc2626' : daysUntil <= 2 ? '#ea580c' : '#d97706';
    const dayText = daysUntil === 0 ? 'Today' : daysUntil === 1 ? 'Tomorrow' : `in ${daysUntil} days`;
    const amount = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: sub.currency || 'USD'
    }).format(sub.price);

    return `
      <tr>
        <td style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb;">
          <strong style="color: #111827;">${sub.companyName}</strong>
          ${sub.planName ? `<br><span style="color: #6b7280; font-size: 12px;">${sub.planName}</span>` : ''}
        </td>
        <td style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb; font-weight: 600;">${amount}</td>
        <td style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb;">
          <span style="background: ${urgency}15; color: ${urgency}; padding: 4px 10px; border-radius: 6px; font-weight: 600; font-size: 13px;">
            ${dayText}
          </span>
        </td>
      </tr>`;
  }).join('');

  const totalAmount = subscriptions.reduce((sum, s) => sum + (s.price || 0), 0);
  const totalFormatted = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: subscriptions[0]?.currency || 'USD'
  }).format(totalAmount);

  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff;">
      <div style="background: linear-gradient(135deg, #dc2626, #ea580c); padding: 24px 32px; border-radius: 12px 12px 0 0;">
        <h1 style="color: white; margin: 0; font-size: 20px;">Subscription Renewal Alert</h1>
        <p style="color: rgba(255,255,255,0.85); margin: 6px 0 0; font-size: 14px;">
          ${subscriptions.length === 1 ? '1 subscription' : `${subscriptions.length} subscriptions`} renewing within ${ALERT_DAYS} days
        </p>
      </div>

      <div style="padding: 24px 32px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
        <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
          <thead>
            <tr style="background: #f9fafb;">
              <th style="padding: 10px 16px; text-align: left; font-size: 12px; text-transform: uppercase; color: #6b7280; border-bottom: 2px solid #e5e7eb;">Subscription</th>
              <th style="padding: 10px 16px; text-align: left; font-size: 12px; text-transform: uppercase; color: #6b7280; border-bottom: 2px solid #e5e7eb;">Amount</th>
              <th style="padding: 10px 16px; text-align: left; font-size: 12px; text-transform: uppercase; color: #6b7280; border-bottom: 2px solid #e5e7eb;">Renews</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>

        <div style="margin-top: 20px; padding: 16px; background: #fef2f2; border-radius: 8px; text-align: center;">
          <span style="font-size: 13px; color: #991b1b;">Total upcoming charges: </span>
          <strong style="font-size: 16px; color: #dc2626;">${totalFormatted}</strong>
        </div>

        <div style="margin-top: 24px; text-align: center;">
          <a href="${frontendUrl}/app/subscriptions" style="display: inline-block; padding: 12px 28px; background: linear-gradient(135deg, #4f46e5, #7c3aed); color: white; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px;">
            View Subscriptions
          </a>
        </div>

        <p style="margin-top: 24px; font-size: 12px; color: #9ca3af; text-align: center;">
          This alert was sent by Sub-Tracker because you have subscriptions renewing within ${ALERT_DAYS} days.
        </p>
      </div>
    </div>`;
}

/**
 * Checks all users for upcoming renewals and sends email alerts
 */
async function checkAndSendRenewalAlerts() {
  try {
    console.log(`[${new Date().toISOString()}] Starting renewal alert check...`);

    // Find all users with Google tokens
    const users = await User.find({
      'googleTokens.access_token': { $exists: true, $ne: null }
    });

    let totalAlertsSent = 0;

    for (const user of users) {
      try {
        // Ensure token is valid
        let validUser;
        try {
          validUser = await ensureValidToken(user);
        } catch {
          console.log(`[renewalNotifier] Skipping ${user.email}: token invalid`);
          continue;
        }

        // Find active subscriptions renewing within ALERT_DAYS
        const now = new Date();
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() + ALERT_DAYS);

        const subscriptions = await Subscription.find({
          userId: user._id,
          status: 'active',
          nextRenewalDate: { $gte: now, $lte: cutoff },
          // Only alert if we haven't already sent an alert for this renewal period
          $or: [
            { renewalAlertSentAt: null },
            { renewalAlertSentAt: { $exists: false } },
            // Re-alert if the last alert was sent more than ALERT_DAYS ago (new renewal cycle)
            { renewalAlertSentAt: { $lt: new Date(now.getTime() - ALERT_DAYS * 24 * 60 * 60 * 1000) } }
          ]
        });

        if (subscriptions.length === 0) continue;

        console.log(`[renewalNotifier] ${subscriptions.length} upcoming renewals for ${user.email}`);

        // Build and send the email
        const subject = `Renewal Alert: ${subscriptions.length === 1
          ? `${subscriptions[0].companyName} renews soon`
          : `${subscriptions.length} subscriptions renewing soon`}`;
        const html = buildAlertEmail(validUser, subscriptions);

        // Try Gmail API first, fall back to SMTP
        let result = await sendViaGmailAPI(validUser, subject, html);
        if (!result.sent) {
          console.log(`[renewalNotifier] Gmail API failed, trying SMTP for ${user.email}`);
          result = await sendEmail(user.email, subject, html);
        }

        if (result.sent) {
          // Mark subscriptions as alerted
          const subIds = subscriptions.map(s => s._id);
          await Subscription.updateMany(
            { _id: { $in: subIds } },
            { $set: { renewalAlertSentAt: new Date() } }
          );
          totalAlertsSent++;
          console.log(`[renewalNotifier] Alert sent to ${user.email} (${result.method || 'smtp'}) for ${subscriptions.length} subscriptions`);
        } else {
          console.error(`[renewalNotifier] Failed to send alert to ${user.email}:`, result.error || result.reason);
        }

      } catch (error) {
        console.error(`[renewalNotifier] Error processing user ${user.email}:`, error.message);
      }
    }

    console.log(`[${new Date().toISOString()}] Renewal alert check complete. Sent ${totalAlertsSent} alerts.`);
    return { totalAlertsSent };

  } catch (error) {
    console.error('[renewalNotifier] Error in checkAndSendRenewalAlerts:', error);
    throw error;
  }
}

/**
 * Initialize the renewal alert scheduler
 * Runs daily at 8:00 AM
 */
function initializeRenewalNotifier() {
  const timezone = process.env.TIMEZONE || 'America/New_York';

  cron.schedule('0 8 * * *', async () => {
    try {
      await checkAndSendRenewalAlerts();
    } catch (error) {
      console.error('[renewalNotifier] Error in scheduled alert check:', error);
    }
  }, {
    scheduled: true,
    timezone: timezone
  });

  console.log('✅ Renewal alert notifier initialized');
  console.log(`   Schedule: Daily at 8:00 AM`);
  console.log(`   Alert window: ${ALERT_DAYS} days before renewal`);
  console.log(`   Timezone: ${timezone}`);
}

module.exports = {
  checkAndSendRenewalAlerts,
  initializeRenewalNotifier
};
