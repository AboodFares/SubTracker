const express = require('express');
const router = express.Router();
const multer = require('multer');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Subscription = require('../models/Subscription');
const BankStatement = require('../models/BankStatement');
const { extractTextFromPDF, parseTransactions } = require('../services/pdfService');
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

      // Step 2: Parse transactions from text
      let transactions = parseTransactions(text);

      // Fallback: if parsing found too few transactions, send raw text to AI
      let useRawText = false;
      if (transactions.length < 5 && numPages > 1) {
        useRawText = true;
      }

      // Step 3: Send to AI for subscription detection
      let aiInput;
      if (useRawText) {
        // Send raw text as a single "transaction" for AI to parse
        aiInput = [{ date: null, description: text.substring(0, 15000), amount: 0 }];
      } else {
        aiInput = transactions;
      }

      const detectedSubscriptions = await analyzeStatementTransactions(aiInput);

      // Step 4: Save results
      statement.totalTransactions = transactions.length;
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
        message: `Found ${detectedSubscriptions.length} potential subscriptions from ${transactions.length} transactions`,
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

    // Create new subscription
    const subscription = await Subscription.create({
      userId,
      companyName: detected.merchantName,
      price: detected.amount,
      currency: detected.currency || 'CAD',
      startDate: detected.transactionDates?.[0] || new Date(),
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
