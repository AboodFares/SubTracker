const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    // Password is not required for Google OAuth users
    required: function() {
      return this.authProvider === 'local';
    }
  },
  picture: {
    type: String
  },
  googleId: {
    type: String
  },
  authProvider: {
    type: String,
    enum: ['local', 'google'],
    default: 'local'
  },
  googleTokens: {
    access_token: String,
    refresh_token: String,
    expiry_date: Number,
    scope: String,
    token_type: String
  },
  lastEmailScanDate: {
    type: Date,
    default: null
  },
  emailScanEnabled: {
    type: Boolean,
    default: true
  },
  currentPlan: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Plan',
    default: null
  },
  stripeCustomerId: {
    type: String,
    index: true
  },
  emailNotifications: {
    documentProcessed: {
      type: Boolean,
      default: true
    },
    bankTransactionDetected: {
      type: Boolean,
      default: true
    },
    planChanged: {
      type: Boolean,
      default: true
    },
    paymentReceived: {
      type: Boolean,
      default: true
    }
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('User', userSchema);

