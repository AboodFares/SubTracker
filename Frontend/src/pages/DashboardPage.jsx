import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { subscriptionsAPI } from '../services/api';
import { differenceInDays, format } from 'date-fns';
import { getLogoUrl } from '../utils/brandLogo';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

const CHART_COLORS = ['#6366f1', '#8b5cf6', '#a855f7', '#d946ef', '#ec4899', '#f43f5e', '#f97316', '#eab308', '#22c55e', '#14b8a6'];

const DashboardPage = () => {
  const [subscriptions, setSubscriptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [recentChanges, setRecentChanges] = useState({});
  const prevSubsRef = useRef(null);

  useEffect(() => {
    const init = async () => {
      // Fetch current subs first
      try {
        const response = await subscriptionsAPI.getAll();
        const currentSubs = response.data.subscriptions || [];
        prevSubsRef.current = currentSubs.map(s => ({ id: s._id, status: s.status, updatedAt: s.updatedAt }));
        setSubscriptions(currentSubs);
      } catch (err) {
        console.error('Error fetching subscriptions:', err);
      }

      // Process emails silently
      try {
        const response = await subscriptionsAPI.processEmails(50);
        const stats = response.data.stats;
        const hasChanges = stats && (stats.created > 0 || stats.updated > 0 || stats.cancelled > 0);

        if (hasChanges) {
          // Refetch and diff
          const newResponse = await subscriptionsAPI.getAll();
          const newSubs = newResponse.data.subscriptions || [];
          const prev = prevSubsRef.current || [];
          const prevIds = new Set(prev.map(s => s.id));
          const changes = {};

          for (const sub of newSubs) {
            if (!prevIds.has(sub._id)) {
              changes[sub._id] = 'new';
            } else {
              const old = prev.find(p => p.id === sub._id);
              if (old && old.status !== 'cancelled' && sub.status === 'cancelled') {
                changes[sub._id] = 'cancelled';
              } else if (old && old.updatedAt !== sub.updatedAt) {
                changes[sub._id] = 'updated';
              }
            }
          }

          setRecentChanges(changes);
          setSubscriptions(newSubs);

          // Clear badges after 30 seconds
          setTimeout(() => setRecentChanges({}), 30000);
        }
      } catch (err) {
        console.error('Error processing emails:', err);
        setError(err.response?.data?.message || '');
      } finally {
        setLoading(false);
      }
    };
    init();
  }, []);

  const activeSubscriptions = subscriptions.filter(s => s.status === 'active');
  const totalMonthly = activeSubscriptions.reduce((sum, sub) => sum + (sub.price || 0), 0);
  const totalYearly = totalMonthly * 12;

  const upcomingRenewals = activeSubscriptions.filter(sub => {
    if (!sub.nextRenewalDate) return false;
    const daysUntil = differenceInDays(new Date(sub.nextRenewalDate), new Date());
    return daysUntil >= 0 && daysUntil <= 30;
  }).sort((a, b) => new Date(a.nextRenewalDate) - new Date(b.nextRenewalDate));

  // Chart data — spending by subscription
  const chartData = activeSubscriptions
    .filter(s => s.price > 0)
    .sort((a, b) => b.price - a.price)
    .slice(0, 8)
    .map(s => ({ name: s.companyName, value: s.price }));

  const formatCurrency = (amount, currency = 'USD') => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || 'USD',
    }).format(amount);
  };

  const formatDate = (date) => {
    if (!date) return '—';
    return format(new Date(date), 'MMM d, yyyy');
  };

  const getBadge = (sub) => {
    const change = recentChanges[sub._id];
    if (change === 'new') return <span className="ml-2 text-[10px] font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 px-1.5 py-0.5 rounded">New</span>;
    if (change === 'updated') return <span className="ml-2 text-[10px] font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-1.5 py-0.5 rounded">Updated</span>;
    if (change === 'cancelled') return <span className="ml-2 text-[10px] font-semibold uppercase tracking-wide text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30 px-1.5 py-0.5 rounded">Cancelled</span>;
    return null;
  };

  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white dark:bg-gray-800 px-3 py-2 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 text-sm">
          <span className="font-medium text-gray-900 dark:text-white">{payload[0].name}</span>
          <span className="ml-2 text-gray-500 dark:text-gray-400">{formatCurrency(payload[0].value)}</span>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Dashboard</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Overview of your subscriptions</p>
      </div>

      {error && (
        <div className="text-sm text-red-500 dark:text-red-400">{error}</div>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="flex items-center gap-3 text-sm text-gray-500 dark:text-gray-400">
            <svg className="animate-spin h-5 w-5 text-indigo-500" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Syncing subscriptions...
          </div>
        </div>
      ) : (
        <>
          {/* Stats Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white dark:bg-gray-900 rounded-xl p-5 border border-gray-200/60 dark:border-gray-800/60">
              <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Total</div>
              <div className="text-2xl font-bold text-gray-900 dark:text-white">{subscriptions.length}</div>
            </div>
            <div className="bg-white dark:bg-gray-900 rounded-xl p-5 border border-gray-200/60 dark:border-gray-800/60">
              <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Active</div>
              <div className="text-2xl font-bold text-gray-900 dark:text-white">{activeSubscriptions.length}</div>
            </div>
            <div className="bg-white dark:bg-gray-900 rounded-xl p-5 border border-gray-200/60 dark:border-gray-800/60">
              <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Monthly</div>
              <div className="text-2xl font-bold text-gray-900 dark:text-white">{formatCurrency(totalMonthly)}</div>
              <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{formatCurrency(totalYearly)}/yr</div>
            </div>
            <div className="bg-white dark:bg-gray-900 rounded-xl p-5 border border-gray-200/60 dark:border-gray-800/60">
              <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Renewals</div>
              <div className="text-2xl font-bold text-gray-900 dark:text-white">{upcomingRenewals.length}</div>
              <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Next 30 days</div>
            </div>
          </div>

          {/* Chart + Table row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Spending Chart */}
            {chartData.length > 0 && (
              <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200/60 dark:border-gray-800/60 p-5">
                <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Spending Breakdown</h2>
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={chartData}
                        cx="50%"
                        cy="50%"
                        innerRadius={45}
                        outerRadius={75}
                        paddingAngle={2}
                        dataKey="value"
                      >
                        {chartData.map((_, i) => (
                          <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip content={<CustomTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-3 space-y-1.5">
                  {chartData.map((item, i) => (
                    <div key={item.name} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                        <span className="text-gray-600 dark:text-gray-400">{item.name}</span>
                      </div>
                      <span className="text-gray-900 dark:text-white font-medium">{formatCurrency(item.value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Subscriptions Table */}
            <div className={`bg-white dark:bg-gray-900 rounded-xl border border-gray-200/60 dark:border-gray-800/60 overflow-hidden ${chartData.length > 0 ? 'lg:col-span-2' : 'lg:col-span-3'}`}>
              <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Subscriptions</h2>
                <Link
                  to="/app/subscriptions"
                  className="text-xs text-gray-400 hover:text-indigo-500 dark:hover:text-indigo-400 transition-colors"
                >
                  View all &rarr;
                </Link>
              </div>

              {subscriptions.length === 0 ? (
                <div className="px-5 py-12 text-center text-sm text-gray-400">
                  No subscriptions found yet. Connect your Gmail or upload a bank statement to get started.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 dark:border-gray-800">
                        <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Service</th>
                        <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide hidden sm:table-cell">Start Date</th>
                        <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide hidden md:table-cell">Next Renewal</th>
                        <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide hidden sm:table-cell">Frequency</th>
                        <th className="text-right px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Price</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50 dark:divide-gray-800/50">
                      {activeSubscriptions.slice(0, 10).map((sub) => (
                        <tr key={sub._id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors">
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-2.5">
                              <img
                                src={getLogoUrl(sub.companyName)}
                                alt={sub.companyName}
                                onError={(e) => {
                                  e.target.style.display = 'none';
                                  e.target.nextSibling.style.display = 'flex';
                                }}
                                className="w-7 h-7 rounded-md flex-shrink-0 object-contain bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700"
                              />
                              <div className="w-7 h-7 bg-gray-100 dark:bg-gray-800 rounded-md items-center justify-center flex-shrink-0 hidden">
                                <span className="text-gray-500 text-[10px] font-bold">{sub.companyName.charAt(0)}</span>
                              </div>
                              <span className="font-medium text-gray-900 dark:text-white whitespace-nowrap">
                                {sub.companyName}
                                {getBadge(sub)}
                              </span>
                            </div>
                          </td>
                          <td className="px-5 py-3 text-gray-500 dark:text-gray-400 whitespace-nowrap hidden sm:table-cell">
                            {formatDate(sub.startDate)}
                          </td>
                          <td className="px-5 py-3 text-gray-500 dark:text-gray-400 whitespace-nowrap hidden md:table-cell">
                            {formatDate(sub.nextRenewalDate)}
                          </td>
                          <td className="px-5 py-3 text-gray-500 dark:text-gray-400 capitalize hidden sm:table-cell">
                            {sub.frequency || '—'}
                          </td>
                          <td className="px-5 py-3 text-right font-medium text-gray-900 dark:text-white whitespace-nowrap">
                            {formatCurrency(sub.price, sub.currency)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default DashboardPage;
