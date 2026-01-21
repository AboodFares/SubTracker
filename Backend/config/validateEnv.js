/**
 * Validates required environment variables on startup
 */
function validateEnv() {
  const required = [
    'MONGODB_URI',
    'JWT_SECRET',
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET',
    'GOOGLE_REDIRECT_URI'
  ];

  const optional = [
    'OPENAI_API_KEY',
    'PLAID_CLIENT_ID',
    'PLAID_SECRET_KEY',
    'PLAID_ENV',
    'BACKEND_URL',
    'FRONTEND_URL',
    'EMAIL_HOST',
    'EMAIL_PORT',
    'EMAIL_USER',
    'EMAIL_PASS',
    'ENCRYPTION_KEY'
  ];

  const missing = [];
  const warnings = [];

  // Check required variables
  required.forEach(key => {
    if (!process.env[key]) {
      missing.push(key);
    }
  });

  // Check optional but recommended variables
  if (!process.env.OPENAI_API_KEY) {
    warnings.push('OPENAI_API_KEY - Email processing will not work');
  }

  if (!process.env.PLAID_CLIENT_ID || !process.env.PLAID_SECRET_KEY) {
    warnings.push('Plaid credentials - Bank connection will not work');
  }

  if (!process.env.ENCRYPTION_KEY) {
    warnings.push('ENCRYPTION_KEY - Using default (not secure for production)');
  }

  // Report results
  if (missing.length > 0) {
    console.error('❌ Missing required environment variables:');
    missing.forEach(key => console.error(`   - ${key}`));
    console.error('\nPlease set these in your .env file');
    process.exit(1);
  }

  if (warnings.length > 0) {
    console.warn('⚠️  Environment variable warnings:');
    warnings.forEach(warning => console.warn(`   - ${warning}`));
  }

  console.log('✅ Environment variables validated');
}

module.exports = validateEnv;

