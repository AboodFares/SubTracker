const mongoose = require('mongoose');

const processedEmailSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  emailId: {
    type: String,
    required: true,
    index: true
  },
  processedAt: {
    type: Date,
    default: Date.now
  },
  status: {
    type: String,
    enum: ['processed', 'skipped', 'failed'],
    default: 'processed'
  },
  subscriptionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Subscription'
  }
}, {
  timestamps: true
});

// Compound index to ensure one email per user is only processed once
processedEmailSchema.index({ userId: 1, emailId: 1 }, { unique: true });

module.exports = mongoose.model('ProcessedEmail', processedEmailSchema);

