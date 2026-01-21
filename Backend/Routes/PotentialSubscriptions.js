const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const PotentialSubscription = require('../models/PotentialSubscription');
const Subscription = require('../models/Subscription');
const { processSubscriptionData } = require('../services/subscriptionService');

/**
 * Middleware to authenticate user
 */
const authenticateUser = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'No token provided'
      });
    }

    const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
    const decoded = jwt.verify(token, JWT_SECRET);
    
    const user = await User.findById(decoded.userId);
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User not found'
      });
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
 * GET /api/potential-subscriptions
 * Get all potential subscriptions needing user confirmation
 */
router.get('/', authenticateUser, async (req, res) => {
  try {
    const potentialSubs = await PotentialSubscription.find({
      userId: req.user._id,
      'userAction.action': 'pending'
    }).sort({ transactionDate: -1 });

    res.status(200).json({
      success: true,
      count: potentialSubs.length,
      potentialSubscriptions: potentialSubs
    });
  } catch (error) {
    console.error('Error getting potential subscriptions:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get potential subscriptions',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

/**
 * POST /api/potential-subscriptions/:id/confirm
 * User confirms a potential subscription
 */
router.post('/:id/confirm', authenticateUser, async (req, res) => {
  try {
    const { reason } = req.body; // Optional reason (e.g., "transaction_late")
    const potentialSub = await PotentialSubscription.findById(req.params.id);

    if (!potentialSub || potentialSub.userId.toString() !== req.user._id.toString()) {
      return res.status(404).json({
        success: false,
        message: 'Potential subscription not found'
      });
    }

    // Create subscription
    const subscription = await processSubscriptionData(
      req.user._id,
      {
        serviceName: potentialSub.merchantName,
        eventType: 'start',
        amount: potentialSub.amount,
        currency: potentialSub.currency || 'USD',
        startDate: potentialSub.transactionDate,
        nextBillingDate: potentialSub.recurringPattern.detected && potentialSub.recurringPattern.frequency === 'monthly'
          ? new Date(potentialSub.transactionDate.getTime() + 30 * 24 * 60 * 60 * 1000)
          : null
      },
      {
        id: potentialSub.transactionId,
        date: potentialSub.transactionDate
      }
    );

    // Update subscription with confidence
    subscription.confidence = reason === 'transaction_late' ? 'confirmed' : 'user_confirmed';
    subscription.source = 'transaction';
    await subscription.save();

    // Update potential subscription
    potentialSub.confidence = 'confirmed';
    potentialSub.userAction = {
      action: 'confirmed',
      actionDate: new Date(),
      reason: reason || 'user_confirmed'
    };
    potentialSub.subscriptionId = subscription._id;
    await potentialSub.save();

    res.status(200).json({
      success: true,
      message: 'Subscription confirmed',
      subscription: subscription
    });
  } catch (error) {
    console.error('Error confirming potential subscription:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to confirm subscription',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

/**
 * POST /api/potential-subscriptions/:id/reject
 * User rejects a potential subscription
 */
router.post('/:id/reject', authenticateUser, async (req, res) => {
  try {
    const { reason } = req.body;
    const potentialSub = await PotentialSubscription.findById(req.params.id);

    if (!potentialSub || potentialSub.userId.toString() !== req.user._id.toString()) {
      return res.status(404).json({
        success: false,
        message: 'Potential subscription not found'
      });
    }

    potentialSub.confidence = 'rejected';
    potentialSub.userAction = {
      action: 'rejected',
      actionDate: new Date(),
      reason: reason || 'not_a_subscription'
    };
    await potentialSub.save();

    res.status(200).json({
      success: true,
      message: 'Subscription rejected'
    });
  } catch (error) {
    console.error('Error rejecting potential subscription:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reject subscription',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

/**
 * POST /api/potential-subscriptions/confirm-email/:subscriptionId
 * User confirms an email subscription that has no matching transaction
 */
router.post('/confirm-email/:subscriptionId', authenticateUser, async (req, res) => {
  try {
    const { reason } = req.body; // e.g., "transaction_late"
    const subscription = await Subscription.findById(req.params.subscriptionId);

    if (!subscription || subscription.userId.toString() !== req.user._id.toString()) {
      return res.status(404).json({
        success: false,
        message: 'Subscription not found'
      });
    }

    // Update subscription confidence
    if (reason === 'transaction_late') {
      subscription.confidence = 'confirmed';
    } else {
      subscription.confidence = 'user_confirmed';
    }
    await subscription.save();

    res.status(200).json({
      success: true,
      message: 'Email subscription confirmed',
      subscription: subscription
    });
  } catch (error) {
    console.error('Error confirming email subscription:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to confirm subscription',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

module.exports = router;

