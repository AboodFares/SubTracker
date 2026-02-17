import { useState, useEffect, useRef } from 'react';
import { subscriptionsAPI } from '../services/api';
import SubscriptionList from '../components/SubscriptionList';

const SubscriptionsPage = () => {
  const [subscriptions, setSubscriptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [error, setError] = useState('');
  const [recentChanges, setRecentChanges] = useState({});
  const prevSubsRef = useRef(null);
  const emailsProcessed = useRef(false);

  useEffect(() => {
    fetchSubscriptions();
  }, [filter]);

  // Process emails once on mount
  useEffect(() => {
    if (emailsProcessed.current) return;
    emailsProcessed.current = true;

    const processEmails = async () => {
      try {
        // Snapshot current subs before processing
        const preResponse = await subscriptionsAPI.getAll();
        const preSubs = preResponse.data.subscriptions || [];
        prevSubsRef.current = preSubs.map(s => ({ id: s._id, status: s.status, updatedAt: s.updatedAt }));

        const response = await subscriptionsAPI.processEmails(50);
        const stats = response.data.stats;
        const hasChanges = stats && (stats.created > 0 || stats.updated > 0 || stats.cancelled > 0);

        if (hasChanges) {
          const status = filter === 'all' ? null : filter;
          const newResponse = await subscriptionsAPI.getAll(status);
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
          setTimeout(() => setRecentChanges({}), 30000);
        }
      } catch (err) {
        console.error('Error processing emails:', err);
      }
    };

    processEmails();
  }, []);

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

  const activeCount = subscriptions.filter(s => s.status === 'active').length;
  const cancelledCount = subscriptions.filter(s => s.status === 'cancelled').length;

  return (
    <div className="space-y-6">
      {/* Page header + filter */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Subscriptions</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {subscriptions.length} subscription{subscriptions.length !== 1 ? 's' : ''}
          </p>
        </div>

        <div className="flex bg-white/90 dark:bg-gray-900/90 backdrop-blur-xl rounded-xl p-1 shadow-md border border-gray-200/60 dark:border-gray-800/60">
          {[
            { key: 'all', label: 'All', count: subscriptions.length },
            { key: 'active', label: 'Active', count: activeCount },
            { key: 'cancelled', label: 'Cancelled', count: cancelledCount },
          ].map((item) => (
            <button
              key={item.key}
              onClick={() => setFilter(item.key)}
              className={`px-4 py-2 text-xs font-bold rounded-lg transition-all duration-200 ${
                filter === item.key
                  ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-md'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
            >
              {item.label} ({item.count})
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl">
          <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-10 w-10 border-4 border-indigo-200 border-t-indigo-600"></div>
        </div>
      ) : (
        <SubscriptionList subscriptions={subscriptions} onRefresh={fetchSubscriptions} recentChanges={recentChanges} />
      )}
    </div>
  );
};

export default SubscriptionsPage;
