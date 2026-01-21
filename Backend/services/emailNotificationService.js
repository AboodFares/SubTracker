const nodemailer = require('nodemailer');

// Initialize email transporter
// For production, use a service like SendGrid, AWS SES, etc.
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: process.env.SMTP_PORT || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

/**
 * Send email notification
 */
async function sendEmail(to, subject, html, text) {
  try {
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
      console.log('Email not configured. Would send:', { to, subject });
      return { sent: false, reason: 'Email not configured' };
    }

    const mailOptions = {
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to,
      subject,
      html,
      text: text || html.replace(/<[^>]*>/g, ''),
    };

    const info = await transporter.sendMail(mailOptions);
    return { sent: true, messageId: info.messageId };
  } catch (error) {
    console.error('Error sending email:', error);
    return { sent: false, error: error.message };
  }
}

/**
 * Send document processed email
 */
async function sendDocumentProcessedEmail(user, document, extractedData) {
  if (!user.emailNotifications?.documentProcessed) {
    return;
  }

  const subject = 'Your Document Has Been Processed';
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>Document Processed Successfully</h2>
      <p>Hello ${user.name},</p>
      <p>We've successfully processed your document: <strong>${document.originalFilename}</strong></p>
      
      ${extractedData ? `
        <div style="background: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
          <h3>Subscription Detected:</h3>
          <ul>
            <li><strong>Service:</strong> ${extractedData.serviceName}</li>
            <li><strong>Event:</strong> ${extractedData.eventType}</li>
            ${extractedData.amount ? `<li><strong>Amount:</strong> ${extractedData.currency || 'USD'} ${extractedData.amount}</li>` : ''}
            ${extractedData.nextBillingDate ? `<li><strong>Next Billing:</strong> ${extractedData.nextBillingDate}</li>` : ''}
          </ul>
        </div>
      ` : '<p>No subscription information was found in this document.</p>'}
      
      <p>View your subscriptions in your <a href="${process.env.FRONTEND_URL}/dashboard">dashboard</a>.</p>
      <p>Best regards,<br>Subscription Tracker Team</p>
    </div>
  `;

  return await sendEmail(user.email, subject, html);
}

/**
 * Send bank transaction detected email
 */
async function sendBankTransactionEmail(user, transaction, subscription) {
  if (!user.emailNotifications?.bankTransactionDetected) {
    return;
  }

  const subject = 'New Subscription Detected from Bank Transaction';
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>New Subscription Detected</h2>
      <p>Hello ${user.name},</p>
      <p>We detected a potential subscription charge from your bank account:</p>
      
      <div style="background: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
        <ul>
          <li><strong>Merchant:</strong> ${transaction.merchantName}</li>
          <li><strong>Amount:</strong> $${transaction.amount}</li>
          <li><strong>Date:</strong> ${transaction.date}</li>
        </ul>
      </div>
      
      ${subscription ? `
        <p>This has been added to your subscriptions. View it in your <a href="${process.env.FRONTEND_URL}/dashboard">dashboard</a>.</p>
      ` : ''}
      
      <p>Best regards,<br>Subscription Tracker Team</p>
    </div>
  `;

  return await sendEmail(user.email, subject, html);
}

/**
 * Send plan changed email
 */
async function sendPlanChangedEmail(user, oldPlan, newPlan) {
  if (!user.emailNotifications?.planChanged) {
    return;
  }

  const subject = 'Your Plan Has Been Changed';
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>Plan Changed Successfully</h2>
      <p>Hello ${user.name},</p>
      <p>Your subscription plan has been updated:</p>
      
      <div style="background: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
        <p><strong>Previous Plan:</strong> ${oldPlan?.name || 'None'}</p>
        <p><strong>New Plan:</strong> ${newPlan.name}</p>
        <p><strong>Price:</strong> $${newPlan.price}/${newPlan.billingCycle}</p>
      </div>
      
      <p>You now have access to all features of the ${newPlan.name} plan.</p>
      <p>View your plan details in your <a href="${process.env.FRONTEND_URL}/dashboard">dashboard</a>.</p>
      <p>Best regards,<br>Subscription Tracker Team</p>
    </div>
  `;

  return await sendEmail(user.email, subject, html);
}

/**
 * Send payment confirmation email
 */
async function sendPaymentConfirmationEmail(user, amount, planName) {
  if (!user.emailNotifications?.paymentReceived) {
    return;
  }

  const subject = 'Payment Received - Thank You!';
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>Payment Confirmed</h2>
      <p>Hello ${user.name},</p>
      <p>Thank you for your payment!</p>
      
      <div style="background: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
        <p><strong>Plan:</strong> ${planName}</p>
        <p><strong>Amount:</strong> $${amount}</p>
        <p><strong>Date:</strong> ${new Date().toLocaleDateString()}</p>
      </div>
      
      <p>Your subscription is now active. View your account in your <a href="${process.env.FRONTEND_URL}/dashboard">dashboard</a>.</p>
      <p>Best regards,<br>Subscription Tracker Team</p>
    </div>
  `;

  return await sendEmail(user.email, subject, html);
}

module.exports = {
  sendEmail,
  sendDocumentProcessedEmail,
  sendBankTransactionEmail,
  sendPlanChangedEmail,
  sendPaymentConfirmationEmail
};

