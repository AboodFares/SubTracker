import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';
import { bankAPI } from '../services/api';
import Onboarding from './Onboarding';

const AuthCallback = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { login } = useAuth();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [hasBankConnection, setHasBankConnection] = useState(false);

  useEffect(() => {
    const token = searchParams.get('token');
    const success = searchParams.get('success');

    if (success === 'true' && token) {
      // Store token
      localStorage.setItem('token', token);

      // Fetch user info to store in context
      fetchUserInfo(token);
    } else {
      setError('Authentication failed');
      setLoading(false);
      setTimeout(() => navigate('/login'), 3000);
    }
  }, [searchParams, navigate]);

  const fetchUserInfo = async (token) => {
    try {
      // Fetch user info from /api/auth/me endpoint
      const response = await api.get('/auth/me');
      
      if (response.data.success && response.data.user) {
        // Store user info
        localStorage.setItem('user', JSON.stringify(response.data.user));
        
        // Trigger a custom event to notify AuthContext
        window.dispatchEvent(new Event('userUpdated'));
        
        // Check if user has bank connection
        checkBankConnection();
      } else {
        throw new Error('Invalid response');
      }
    } catch (error) {
      console.error('Error verifying token:', error);
      setError('Failed to verify authentication');
      setLoading(false);
      setTimeout(() => navigate('/login'), 3000);
    }
  };

  const checkBankConnection = async () => {
    try {
      const response = await bankAPI.getStatus();
      if (response.data.success && response.data.connected) {
        setHasBankConnection(true);
        // User has bank connection, go directly to dashboard
        setTimeout(() => {
          navigate('/dashboard');
        }, 100);
      } else {
        // No bank connection, show onboarding
        setShowOnboarding(true);
        setLoading(false);
      }
    } catch (error) {
      console.error('Error checking bank connection:', error);
      // If error, still show onboarding (user can skip)
      setShowOnboarding(true);
      setLoading(false);
    }
  };

  const handleOnboardingComplete = () => {
    setShowOnboarding(false);
    navigate('/dashboard');
  };

  if (loading && !showOnboarding) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Completing authentication...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
        <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 text-center">
          <div className="text-red-600 mb-4">
            <svg className="mx-auto h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Authentication Failed</h2>
          <p className="text-gray-600 dark:text-gray-400 mb-4">{error}</p>
          <p className="text-sm text-gray-500 dark:text-gray-400">Redirecting to login...</p>
        </div>
      </div>
    );
  }

  if (showOnboarding) {
    return <Onboarding onComplete={handleOnboardingComplete} />;
  }

  return null;
};

export default AuthCallback;

