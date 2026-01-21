const mongoose = require('mongoose');

const subscriptionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  companyName: {
    type: String,
    required: true,
    trim: true
  },
  price: {
    type: Number,
    required: true
  },
  currency: {
    type: String,
    required: true,
    default: 'USD',
    uppercase: true,
    trim: true
  },
  startDate: {
    type: Date,
    required: true
  },
  nextRenewalDate: {
    type: Date
  },
  cancellationDate: {
    type: Date
  },
  accessEndDate: {
    type: Date
  },
  status: {
    type: String,
    enum: ['active', 'cancelled'],
    default: 'active',
    required: true
  },
  confidence: {
    type: String,
    enum: ['confirmed', 'potential', 'user_confirmed'],
    default: 'confirmed'
  },
  source: {
    type: String,
    enum: ['email', 'transaction', 'transaction_email', 'document', 'manual'],
    default: 'email'
  },
  planName: {
    type: String,
    trim: true
  },
  // Track the email that created/updated this subscription
  sourceEmailId: {
    type: String
  },
  sourceEmailDate: {
    type: Date
  }
}, {
  timestamps: true
});

// Index for efficient queries
subscriptionSchema.index({ userId: 1, status: 1 });
subscriptionSchema.index({ userId: 1, companyName: 1 });

module.exports = mongoose.model('Subscription', subscriptionSchema);

