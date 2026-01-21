import { useState, useEffect } from 'react';
import { usePlaidLink } from 'react-plaid-link';
import { bankAPI } from '../services/api';
import { format } from 'date-fns';

const BankConnection = () => {
  const [linkToken, setLinkToken] = useState(null);
  const [bankStatus, setBankStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchBankStatus();
    fetchLinkToken();
  }, []);

  const fetchLinkToken = async () => {
    try {
      console.log('[BankConnection] Fetching link token...');
      const token = localStorage.getItem('token');
      if (!token) {
        setError('You are not logged in. Please log in first.');
        return;
      }
      
      const response = await bankAPI.createLinkToken();
      console.log('[BankConnection] Link token response:', response.data);
      
      if (response.data.success && response.data.linkToken) {
        setLinkToken(response.data.linkToken);
        setError(''); // Clear any previous errors
        console.log('[BankConnection] Link token received successfully');
      } else {
        setError('Failed to get link token from server. Please check backend logs.');
        console.error('[BankConnection] Invalid response:', response.data);
      }
    } catch (error) {
      console.error('[BankConnection] Error fetching link token:', error);
      console.error('[BankConnection] Error details:', {
        status: error.response?.status,
        data: error.response?.data,
        message: error.message
      });
      
      // Check if it's an authentication error
      if (error.response?.status === 401) {
        setError('Your session expired. Please log out and log in again to continue.');
        // Clear invalid token
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        return;
      }
      // Check if it's a service unavailable error (Plaid not configured)
      if (error.response?.status === 503) {
        setError('Bank connection service is temporarily unavailable. Please contact support.');
        return;
      }
      const errorMessage = error.response?.data?.message || error.response?.data?.error || error.message || 'Failed to initialize bank connection';
      setError(`Failed to initialize bank connection: ${errorMessage}. Please check that Plaid credentials are configured in the backend.`);
    }
  };

  const fetchBankStatus = async () => {
    try {
      setLoading(true);
      const response = await bankAPI.getStatus();
      setBankStatus(response.data);
      setError(''); // Clear errors on successful status fetch
    } catch (error) {
      console.error('Error fetching bank status:', error);
      // Don't show error for status fetch failures - it's not critical
      if (error.response?.status === 401) {
        // Token expired - will be handled when user tries to connect
        console.warn('Authentication token expired');
      }
    } finally {
      setLoading(false);
    }
  };

  const onSuccess = async (publicToken, metadata) => {
    try {
      await bankAPI.exchangeToken(publicToken);
      await fetchBankStatus();
    } catch (error) {
      console.error('Error exchanging token:', error);
      setError('Failed to connect bank account');
    }
  };

  // Initialize Plaid Link - provide default handlers even when token is null
  const { open, ready, error: plaidError } = usePlaidLink({
    token: linkToken,
    onSuccess: linkToken ? onSuccess : () => {},
    onExit: (err, metadata) => {
      if (err) {
        console.error('Plaid Link error:', err);
        setError(`Bank connection failed: ${err.display_message || err.error_message || 'Unknown error'}`);
      }
    },
  });

  // Show Plaid Link errors
  useEffect(() => {
    if (plaidError) {
      console.error('Plaid Link initialization error:', plaidError);
      setError(`Plaid Link error: ${plaidError.error_message || plaidError.error_code || 'Failed to initialize'}`);
    }
  }, [plaidError]);

  const handleSync = async () => {
    try {
      setSyncing(true);
      setError('');
      console.log('[BankConnection] Starting sync...');
      
      const response = await bankAPI.sync();
      console.log('[BankConnection] Sync response:', response.data);
      
      if (response.data.success) {
        const stats = response.data.stats;
        alert(`Sync complete!\n\nTransactions found: ${stats.transactionsFound}\nSubscriptions created: ${stats.subscriptionsCreated}\nPotential subscriptions: ${stats.potential}`);
        await fetchBankStatus();
      } else {
        setError(response.data.message || 'Sync completed with errors');
      }
    } catch (error) {
      console.error('[BankConnection] Error syncing:', error);
      console.error('[BankConnection] Error details:', {
        status: error.response?.status,
        data: error.response?.data,
        message: error.message
      });
      
      // Show detailed error message
      let errorMessage = 'Failed to sync transactions';
      if (error.response?.data?.message) {
        errorMessage = error.response.data.message;
      } else if (error.response?.data?.error) {
        errorMessage = error.response.data.error;
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      // Add more context for common errors
      if (error.response?.status === 401) {
        errorMessage = 'Your session expired. Please log out and log in again.';
      } else if (error.response?.status === 500) {
        errorMessage = `Server error: ${errorMessage}. Check backend logs for details.`;
      }
      
      setError(errorMessage);
    } finally {
      setSyncing(false);
    }
  };

  const handleDisconnect = async () => {
    if (!window.confirm('Are you sure you want to disconnect your bank account? This will remove the connection and you will need to reconnect to sync transactions again.')) {
      return;
    }

    try {
      setError('');
      setLoading(true);
      
      console.log('[BankConnection] Attempting to disconnect...');
      const response = await bankAPI.disconnect();
      
      console.log('[BankConnection] Disconnect response:', response.data);
      
      if (response.data.success) {
        // Immediately clear the bank status
        setBankStatus(null);
        console.log('[BankConnection] Bank status cleared');
        
        // Refresh status to confirm it's gone
        await fetchBankStatus();
        
        // Refresh link token for potential new connection
        await fetchLinkToken();
        
        console.log('[BankConnection] Disconnect complete, UI updated');
      } else {
        setError(response.data.message || 'Failed to disconnect bank account');
      }
    } catch (error) {
      console.error('[BankConnection] Error disconnecting:', error);
      const errorMessage = error.response?.data?.message || 'Failed to disconnect bank account';
      setError(errorMessage);
      
      // Even if API call fails, refresh status to check if connection is actually gone
      console.log('[BankConnection] Refreshing status after error...');
      await fetchBankStatus();
      
      // If status shows no connection, clear it
      if (!bankStatus?.connected) {
        setBankStatus(null);
      }
      
      await fetchLinkToken();
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-white/80 backdrop-blur-lg rounded-xl shadow-lg p-6 border border-gray-200/50">
        <div className="text-center py-8">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-indigo-200 border-t-indigo-600"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white/90 dark:bg-gray-900/90 backdrop-blur-xl rounded-2xl shadow-xl p-8 border border-gray-200/60 dark:border-gray-800/60">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg">
          <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
          </svg>
        </div>
        <h2 className="text-3xl font-extrabold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">Bank Connection</h2>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border-2 border-red-200 dark:border-red-800 rounded-xl text-red-700 dark:text-red-400 flex items-center gap-3 shadow-lg">
          <svg className="w-6 h-6 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="font-semibold">{error}</span>
        </div>
      )}

      {!bankStatus?.connected ? (
        <div className="text-center py-12">
          <div className="inline-flex items-center justify-center w-24 h-24 bg-gradient-to-br from-indigo-100 to-purple-100 dark:from-indigo-900/30 dark:to-purple-900/30 rounded-3xl mb-6 shadow-lg">
            <svg className="w-12 h-12 text-indigo-600 dark:text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
            </svg>
          </div>
          <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">Connect Your Bank Account</h3>
          <p className="text-gray-600 dark:text-gray-400 mb-8 max-w-md mx-auto text-lg">
            Securely connect your bank account to automatically detect subscription charges from transactions
          </p>
          <button
            onClick={async () => {
              // If linkToken is missing, try to fetch it again
              if (!linkToken) {
                setError('Link token not available. Attempting to fetch...');
                await fetchLinkToken();
                return;
              }
              
              if (ready && linkToken) {
                try {
                  open();
                } catch (err) {
                  console.error('Error opening Plaid Link:', err);
                  setError('Failed to open bank connection. Please try again.');
                }
              } else {
                setError('Plaid Link is not ready. Please check your backend configuration and browser console for errors.');
              }
            }}
            disabled={loading}
            className="px-8 py-4 bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 text-white rounded-xl font-bold text-lg hover:from-indigo-700 hover:via-purple-700 hover:to-pink-700 transition-all shadow-xl hover:shadow-2xl hover:-translate-y-1 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-xl"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Initializing...
              </span>
            ) : !linkToken ? (
              <span className="flex items-center gap-2">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Configuration Error
              </span>
            ) : !ready ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Loading...
              </span>
            ) : (
              'Connect Bank Account'
            )}
          </button>
          {!linkToken && (
            <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
              Waiting for Plaid configuration... Check browser console for errors.
            </p>
          )}
        </div>
      ) : (
        <div>
          <div className="bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 border-2 border-green-200 dark:border-green-800 rounded-2xl p-6 mb-6 shadow-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl flex items-center justify-center shadow-lg">
                  <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-bold text-green-900 dark:text-green-300 text-lg mb-1">Bank Account Connected</h3>
                  <p className="text-sm font-semibold text-green-700 dark:text-green-400">
                    {bankStatus.bankConnection.bankName} •••• {bankStatus.bankConnection.accountMask}
                  </p>
                  {bankStatus.bankConnection.lastSyncDate && (
                    <p className="text-xs text-green-600 dark:text-green-500 mt-1 font-medium">
                      Last synced: {format(new Date(bankStatus.bankConnection.lastSyncDate), 'MMM dd, yyyy HH:mm')}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="flex gap-4">
            <button
              onClick={handleSync}
              disabled={syncing}
              className="flex-1 px-6 py-4 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl font-bold hover:from-indigo-700 hover:to-purple-700 transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-lg flex items-center justify-center gap-2"
            >
              {syncing ? (
                <>
                  <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Syncing...
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Sync Transactions
                </>
              )}
            </button>
            <button
              onClick={handleDisconnect}
              className="px-6 py-4 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5 flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              Disconnect
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default BankConnection;

