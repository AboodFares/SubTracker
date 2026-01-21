import { useState, useEffect } from 'react';
import { usePlaidLink } from 'react-plaid-link';
import { bankAPI } from '../services/api';

const Onboarding = ({ onComplete }) => {
  const [linkToken, setLinkToken] = useState(null);
  const [step, setStep] = useState(1); // 1: Welcome, 2: Bank Connection, 3: Complete
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchLinkToken();
  }, []);

  const fetchLinkToken = async () => {
    try {
      const response = await bankAPI.createLinkToken();
      if (response.data.success && response.data.linkToken) {
        setLinkToken(response.data.linkToken);
      } else {
        setError('Failed to initialize bank connection');
      }
    } catch (error) {
      console.error('Error fetching link token:', error);
      setError('Failed to initialize bank connection. You can connect later from the dashboard.');
    } finally {
      setLoading(false);
    }
  };

  const onSuccess = async (publicToken, metadata) => {
    try {
      await bankAPI.exchangeToken(publicToken);
      setStep(3); // Move to completion step
    } catch (error) {
      console.error('Error connecting bank:', error);
      setError('Failed to connect bank account. You can try again later.');
    }
  };

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess: linkToken ? onSuccess : () => {},
    onExit: () => {
      // User can skip bank connection
      if (step === 2) {
        setStep(3);
      }
    },
  });

  const handleSkip = () => {
    if (onComplete) {
      onComplete();
    }
  };

  const handleContinue = () => {
    if (step === 1) {
      setStep(2);
    } else if (step === 3) {
      if (onComplete) {
        onComplete();
      }
    }
  };

  const handleConnectBank = () => {
    if (ready && linkToken) {
      open();
    } else {
      setError('Bank connection is not ready. Please try again.');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-2xl w-full p-8 relative">
        {/* Step 1: Welcome */}
        {step === 1 && (
          <div className="text-center">
            <div className="w-20 h-20 bg-gradient-to-br from-indigo-600 to-purple-600 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
              Welcome to Subscription Tracker!
            </h2>
            <p className="text-gray-600 dark:text-gray-400 mb-8 text-lg">
              You've successfully signed in with Google. To get the most accurate subscription tracking, 
              let's connect your bank account. This will help us automatically detect subscription charges.
            </p>
            <div className="flex gap-4 justify-center">
              <button
                onClick={handleSkip}
                className="px-6 py-3 text-gray-700 dark:text-gray-300 font-medium rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition"
              >
                Skip for now
              </button>
              <button
                onClick={handleContinue}
                className="px-6 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-semibold rounded-lg hover:from-indigo-700 hover:to-purple-700 transition shadow-lg"
              >
                Connect Bank Account
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Bank Connection */}
        {step === 2 && (
          <div className="text-center">
            <div className="w-20 h-20 bg-gradient-to-br from-indigo-600 to-purple-600 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
              </svg>
            </div>
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
              Connect Your Bank Account
            </h2>
            <p className="text-gray-600 dark:text-gray-400 mb-8 text-lg">
              Securely connect your bank account using Plaid. This allows us to automatically 
              detect subscription charges from your transactions.
            </p>
            
            {error && (
              <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400">
                {error}
              </div>
            )}

            <div className="flex gap-4 justify-center">
              <button
                onClick={() => setStep(1)}
                className="px-6 py-3 text-gray-700 dark:text-gray-300 font-medium rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition"
              >
                Back
              </button>
              <button
                onClick={handleConnectBank}
                disabled={!ready || !linkToken || loading}
                className="px-6 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-semibold rounded-lg hover:from-indigo-700 hover:to-purple-700 transition shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Loading...' : ready && linkToken ? 'Connect Bank Account' : 'Initializing...'}
              </button>
              <button
                onClick={handleSkip}
                className="px-6 py-3 text-gray-700 dark:text-gray-300 font-medium rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition"
              >
                Skip
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Complete */}
        {step === 3 && (
          <div className="text-center">
            <div className="w-20 h-20 bg-gradient-to-br from-green-500 to-emerald-600 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
              You're All Set!
            </h2>
            <p className="text-gray-600 dark:text-gray-400 mb-8 text-lg">
              {linkToken ? 
                'Your bank account has been connected successfully. We\'ll start tracking your subscriptions automatically!' :
                'You can connect your bank account later from the dashboard to enable automatic subscription detection.'}
            </p>
            <button
              onClick={handleContinue}
              className="px-8 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-semibold rounded-lg hover:from-indigo-700 hover:to-purple-700 transition shadow-lg"
            >
              Go to Dashboard
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default Onboarding;

