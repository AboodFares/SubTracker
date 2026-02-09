const mongoose = require('mongoose');

const extractedSubscriptionSchema = new mongoose.Schema({
  merchantName: { type: String, required: true },
  amount: { type: Number, required: true },
  currency: { type: String, default: 'CAD' },
  frequency: { type: String, enum: ['monthly', 'yearly', 'weekly', 'unknown'], default: 'monthly' },
  occurrences: { type: Number, default: 1 },
  transactionDates: [Date],
  confidence: { type: String, enum: ['high', 'medium', 'low'], default: 'medium' },
  addedToSubscriptions: { type: Boolean, default: false },
  subscriptionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subscription' }
});

const bankStatementSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  originalFilename: { type: String, required: true },
  uploadDate: { type: Date, default: Date.now },
  statementPeriod: {
    startDate: Date,
    endDate: Date
  },
  totalTransactions: { type: Number, default: 0 },
  extractedSubscriptions: [extractedSubscriptionSchema],
  status: { type: String, enum: ['processing', 'completed', 'failed'], default: 'processing' },
  errorMessage: String
}, { timestamps: true });

bankStatementSchema.index({ userId: 1, uploadDate: -1 });

module.exports = mongoose.model('BankStatement', bankStatementSchema);
