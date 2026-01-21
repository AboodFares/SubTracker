import { format, differenceInDays, isAfter } from 'date-fns';

const formatDate = (dateString) => {
  if (!dateString) return 'N/A';
  try {
    const date = new Date(dateString);
    return format(date, 'MMM dd, yyyy');
  } catch {
    return dateString;
  }
};

const formatDateShort = (dateString) => {
  if (!dateString) return 'N/A';
  try {
    const date = new Date(dateString);
    return format(date, 'MMM dd');
  } catch {
    return dateString;
  }
};

const SubscriptionList = ({ subscriptions, onRefresh, viewMode = 'table' }) => {
  const formatCurrency = (amount, currency = 'USD') => {
    if (!amount && amount !== 0) return 'N/A';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || 'USD',
    }).format(amount);
  };

  const getStatusBadge = (status) => {
    if (status === 'active') {
      return (
        <span className="px-3 py-1 text-xs font-semibold rounded-full bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300 border border-green-200 dark:border-green-800">
          Active
        </span>
      );
    }
    return (
      <span className="px-3 py-1 text-xs font-semibold rounded-full bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300 border border-red-200 dark:border-red-800">
        Cancelled
      </span>
    );
  };

  const getDaysUntilRenewal = (renewalDate) => {
    if (!renewalDate) return null;
    try {
      const days = differenceInDays(new Date(renewalDate), new Date());
      if (days < 0) return 'Overdue';
      if (days === 0) return 'Today';
      if (days === 1) return 'Tomorrow';
      if (days <= 7) return `${days} days`;
      return null;
    } catch {
      return null;
    }
  };

  if (subscriptions.length === 0) {
    return (
      <div className="bg-white/90 dark:bg-gray-900/90 backdrop-blur-xl rounded-2xl shadow-xl p-16 text-center border border-gray-200/60 dark:border-gray-800/60">
        <div className="inline-flex items-center justify-center w-24 h-24 bg-gradient-to-br from-indigo-100 to-purple-100 dark:from-indigo-900/30 dark:to-purple-900/30 rounded-3xl mb-6 shadow-lg">
          <svg
            className="h-12 w-12 text-indigo-600 dark:text-indigo-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
        </div>
        <h3 className="mt-2 text-2xl font-bold text-gray-900 dark:text-white mb-2">No subscriptions found</h3>
        <p className="mt-1 text-base text-gray-500 dark:text-gray-400">
          Connect your bank account or process emails to start tracking subscriptions
        </p>
      </div>
    );
  }

  // Card View
  if (viewMode === 'card') {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {subscriptions.map((subscription) => {
          const daysUntil = getDaysUntilRenewal(subscription.nextRenewalDate);
          return (
            <div
              key={subscription._id}
              className="group bg-white/90 dark:bg-gray-900/90 backdrop-blur-xl rounded-2xl shadow-xl border border-gray-200/60 dark:border-gray-800/60 hover:shadow-2xl hover:-translate-y-1 transition-all duration-300 overflow-hidden"
            >
              <div className={`h-2 ${subscription.status === 'active' ? 'bg-gradient-to-r from-green-400 via-emerald-500 to-teal-500' : 'bg-gradient-to-r from-red-400 via-rose-500 to-pink-500'}`}></div>
              <div className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-1">
                      {subscription.companyName}
                    </h3>
                    {subscription.planName && (
                      <p className="text-sm text-gray-600 dark:text-gray-400">{subscription.planName}</p>
                    )}
                  </div>
                  {getStatusBadge(subscription.status)}
                </div>

                <div className="space-y-3 mb-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600 dark:text-gray-400">Price</span>
                    <span className="text-lg font-bold text-gray-900 dark:text-white">
                      {formatCurrency(subscription.price, subscription.currency)}
                    </span>
                  </div>
                  
                  {subscription.nextRenewalDate && subscription.status === 'active' && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600 dark:text-gray-400">Next Renewal</span>
                      <div className="text-right">
                        <div className="text-sm font-medium text-gray-900 dark:text-white">
                          {formatDateShort(subscription.nextRenewalDate)}
                        </div>
                        {daysUntil && (
                          <div className={`text-xs ${
                            daysUntil === 'Overdue' || daysUntil === 'Today' 
                              ? 'text-red-600 dark:text-red-400 font-semibold' 
                              : daysUntil === 'Tomorrow'
                              ? 'text-orange-600 dark:text-orange-400 font-semibold'
                              : 'text-orange-500 dark:text-orange-400'
                          }`}>
                            {daysUntil}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {subscription.startDate && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600 dark:text-gray-400">Started</span>
                      <span className="text-sm text-gray-900 dark:text-gray-300">
                        {formatDateShort(subscription.startDate)}
                      </span>
                    </div>
                  )}

                  {subscription.cancellationDate && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600 dark:text-gray-400">Cancelled</span>
                      <span className="text-sm text-gray-900 dark:text-gray-300">
                        {formatDateShort(subscription.cancellationDate)}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  // Table View
  return (
    <div className="bg-white/90 dark:bg-gray-900/90 backdrop-blur-xl rounded-2xl shadow-xl overflow-hidden border border-gray-200/60 dark:border-gray-800/60">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
          <thead className="bg-gradient-to-r from-indigo-50 via-purple-50 to-pink-50 dark:from-gray-800 dark:via-gray-800 dark:to-gray-800">
            <tr>
              <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                Service
              </th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                Plan
              </th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                Price
              </th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                Start Date
              </th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                Next Renewal
              </th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                Cancelled
              </th>
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
            {subscriptions.map((subscription) => {
              const daysUntil = getDaysUntilRenewal(subscription.nextRenewalDate);
              return (
                <tr key={subscription._id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 via-purple-600 to-pink-600 rounded-xl flex items-center justify-center mr-4 shadow-lg">
                        <span className="text-white font-extrabold text-base">
                          {subscription.companyName.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div className="text-base font-bold text-gray-900 dark:text-white">
                        {subscription.companyName}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600 dark:text-gray-400">
                      {subscription.planName || <span className="text-gray-400 dark:text-gray-600">—</span>}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-semibold text-gray-900 dark:text-white">
                      {formatCurrency(subscription.price, subscription.currency)}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {getStatusBadge(subscription.status)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                    {formatDate(subscription.startDate)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {subscription.nextRenewalDate ? (
                      <div>
                        <div className="text-sm text-gray-900 dark:text-white">
                          {formatDate(subscription.nextRenewalDate)}
                        </div>
                        {daysUntil && subscription.status === 'active' && (
                          <div className={`text-xs mt-1 ${
                            daysUntil === 'Overdue' || daysUntil === 'Today' 
                              ? 'text-red-600 dark:text-red-400 font-semibold' 
                              : daysUntil === 'Tomorrow'
                              ? 'text-orange-600 dark:text-orange-400 font-semibold'
                              : 'text-orange-500 dark:text-orange-400'
                          }`}>
                            {daysUntil}
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="text-gray-400 dark:text-gray-600">—</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                    {subscription.cancellationDate ? (
                      formatDate(subscription.cancellationDate)
                    ) : (
                      <span className="text-gray-400 dark:text-gray-600">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default SubscriptionList;
