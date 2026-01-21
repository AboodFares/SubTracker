const mongoose = require('mongoose');

const potentialSubscriptionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  merchantName: {
    type: String,
    required: true
  },
  amount: {
    type: Number,
    required: true
  },
  currency: {
    type: String,
    default: 'USD'
  },
  transactionDate: {
    type: Date,
    required: true
  },
  transactionId: {
    type: String,
    required: true,
    index: true
  },
  accountId: {
    type: String
  },
  confidence: {
    type: String,
    enum: ['potential', 'confirmed', 'rejected'],
    default: 'potential',
    required: true
  },
  reason: {
    type: String,
    enum: ['transaction_only', 'email_only', 'transaction_pattern', 'transaction_email_match'],
    required: true
  },
  matchedEmailId: {
    type: String // Gmail email ID if matched
  },
  matchedEmailDate: {
    type: Date
  },
  recurringPattern: {
    detected: {
      type: Boolean,
      default: false
    },
    frequency: {
      type: String,
      enum: ['monthly', 'yearly', 'weekly', 'unknown']
    },
    occurrences: {
      type: Number,
      default: 0
    }
  },
  userAction: {
    action: {
      type: String,
      enum: ['confirmed', 'rejected', 'pending']
    },
    actionDate: {
      type: Date
    },
    reason: {
      type: String
    }
  },
  subscriptionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Subscription'
  }
}, {
  timestamps: true
});

// Indexes for efficient queries
potentialSubscriptionSchema.index({ userId: 1, confidence: 1 });
potentialSubscriptionSchema.index({ userId: 1, transactionId: 1 });
potentialSubscriptionSchema.index({ userId: 1, userAction: { action: 1 } });

module.exports = mongoose.model('PotentialSubscription', potentialSubscriptionSchema);

