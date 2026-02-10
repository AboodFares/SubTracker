import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { subscriptionsAPI } from '../services/api';
import { differenceInDays } from 'date-fns';
import { getLogoUrl } from '../utils/brandLogo';

const DashboardPage = () => {
  const [subscriptions, setSubscriptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [processStats, setProcessStats] = useState(null);
  const [error, setError] = useState('');
  const [emailsProcessed, setEmailsProcessed] = useState(false);

  useEffect(() => {
    const autoProcessEmails = async () => {
      if (emailsProcessed) return;
      try {
        setProcessing(true);
        setError('');
        setProcessStats(null);
        const response = await subscriptionsAPI.processEmails(50);
        setProcessStats(response.data.stats);
        setEmailsProcessed(true);
        await fetchSubscriptions();
      } catch (error) {
        console.error('Error processing emails:', error);
        const errorMessage = error.response?.data?.message || 'Failed to process emails';
        setError(errorMessage);
        await fetchSubscriptions();
      } finally {
        setProcessing(false);
      }
    };
    autoProcessEmails();
  }, []);

  const fetchSubscriptions = async () => {
    try {
      setLoading(true);
      const response = await subscriptionsAPI.getAll();
      setSubscriptions(response.data.subscriptions || []);
    } catch (error) {
      console.error('Error fetching subscriptions:', error);
    } finally {
      setLoading(false);
    }
  };

  const activeSubscriptions = subscriptions.filter(s => s.status === 'active');
  const totalMonthly = activeSubscriptions.reduce((sum, sub) => sum + (sub.price || 0), 0);
  const totalYearly = totalMonthly * 12;

  const upcomingRenewals = activeSubscriptions.filter(sub => {
    if (!sub.nextRenewalDate) return false;
    const daysUntil = differenceInDays(new Date(sub.nextRenewalDate), new Date());
    return daysUntil >= 0 && daysUntil <= 30;
  }).sort((a, b) => new Date(a.nextRenewalDate) - new Date(b.nextRenewalDate));

  const urgentRenewals = activeSubscriptions.filter(sub => {
    if (!sub.nextRenewalDate) return false;
    const daysUntil = differenceInDays(new Date(sub.nextRenewalDate), new Date());
    return daysUntil >= 0 && daysUntil <= 5;
  }).sort((a, b) => new Date(a.nextRenewalDate) - new Date(b.nextRenewalDate));

  const formatCurrency = (amount, currency = 'USD') => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || 'USD',
    }).format(amount);
  };

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Dashboard</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Overview of your subscriptions</p>
      </div>

      {/* Email Processing Status */}
      {processing && (
        <div className="bg-white/90 dark:bg-gray-900/90 backdrop-blur-xl rounded-2xl shadow-lg p-6 border border-gray-200/60 dark:border-gray-800/60">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg flex-shrink-0">
              <svg className="animate-spin h-6 w-6 text-white" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            </div>
            <div>
              <h3 className="text-base font-bold text-gray-900 dark:text-white">Scanning Emails</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Checking your Gmail for subscription emails...
              </p>
            </div>
          </div>
        </div>
      )}

      {processStats && (
        <div className="bg-white/90 dark:bg-gray-900/90 backdrop-blur-xl rounded-2xl shadow-lg p-6 border border-green-200/60 dark:border-green-800/60">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl flex items-center justify-center shadow-lg">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 className="font-bold text-green-800 dark:text-green-300">Email Scan Complete</h3>
          </div>
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: 'Processed', value: processStats.processed },
              { label: 'Created', value: processStats.created },
              { label: 'Updated', value: processStats.updated },
              { label: 'Cancelled', value: processStats.cancelled },
            ].map((stat) => (
              <div key={stat.label} className="bg-green-50 dark:bg-green-900/20 rounded-xl p-3 text-center">
                <div className="text-2xl font-bold text-green-800 dark:text-green-300">{stat.value}</div>
                <div className="text-xs font-medium text-green-600 dark:text-green-400">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {error && (
        <div className="bg-white/90 dark:bg-gray-900/90 backdrop-blur-xl rounded-2xl shadow-lg p-6 border border-red-200/60 dark:border-red-800/60">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div className="flex-1">
              <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
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
                className="mt-2 px-3 py-1.5 text-xs font-medium bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
              >
                Retry
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Urgent Renewal Alert — 5 days or less */}
      {!loading && urgentRenewals.length > 0 && (
        <div className="bg-gradient-to-r from-red-50 to-orange-50 dark:from-red-950/40 dark:to-orange-950/40 rounded-2xl shadow-lg border border-red-200 dark:border-red-800/60 p-5">
          <div className="flex items-start gap-3 mb-4">
            <div className="w-10 h-10 bg-gradient-to-br from-red-500 to-orange-500 rounded-xl flex items-center justify-center shadow-lg flex-shrink-0">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
            </div>
            <div>
              <h3 className="text-sm font-bold text-red-800 dark:text-red-300">
                {urgentRenewals.length === 1
                  ? '1 subscription renewing soon!'
                  : `${urgentRenewals.length} subscriptions renewing soon!`}
              </h3>
              <p className="text-xs text-red-600/70 dark:text-red-400/70 mt-0.5">Within the next 5 days</p>
            </div>
          </div>
          <div className="space-y-2">
            {urgentRenewals.map((sub) => {
              const daysUntil = differenceInDays(new Date(sub.nextRenewalDate), new Date());
              return (
                <div key={sub._id} className="flex items-center justify-between bg-white/70 dark:bg-gray-900/50 rounded-xl px-4 py-3">
                  <div className="flex items-center gap-3">
                    <img
                      src={getLogoUrl(sub.companyName)}
                      alt={sub.companyName}
                      onError={(e) => {
                        e.target.style.display = 'none';
                        e.target.nextSibling.style.display = 'flex';
                      }}
                      className="w-8 h-8 rounded-lg flex-shrink-0 object-contain bg-white border border-gray-200 dark:border-gray-700"
                    />
                    <div className="w-8 h-8 bg-gradient-to-br from-red-400 to-orange-500 rounded-lg items-center justify-center flex-shrink-0 hidden">
                      <span className="text-white text-xs font-bold">{sub.companyName.charAt(0)}</span>
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-gray-900 dark:text-white">{sub.companyName}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">{formatCurrency(sub.price, sub.currency)}</div>
                    </div>
                  </div>
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-lg ${
                    daysUntil === 0
                      ? 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300'
                      : daysUntil === 1
                        ? 'bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300'
                        : 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300'
                  }`}>
                    {daysUntil === 0 ? 'Today' : daysUntil === 1 ? 'Tomorrow' : `${daysUntil} days`}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Stats Cards */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-10 w-10 border-4 border-indigo-200 border-t-indigo-600"></div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white/90 dark:bg-gray-900/90 backdrop-blur-xl rounded-2xl shadow-lg p-5 border border-gray-200/60 dark:border-gray-800/60">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Total</div>
                  <div className="text-3xl font-bold text-gray-900 dark:text-white">{subscriptions.length}</div>
                </div>
                <div className="w-11 h-11 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center shadow-lg">
                  <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
              </div>
            </div>

            <div className="bg-white/90 dark:bg-gray-900/90 backdrop-blur-xl rounded-2xl shadow-lg p-5 border border-gray-200/60 dark:border-gray-800/60">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Active</div>
                  <div className="text-3xl font-bold text-green-600 dark:text-green-400">{activeSubscriptions.length}</div>
                </div>
                <div className="w-11 h-11 bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl flex items-center justify-center shadow-lg">
                  <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
              </div>
            </div>

            <div className="bg-white/90 dark:bg-gray-900/90 backdrop-blur-xl rounded-2xl shadow-lg p-5 border border-gray-200/60 dark:border-gray-800/60">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Monthly</div>
                  <div className="text-3xl font-bold text-indigo-600 dark:text-indigo-400">${totalMonthly.toFixed(2)}</div>
                  <div className="text-xs text-gray-400 dark:text-gray-500">${totalYearly.toFixed(2)}/yr</div>
                </div>
                <div className="w-11 h-11 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg">
                  <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
              </div>
            </div>

            <div className="bg-white/90 dark:bg-gray-900/90 backdrop-blur-xl rounded-2xl shadow-lg p-5 border border-gray-200/60 dark:border-gray-800/60">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Renewals</div>
                  <div className="text-3xl font-bold text-orange-600 dark:text-orange-400">{upcomingRenewals.length}</div>
                  <div className="text-xs text-gray-400 dark:text-gray-500">Next 30 days</div>
                </div>
                <div className="w-11 h-11 bg-gradient-to-br from-orange-500 to-amber-600 rounded-xl flex items-center justify-center shadow-lg">
                  <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
              </div>
            </div>
          </div>

          {/* Upcoming Renewals */}
          {upcomingRenewals.length > 0 && (
            <div className="bg-white/90 dark:bg-gray-900/90 backdrop-blur-xl rounded-2xl shadow-lg border border-orange-200/60 dark:border-orange-800/40 overflow-hidden">
              <div className="px-6 py-4 border-b border-orange-100 dark:border-orange-900/30">
                <h2 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  <svg className="w-5 h-5 text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  Upcoming Renewals
                </h2>
              </div>
              <div className="divide-y divide-gray-100 dark:divide-gray-800">
                {upcomingRenewals.slice(0, 5).map((sub) => {
                  const daysUntil = differenceInDays(new Date(sub.nextRenewalDate), new Date());
                  return (
                    <div key={sub._id} className="px-6 py-4 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <img
                          src={getLogoUrl(sub.companyName)}
                          alt={sub.companyName}
                          onError={(e) => {
                            e.target.style.display = 'none';
                            e.target.nextSibling.style.display = 'flex';
                          }}
                          className="w-9 h-9 rounded-lg flex-shrink-0 object-contain bg-white border border-gray-200 dark:border-gray-700"
                        />
                        <div className="w-9 h-9 bg-gradient-to-br from-orange-400 to-amber-500 rounded-lg items-center justify-center flex-shrink-0 hidden">
                          <span className="text-white text-xs font-bold">{sub.companyName.charAt(0)}</span>
                        </div>
                        <div>
                          <div className="text-sm font-semibold text-gray-900 dark:text-white">{sub.companyName}</div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            {formatCurrency(sub.price, sub.currency)}
                          </div>
                        </div>
                      </div>
                      <span className={`text-sm font-bold ${
                        daysUntil === 0 ? 'text-red-600 dark:text-red-400' :
                        daysUntil <= 3 ? 'text-orange-600 dark:text-orange-400' :
                        'text-gray-600 dark:text-gray-400'
                      }`}>
                        {daysUntil === 0 ? 'Today' : daysUntil === 1 ? 'Tomorrow' : `${daysUntil} days`}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Quick link to subscriptions */}
          {subscriptions.length > 0 && (
            <div className="text-center">
              <Link
                to="/app/subscriptions"
                className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-xl transition-all"
              >
                View all subscriptions
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default DashboardPage;
