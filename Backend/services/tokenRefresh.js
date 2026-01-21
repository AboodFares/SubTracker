// services/tokenRefresh.js
const { oauth2Client } = require('../config/oAuth');
const User = require('../models/User');

/**
 * Refreshes Google OAuth access token using refresh token
 * @param {Object} user - User document with googleTokens
 * @returns {Object} - New tokens with expiry
 */
async function refreshGoogleToken(user) {
  try {
    console.log(`[tokenRefresh] Attempting to refresh token for user: ${user.email}`);
    
    // Check if user has refresh token
    if (!user.googleTokens || !user.googleTokens.refresh_token) {
      console.error(`[tokenRefresh] No refresh token found for user: ${user.email}`);
      throw new Error('No refresh token available. Please reconnect your Google account.');
    }

    // Reload user from database to ensure we have a fresh Mongoose document
    const freshUser = await User.findById(user._id);
    if (!freshUser) {
      throw new Error('User not found in database');
    }

    // Set current credentials (including refresh token)
    oauth2Client.setCredentials({
      refresh_token: freshUser.googleTokens.refresh_token
    });

    // Refresh the access token
    const { credentials } = await oauth2Client.refreshAccessToken();
    console.log(`[tokenRefresh] Successfully refreshed token for user: ${freshUser.email}`);

    // Update user's tokens in database
    freshUser.googleTokens = {
      ...freshUser.googleTokens,
      access_token: credentials.access_token,
      expiry_date: credentials.expiry_date,
      token_type: credentials.token_type || 'Bearer',
      scope: credentials.scope || freshUser.googleTokens.scope
    };

    await freshUser.save();
    console.log(`[tokenRefresh] Saved new tokens to database for user: ${freshUser.email}`);

    // Set credentials for immediate use
    oauth2Client.setCredentials(freshUser.googleTokens);

    return freshUser.googleTokens;
  } catch (error) {
    console.error(`[tokenRefresh] Error refreshing token for user ${user.email}:`, error);
    
    // Check if it's an invalid_grant error (refresh token expired/invalid)
    if (error.message?.includes('invalid_grant') || error.response?.data?.error === 'invalid_grant') {
      console.error(`[tokenRefresh] Refresh token is invalid/expired for user: ${user.email}`);
      throw new Error('Refresh token is invalid or expired. Please reconnect your Google account.');
    }
    
    throw error;
  }
}

/**
 * Checks if access token is expired or about to expire (within 5 minutes)
 * @param {Object} googleTokens - User's Google tokens
 * @returns {boolean} - True if token is expired or expiring soon
 */
function isTokenExpired(googleTokens) {
  if (!googleTokens || !googleTokens.expiry_date) {
    return true; // No expiry date means we should refresh
  }

  // expiry_date is a timestamp (number), not a Date object
  const expiryTimestamp = typeof googleTokens.expiry_date === 'number' 
    ? googleTokens.expiry_date 
    : new Date(googleTokens.expiry_date).getTime();
  
  const now = Date.now();
  const fiveMinutesFromNow = now + (5 * 60 * 1000); // 5 minutes buffer

  return expiryTimestamp <= fiveMinutesFromNow;
}

/**
 * Ensures Google OAuth token is valid, refreshing if necessary
 * @param {Object} user - User document
 * @returns {Object} - User with refreshed tokens if needed
 */
async function ensureValidToken(user) {
  try {
    // Check if token exists
    if (!user.googleTokens || !user.googleTokens.access_token) {
      throw new Error('No Google OAuth tokens found. Please reconnect your Google account.');
    }

    // Check if token is expired or about to expire
    if (isTokenExpired(user.googleTokens)) {
      console.log(`[ensureValidToken] Token expired for user: ${user.email}, refreshing...`);
      await refreshGoogleToken(user);
      // Reload user from database to get updated tokens
      const updatedUser = await User.findById(user._id);
      oauth2Client.setCredentials(updatedUser.googleTokens);
      return updatedUser;
    }

    // Token is still valid, set credentials and return user
    oauth2Client.setCredentials(user.googleTokens);
    return user;
  } catch (error) {
    console.error(`[ensureValidToken] Error ensuring valid token for user ${user.email}:`, error);
    throw error;
  }
}

module.exports = {
  refreshGoogleToken,
  isTokenExpired,
  ensureValidToken
};
