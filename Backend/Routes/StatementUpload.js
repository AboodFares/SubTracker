const express = require('express');
const router = express.Router();
const multer = require('multer');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Subscription = require('../models/Subscription');
const BankStatement = require('../models/BankStatement');
const { extractTextFromPDF } = require('../services/pdfService');
const { analyzeStatementTransactions } = require('../services/aiService');
const { findExistingSubscription } = require('../services/subscriptionService');

// Multer config: memory storage, PDF only, 10MB limit
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'), false);
    }
  }
});

const authenticateUser = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ success: false, message: 'No token provided' });
    }
    const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.userId);
    if (!user) {
      return res.status(401).json({ success: false, message: 'User not found' });
    }
    req.user = user;
    next();
  } catch (error) {
    res.status(401).json({ success: false, message: 'Invalid token' });
  }
};

/**
 * POST /api/statements/upload
 * Upload a PDF bank statement, parse it, and detect subscriptions
 */
router.post('/upload', authenticateUser, upload.single('statement'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No PDF file uploaded' });
    }

    const userId = req.user._id;

    // Create statement record in processing state
    const statement = await BankStatement.create({
      userId,
      originalFilename: req.file.originalname,
      status: 'processing'
    });

    try {
      // Step 1: Extract text from PDF
      const { text, numPages } = await extractTextFromPDF(req.file.buffer);

      if (!text || text.trim().length < 100) {
        statement.status = 'failed';
        statement.errorMessage = 'This PDF appears to be a scanned image or contains very little text. Please upload a text-based bank statement.';
        await statement.save();
        return res.status(400).json({ success: false, message: statement.errorMessage });
      }

      // Step 2: Send raw text directly to GPT-4.1 (no regex parsing needed)
      // GPT-4.1 with 1M token context can read any bank statement format natively
      const rawText = text.substring(0, 30000); // ~10K tokens, plenty for any statement
      console.log(`[StatementUpload] Sending ${rawText.length} chars of raw text to GPT-4.1 (${numPages} pages)`);

      // Step 3: Fetch previously detected subscriptions from earlier uploads
      // Only use the MOST RECENT completed statement's results (it already has accumulated context)
      const mostRecentStatement = await BankStatement.findOne({
        userId,
        status: 'completed',
        _id: { $ne: statement._id }
      }).sort({ uploadDate: -1 }).select('extractedSubscriptions').lean();

      const previousSubscriptions = [];
      if (mostRecentStatement) {
        for (const sub of (mostRecentStatement.extractedSubscriptions || [])) {
          previousSubscriptions.push({
            merchantName: sub.merchantName,
            amount: sub.amount,
            currency: sub.currency,
            frequency: sub.frequency,
            transactionDates: (sub.transactionDates || []).map(d =>
              d instanceof Date ? d.toISOString().split('T')[0] : String(d).split('T')[0]
            )
          });
        }
      }

      // Step 4: Send raw text to AI for subscription detection with cross-PDF context
      const detectedSubscriptions = await analyzeStatementTransactions(rawText, previousSubscriptions);

      // Step 5: Save results
      statement.totalTransactions = detectedSubscriptions.length;
      statement.extractedSubscriptions = detectedSubscriptions.map(sub => ({
        merchantName: sub.merchantName,
        amount: sub.amount,
        currency: sub.currency || 'CAD',
        frequency: sub.frequency || 'monthly',
        occurrences: sub.occurrences || 1,
        transactionDates: (sub.transactionDates || []).map(d => new Date(d)),
        confidence: sub.confidence || 'medium',
        addedToSubscriptions: false
      }));
      statement.status = 'completed';
      await statement.save();

      res.status(200).json({
        success: true,
        message: `Found ${detectedSubscriptions.length} potential subscriptions from ${numPages}-page statement`,
        statement
      });

    } catch (processingError) {
      statement.status = 'failed';
      statement.errorMessage = processingError.message;
      await statement.save();
      throw processingError;
    }

  } catch (error) {
    console.error('Error uploading statement:', error);

    if (error.message?.includes('password-protected') || error.message?.includes('scanned image')) {
      return res.status(400).json({ success: false, message: error.message });
    }
    if (error.message?.includes('Only PDF')) {
      return res.status(400).json({ success: false, message: 'Only PDF files are allowed' });
    }
    if (error.message?.includes('quota') || error.status === 429) {
      return res.status(429).json({ success: false, message: 'OpenAI API quota exceeded. Please try again later.' });
    }

    res.status(500).json({
      success: false,
      message: `Failed to process bank statement: ${error.message}`
    });
  }
});

/**
 * GET /api/statements
 * Get all uploaded statements for the authenticated user
 */
router.get('/', authenticateUser, async (req, res) => {
  try {
    const statements = await BankStatement.find({ userId: req.user._id })
      .sort({ uploadDate: -1 })
      .lean();

    res.status(200).json({ success: true, statements });
  } catch (error) {
    console.error('Error getting statements:', error);
    res.status(500).json({ success: false, message: 'Failed to get statements' });
  }
});

/**
 * POST /api/statements/:statementId/subscriptions/:index/add
 * Add a detected subscription to the main subscriptions list
 */
router.post('/:statementId/subscriptions/:index/add', authenticateUser, async (req, res) => {
  try {
    const { statementId, index } = req.params;
    const userId = req.user._id;

    const statement = await BankStatement.findOne({ _id: statementId, userId });
    if (!statement) {
      return res.status(404).json({ success: false, message: 'Statement not found' });
    }

    const subIndex = parseInt(index);
    if (subIndex < 0 || subIndex >= statement.extractedSubscriptions.length) {
      return res.status(400).json({ success: false, message: 'Invalid subscription index' });
    }

    const detected = statement.extractedSubscriptions[subIndex];
    if (detected.addedToSubscriptions) {
      return res.status(400).json({ success: false, message: 'Already added to subscriptions' });
    }

    // Check if subscription already exists
    const existing = await findExistingSubscription(userId, detected.merchantName);
    if (existing) {
      // Link to existing instead of creating duplicate
      detected.addedToSubscriptions = true;
      detected.subscriptionId = existing._id;
      await statement.save();
      return res.status(200).json({
        success: true,
        message: `${detected.merchantName} already exists in your subscriptions`,
        subscription: existing
      });
    }

    // Calculate next renewal from latest transaction date + frequency
    const dates = (detected.transactionDates || []).map(d => new Date(d)).sort((a, b) => a - b);
    const startDate = dates.length > 0 ? dates[0] : new Date();
    const latestDate = dates.length > 0 ? dates[dates.length - 1] : new Date();
    const nextRenewalDate = new Date(latestDate);
    switch (detected.frequency) {
      case 'weekly': nextRenewalDate.setDate(nextRenewalDate.getDate() + 7); break;
      case 'yearly': nextRenewalDate.setFullYear(nextRenewalDate.getFullYear() + 1); break;
      case 'monthly':
      default: nextRenewalDate.setMonth(nextRenewalDate.getMonth() + 1); break;
    }

    // Create new subscription
    const subscription = await Subscription.create({
      userId,
      companyName: detected.merchantName,
      price: detected.amount,
      currency: detected.currency || 'CAD',
      startDate,
      nextRenewalDate,
      status: 'active',
      confidence: 'user_confirmed',
      source: 'document'
    });

    detected.addedToSubscriptions = true;
    detected.subscriptionId = subscription._id;
    await statement.save();

    res.status(200).json({
      success: true,
      message: `${detected.merchantName} added to your subscriptions`,
      subscription
    });
  } catch (error) {
    console.error('Error adding subscription:', error);
    res.status(500).json({ success: false, message: 'Failed to add subscription' });
  }
});

/**
 * DELETE /api/statements/:id
 * Delete an uploaded statement
 */
router.delete('/:id', authenticateUser, async (req, res) => {
  try {
    const statement = await BankStatement.findOneAndDelete({
      _id: req.params.id,
      userId: req.user._id
    });

    if (!statement) {
      return res.status(404).json({ success: false, message: 'Statement not found' });
    }

    res.status(200).json({ success: true, message: 'Statement deleted' });
  } catch (error) {
    console.error('Error deleting statement:', error);
    res.status(500).json({ success: false, message: 'Failed to delete statement' });
  }
});

module.exports = router;
