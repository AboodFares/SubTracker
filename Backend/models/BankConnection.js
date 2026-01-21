const mongoose = require('mongoose');

const bankConnectionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  bankName: {
    type: String,
    required: true
  },
  accountId: {
    type: String, // Plaid account ID
    required: true
  },
  accessToken: {
    type: String, // Encrypted Plaid access token
    required: true
  },
  itemId: {
    type: String, // Plaid item ID
    required: true
  },
  accountType: {
    type: String,
    enum: ['checking', 'savings', 'credit', 'other'],
    default: 'checking'
  },
  accountMask: {
    type: String // Last 4 digits of account
  },
  connectedDate: {
    type: Date,
    default: Date.now
  },
  lastSyncDate: {
    type: Date
  },
  status: {
    type: String,
    enum: ['active', 'disconnected', 'error', 'pending'],
    default: 'pending',
    required: true
  },
  errorMessage: {
    type: String
  },
  lastTransactionDate: {
    type: Date
  }
}, {
  timestamps: true
});

// Index for efficient queries
bankConnectionSchema.index({ userId: 1, status: 1 });
bankConnectionSchema.index({ itemId: 1 });

module.exports = mongoose.model('BankConnection', bankConnectionSchema);

