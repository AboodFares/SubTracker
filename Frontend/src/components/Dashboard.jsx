import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { subscriptionsAPI } from '../services/api';
import SubscriptionList from './SubscriptionList';
import BankConnection from './BankConnection';
import Footer from './Footer';
import { format, differenceInDays, isAfter } from 'date-fns';

const Dashboard = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [subscriptions, setSubscriptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [processStats, setProcessStats] = useState(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all'); // all, active, cancelled
  const [viewMode, setViewMode] = useState('table'); // table, card
  const [emailsProcessed, setEmailsProcessed] = useState(false);
  const [activeTab, setActiveTab] = useState('subscriptions'); // subscriptions, bank

  // Auto-process emails on component mount (after login)
  useEffect(() => {
    const autoProcessEmails = async () => {
      // Only process once per session
      if (emailsProcessed) return;
      
      try {
        setProcessing(true);
        setError('');
        setProcessStats(null);

        const response = await subscriptionsAPI.processEmails(50);
        setProcessStats(response.data.stats);
        setEmailsProcessed(true);
        
        // Refresh subscriptions after processing
        await fetchSubscriptions();
      } catch (error) {
        console.error('Error processing emails:', error);
        const errorMessage = error.response?.data?.message || 'Failed to process emails';
        setError(errorMessage);
        // Still fetch subscriptions even if email processing failed
        // (in case subscriptions were created previously or manually)
        await fetchSubscriptions();
      } finally {
        setProcessing(false);
      }
    };

    // Process emails automatically when dashboard loads
    autoProcessEmails();
  }, []); // Only run once on mount

  useEffect(() => {
    // Always fetch subscriptions when filter changes
    fetchSubscriptions();
  }, [filter]);


  const fetchSubscriptions = async () => {
    try {
      setLoading(true);
      const status = filter === 'all' ? null : filter;
      const response = await subscriptionsAPI.getAll(status);
      setSubscriptions(response.data.subscriptions || []);
      setError('');
    } catch (error) {
      console.error('Error fetching subscriptions:', error);
      setError('Failed to load subscriptions');
    } finally {
      setLoading(false);
    }
  };


  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  // Calculate statistics
  const activeSubscriptions = subscriptions.filter(s => s.status === 'active');
  const cancelledSubscriptions = subscriptions.filter(s => s.status === 'cancelled');
  
  const totalMonthly = activeSubscriptions.reduce((sum, sub) => {
    // Convert all to USD for now (simplified)
    return sum + (sub.price || 0);
  }, 0);

  const totalYearly = totalMonthly * 12;

  // Find upcoming renewals (next 30 days)
  const upcomingRenewals = activeSubscriptions.filter(sub => {
    if (!sub.nextRenewalDate) return false;
    const renewalDate = new Date(sub.nextRenewalDate);
    const daysUntil = differenceInDays(renewalDate, new Date());
    return daysUntil >= 0 && daysUntil <= 30;
  }).sort((a, b) => {
    return new Date(a.nextRenewalDate) - new Date(b.nextRenewalDate);
  });

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950 transition-colors">
      {/* Header */}
      <header className="bg-white/90 dark:bg-gray-900/90 backdrop-blur-xl shadow-lg border-b border-gray-200/60 dark:border-gray-800/60 sticky top-0 z-50 transition-all">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5">
          <div className="flex justify-between items-center">
            <Link to="/" className="flex items-center gap-4 group">
              <div className="w-12 h-12 bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-600 rounded-xl flex items-center justify-center shadow-lg transform group-hover:scale-105 transition-transform">
                <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <div>
                <h1 className="text-2xl font-extrabold bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 bg-clip-text text-transparent">
                  Subscription Tracker
                </h1>
                <p className="text-sm text-gray-600 dark:text-gray-400 font-medium">Welcome back, {user?.name || user?.email}</p>
              </div>
            </Link>
            <div className="flex items-center gap-3">
              <button
                onClick={handleLogout}
                className="px-5 py-2.5 text-sm font-semibold text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-all duration-200 flex items-center gap-2 border border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="group bg-white/90 dark:bg-gray-900/90 backdrop-blur-xl rounded-2xl shadow-xl p-6 border border-gray-200/60 dark:border-gray-800/60 hover:shadow-2xl hover:-translate-y-1 transition-all duration-300 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-blue-200/20 dark:bg-blue-500/10 rounded-full -mr-16 -mt-16 blur-2xl"></div>
            <div className="relative flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wide">Total Subscriptions</div>
                <div className="text-4xl font-extrabold text-gray-900 dark:text-white">{subscriptions.length}</div>
              </div>
              <div className="w-14 h-14 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
            </div>
          </div>
          
          <div className="group bg-white/90 dark:bg-gray-900/90 backdrop-blur-xl rounded-2xl shadow-xl p-6 border border-gray-200/60 dark:border-gray-800/60 hover:shadow-2xl hover:-translate-y-1 transition-all duration-300 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-green-200/20 dark:bg-green-500/10 rounded-full -mr-16 -mt-16 blur-2xl"></div>
            <div className="relative flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wide">Active</div>
                <div className="text-4xl font-extrabold text-green-600 dark:text-green-400">
                  {activeSubscriptions.length}
                </div>
              </div>
              <div className="w-14 h-14 bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
          </div>
          
          <div className="group bg-white/90 dark:bg-gray-900/90 backdrop-blur-xl rounded-2xl shadow-xl p-6 border border-gray-200/60 dark:border-gray-800/60 hover:shadow-2xl hover:-translate-y-1 transition-all duration-300 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-200/20 dark:bg-indigo-500/10 rounded-full -mr-16 -mt-16 blur-2xl"></div>
            <div className="relative flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wide">Monthly Total</div>
                <div className="text-4xl font-extrabold text-indigo-600 dark:text-indigo-400">
                  ${totalMonthly.toFixed(2)}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 font-medium">${totalYearly.toFixed(2)}/year</div>
              </div>
              <div className="w-14 h-14 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
          </div>

          <div className="group bg-white/90 dark:bg-gray-900/90 backdrop-blur-xl rounded-2xl shadow-xl p-6 border border-gray-200/60 dark:border-gray-800/60 hover:shadow-2xl hover:-translate-y-1 transition-all duration-300 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-orange-200/20 dark:bg-orange-500/10 rounded-full -mr-16 -mt-16 blur-2xl"></div>
            <div className="relative flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wide">Upcoming Renewals</div>
                <div className="text-4xl font-extrabold text-orange-600 dark:text-orange-400">
                  {upcomingRenewals.length}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 font-medium">Next 30 days</div>
              </div>
              <div className="w-14 h-14 bg-gradient-to-br from-orange-500 to-amber-600 rounded-xl flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
            </div>
          </div>
        </div>

        {/* Upcoming Renewals Alert */}
        {upcomingRenewals.length > 0 && (
          <div className="bg-gradient-to-r from-orange-50 via-amber-50 to-yellow-50 dark:from-orange-900/20 dark:via-amber-900/20 dark:to-yellow-900/20 border-2 border-orange-200 dark:border-orange-800 rounded-2xl p-8 mb-8 shadow-xl">
            <div className="flex items-start gap-6">
              <div className="w-16 h-16 bg-gradient-to-br from-orange-500 to-amber-600 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-lg">
                <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div className="flex-1">
                <h3 className="text-2xl font-extrabold text-orange-900 dark:text-orange-300 mb-4">Upcoming Renewals</h3>
                <div className="space-y-3">
                  {upcomingRenewals.slice(0, 3).map((sub) => {
                    const daysUntil = differenceInDays(new Date(sub.nextRenewalDate), new Date());
                    return (
                      <div key={sub._id} className="flex items-center justify-between bg-white/60 dark:bg-gray-800/60 rounded-xl p-4 border border-orange-200/50 dark:border-orange-800/50 shadow-md">
                        <span className="text-orange-900 dark:text-orange-300 font-bold text-base">{sub.companyName}</span>
                        <span className="text-orange-700 dark:text-orange-400 font-extrabold text-base">
                          {daysUntil === 0 ? 'Today' : `${daysUntil} day${daysUntil !== 1 ? 's' : ''}`}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Auto-Processing Status */}
        {processing && (
          <div className="bg-white/90 dark:bg-gray-900/90 backdrop-blur-xl rounded-2xl shadow-xl p-8 mb-8 border border-gray-200/60 dark:border-gray-800/60">
            <div className="flex items-center gap-6">
              <div className="flex-shrink-0">
                <div className="w-16 h-16 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center shadow-lg">
                  <svg className="animate-spin h-8 w-8 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                </div>
              </div>
              <div className="flex-1">
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Processing Your Emails</h3>
                <p className="text-base text-gray-600 dark:text-gray-400">
                  Scanning your Gmail inbox for subscription emails. This may take a moment...
                </p>
              </div>
            </div>
          </div>
        )}

          {processStats && (
            <div className="mt-6 p-8 bg-gradient-to-r from-green-50 via-emerald-50 to-teal-50 dark:from-green-900/20 dark:via-emerald-900/20 dark:to-teal-900/20 border-2 border-green-200 dark:border-green-800 rounded-2xl shadow-xl">
              <div className="flex items-center gap-4 mb-6">
                <div className="w-16 h-16 bg-gradient-to-br from-green-500 to-emerald-600 rounded-2xl flex items-center justify-center shadow-lg">
                  <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h3 className="font-extrabold text-green-900 dark:text-green-300 text-2xl">Processing Complete!</h3>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-white/80 dark:bg-gray-800/80 rounded-xl p-4 shadow-lg border border-green-200/50 dark:border-green-800/50">
                  <div className="text-xs font-bold text-green-700 dark:text-green-400 mb-2 uppercase tracking-wide">Processed</div>
                  <div className="text-3xl font-extrabold text-green-900 dark:text-green-300">{processStats.processed}</div>
                </div>
                <div className="bg-white/80 dark:bg-gray-800/80 rounded-xl p-4 shadow-lg border border-green-200/50 dark:border-green-800/50">
                  <div className="text-xs font-bold text-green-700 dark:text-green-400 mb-2 uppercase tracking-wide">Created</div>
                  <div className="text-3xl font-extrabold text-green-900 dark:text-green-300">{processStats.created}</div>
                </div>
                <div className="bg-white/80 dark:bg-gray-800/80 rounded-xl p-4 shadow-lg border border-green-200/50 dark:border-green-800/50">
                  <div className="text-xs font-bold text-green-700 dark:text-green-400 mb-2 uppercase tracking-wide">Updated</div>
                  <div className="text-3xl font-extrabold text-green-900 dark:text-green-300">{processStats.updated}</div>
                </div>
                <div className="bg-white/80 dark:bg-gray-800/80 rounded-xl p-4 shadow-lg border border-green-200/50 dark:border-green-800/50">
                  <div className="text-xs font-bold text-green-700 dark:text-green-400 mb-2 uppercase tracking-wide">Cancelled</div>
                  <div className="text-3xl font-extrabold text-green-900 dark:text-green-300">{processStats.cancelled}</div>
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="mt-6 p-6 bg-red-50 dark:bg-red-900/20 border-2 border-red-200 dark:border-red-800 rounded-2xl shadow-xl">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0">
                  <svg className="w-6 h-6 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h3 className="font-bold text-red-900 dark:text-red-300 mb-2">Error Processing Emails</h3>
                  <p className="text-red-700 dark:text-red-400 mb-4">{error}</p>
                  <button
                    onClick={async () => {
                      setError('');
                      setEmailsProcessed(false);
                      setProcessing(true);
                      try {
                        const response = await subscriptionsAPI.processEmails(50);
                        setProcessStats(response.data.stats);
                        setEmailsProcessed(true);
                        await fetchSubscriptions();
                      } catch (err) {
                        setError(err.response?.data?.message || 'Failed to process emails');
                      } finally {
                        setProcessing(false);
                      }
                    }}
                    className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors"
                  >
                    Retry Email Processing
                  </button>
                </div>
              </div>
            </div>
          )}

        {/* Filter and View Toggle */}
        <div className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex space-x-2 bg-white/90 dark:bg-gray-900/90 backdrop-blur-xl rounded-xl p-1.5 shadow-lg border border-gray-200/60 dark:border-gray-800/60">
            <button
              onClick={() => setFilter('all')}
              className={`px-5 py-2.5 font-bold text-sm rounded-lg transition-all duration-200 ${
                filter === 'all'
                  ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-lg scale-105'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
            >
              All ({subscriptions.length})
            </button>
            <button
              onClick={() => setFilter('active')}
              className={`px-5 py-2.5 font-bold text-sm rounded-lg transition-all duration-200 ${
                filter === 'active'
                  ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-lg scale-105'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
            >
              Active ({activeSubscriptions.length})
            </button>
            <button
              onClick={() => setFilter('cancelled')}
              className={`px-5 py-2.5 font-bold text-sm rounded-lg transition-all duration-200 ${
                filter === 'cancelled'
                  ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-lg scale-105'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
            >
              Cancelled ({cancelledSubscriptions.length})
            </button>
          </div>

          <div className="flex items-center gap-2 bg-white/90 dark:bg-gray-900/90 backdrop-blur-xl rounded-xl p-1.5 shadow-lg border border-gray-200/60 dark:border-gray-800/60">
            <button
              onClick={() => setViewMode('table')}
              className={`p-3 rounded-lg transition-all duration-200 ${
                viewMode === 'table'
                  ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-lg scale-105'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
              title="Table View"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </button>
            <button
              onClick={() => setViewMode('card')}
              className={`p-3 rounded-lg transition-all duration-200 ${
                viewMode === 'card'
                  ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-lg scale-105'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
              title="Card View"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
              </svg>
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="mb-6 bg-white/90 dark:bg-gray-900/90 backdrop-blur-xl rounded-2xl p-1.5 shadow-lg border border-gray-200/60 dark:border-gray-800/60">
          <div className="flex space-x-2">
            <button
              onClick={() => setActiveTab('subscriptions')}
              className={`flex-1 px-6 py-3 text-sm font-bold rounded-xl transition-all duration-200 ${
                activeTab === 'subscriptions'
                  ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-lg scale-105'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
            >
              Subscriptions
            </button>
            <button
              onClick={() => setActiveTab('bank')}
              className={`flex-1 px-6 py-3 text-sm font-bold rounded-xl transition-all duration-200 ${
                activeTab === 'bank'
                  ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-lg scale-105'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
            >
              Bank Account
            </button>
          </div>
        </div>

        {/* Tab Content */}
        {activeTab === 'subscriptions' && (
          <>
            {loading ? (
              <div className="text-center py-12 bg-white/80 backdrop-blur-lg rounded-xl shadow-lg border border-gray-200/50">
                <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-indigo-200 border-t-indigo-600"></div>
                <p className="mt-4 text-gray-600 font-medium">Loading subscriptions...</p>
              </div>
            ) : (
              <SubscriptionList 
                subscriptions={subscriptions} 
                onRefresh={fetchSubscriptions}
                viewMode={viewMode}
              />
            )}
          </>
        )}

        {activeTab === 'bank' && (
          <BankConnection />
        )}
      </main>
      <Footer />
    </div>
  );
};

export default Dashboard;

