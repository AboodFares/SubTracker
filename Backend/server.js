const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

// Validate environment variables first
const validateEnv = require('./config/validateEnv');
validateEnv();

const connectDB = require('./config/db');
const { initializeEmailScheduler } = require('./services/emailScheduler');
const { initializeBankScheduler } = require('./services/bankScheduler');

const app = express();

// Connect to Database and initialize schedulers
(async () => {
  try {
    await connectDB();
    // Initialize automated email scanner after DB connection
    initializeEmailScheduler();
    // Initialize automated bank transaction sync
    initializeBankScheduler();
  } catch (error) {
    console.error('Failed to initialize:', error);
  }
})();

const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet());

// Request logging
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// Rate limiting - More lenient in development
const isDevelopment = process.env.NODE_ENV === 'development';

// Skip rate limiting entirely in development, or use very high limits
const limiter = isDevelopment 
  ? (req, res, next) => next() // Disable rate limiting in development
  : rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100, // Limit each IP to 100 requests per windowMs
      message: 'Too many requests from this IP, please try again later.',
      standardHeaders: true,
      legacyHeaders: false,
      // Skip rate limiting for Google OAuth routes (handled by Google)
      skip: (req) => {
        const path = req.path || req.url?.split('?')[0];
        return path === '/api/auth/google' || path === '/api/auth/google/callback';
      }
    });

// Stricter rate limiting for auth endpoints (disabled in development)
const authLimiter = isDevelopment
  ? (req, res, next) => next() // Disable rate limiting in development
  : rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 5, // Limit each IP to 5 requests per windowMs
      message: 'Too many authentication attempts, please try again later.',
      standardHeaders: true,
      legacyHeaders: false,
      // Skip Google OAuth routes
      skip: (req) => {
        const path = req.path || req.url?.split('?')[0];
        return path === '/api/auth/google' || path === '/api/auth/google/callback';
      }
    });

// Apply rate limiting
app.use('/api/', limiter);
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);

// CORS configuration
const corsOptions = {
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
  optionsSuccessStatus: 200
};
app.use(cors(corsOptions));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Routes
const authRoutes = require('./Routes/Auth');
const aiRoutes = require('./Routes/AI');
const subscriptionRoutes = require('./Routes/Subscriptions');
const bankRoutes = require('./Routes/Bank');
const potentialSubscriptionsRoutes = require('./Routes/PotentialSubscriptions');
const statementRoutes = require('./Routes/StatementUpload');

app.use('/api/auth', authRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/subscriptions', subscriptionRoutes);
app.use('/api/bank', bankRoutes);
app.use('/api/potential-subscriptions', potentialSubscriptionsRoutes);
app.use('/api/statements', statementRoutes);

// Health check route
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Server is running' });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    message: 'Something went wrong!',
    error: process.env.NODE_ENV === 'development' ? err.message : {}
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found'
  });
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

module.exports = app;

