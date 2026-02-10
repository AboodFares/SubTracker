import { useState } from 'react';
import { format, differenceInDays } from 'date-fns';
import { getLogoUrl } from '../utils/brandLogo';
import { subscriptionsAPI } from '../services/api';

const BrandLogo = ({ name, isActive, size = 'md' }) => {
  const [imgError, setImgError] = useState(false);
  const sizeClass = size === 'sm' ? 'w-9 h-9' : 'w-10 h-10';
  const textSize = size === 'sm' ? 'text-xs' : 'text-sm';

  if (imgError) {
    return (
      <div className={`${sizeClass} rounded-lg flex items-center justify-center flex-shrink-0 ${
        isActive
          ? 'bg-gradient-to-br from-indigo-500 to-purple-600'
          : 'bg-gradient-to-br from-gray-400 to-gray-500'
      }`}>
        <span className={`text-white ${textSize} font-bold`}>
          {name.charAt(0).toUpperCase()}
        </span>
      </div>
    );
  }

  return (
    <img
      src={getLogoUrl(name)}
      alt={name}
      onError={() => setImgError(true)}
      className={`${sizeClass} rounded-lg flex-shrink-0 object-contain bg-white border border-gray-200 dark:border-gray-700`}
    />
  );
};

const formatDate = (dateString) => {
  if (!dateString) return null;
  try {
    return format(new Date(dateString), 'MMM dd, yyyy');
  } catch {
    return dateString;
  }
};

const SubscriptionList = ({ subscriptions, onRefresh }) => {
  const [cancellingId, setCancellingId] = useState(null);
  const [cancelError, setCancelError] = useState('');

  const handleCancel = async (id) => {
    if (!window.confirm('Cancel this subscription?')) return;
    try {
      setCancellingId(id);
      setCancelError('');
      await subscriptionsAPI.cancel(id);
      if (onRefresh) onRefresh();
    } catch (err) {
      console.error('Error cancelling subscription:', err);
      const msg = err.response?.data?.message || 'Failed to cancel subscription. Please try again.';
      setCancelError(msg);
      setTimeout(() => setCancelError(''), 5000);
    } finally {
      setCancellingId(null);
    }
  };

  const formatCurrency = (amount, currency = 'USD') => {
    if (!amount && amount !== 0) return 'N/A';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || 'USD',
    }).format(amount);
  };

  const getDaysUntilRenewal = (renewalDate) => {
    if (!renewalDate) return null;
    try {
      const days = differenceInDays(new Date(renewalDate), new Date());
      if (days < 0) return { text: 'Overdue', urgent: true };
      if (days === 0) return { text: 'Today', urgent: true };
      if (days === 1) return { text: 'Tomorrow', urgent: true };
      if (days <= 7) return { text: `${days}d`, urgent: false };
      if (days <= 30) return { text: `${days}d`, urgent: false };
      return null;
    } catch {
      return null;
    }
  };

  if (subscriptions.length === 0) {
    return (
      <div className="bg-white/90 dark:bg-gray-900/90 backdrop-blur-xl rounded-2xl shadow-lg p-12 text-center border border-gray-200/60 dark:border-gray-800/60">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-indigo-100 to-purple-100 dark:from-indigo-900/30 dark:to-purple-900/30 rounded-2xl mb-4">
          <svg className="h-8 w-8 text-indigo-500 dark:text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
        <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-1">No subscriptions found</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Connect your Gmail or upload a bank statement to detect subscriptions
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {cancelError && (
        <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-sm text-red-700 dark:text-red-300">
          {cancelError}
        </div>
      )}
      {subscriptions.map((subscription) => {
        const isActive = subscription.status === 'active';
        const renewal = isActive ? getDaysUntilRenewal(subscription.nextRenewalDate) : null;

        return (
          <div
            key={subscription._id}
            className="bg-white/90 dark:bg-gray-900/90 backdrop-blur-xl rounded-xl shadow-md border border-gray-200/60 dark:border-gray-800/60 overflow-hidden hover:shadow-lg transition-all duration-200 flex"
          >
            {/* Left color bar */}
            <div className={`w-1 flex-shrink-0 ${isActive ? 'bg-green-500' : 'bg-red-400'}`} />

            {/* Content */}
            <div className="flex-1 px-4 py-3.5 flex items-center gap-4 min-w-0">
              {/* Brand Logo */}
              <BrandLogo name={subscription.companyName} isActive={isActive} />

              {/* Name + plan */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                    {subscription.companyName}
                  </h3>
                  {!isActive && (
                    <span className="px-2 py-0.5 text-[10px] font-semibold rounded-full bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 flex-shrink-0">
                      Cancelled
                    </span>
                  )}
                </div>
                {subscription.planName && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{subscription.planName}</p>
                )}
                {!subscription.planName && subscription.cancellationDate && !isActive && (
                  <p className="text-xs text-gray-400 dark:text-gray-500">
                    Cancelled {formatDate(subscription.cancellationDate)}
                  </p>
                )}
              </div>

              {/* Renewal countdown */}
              {renewal && (
                <div className="flex-shrink-0 hidden sm:block">
                  <span className={`px-2.5 py-1 text-xs font-bold rounded-lg ${
                    renewal.urgent
                      ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                  }`}>
                    {renewal.text}
                  </span>
                </div>
              )}

              {/* Not seen warning */}
              {isActive && subscription.missedInStatement && (
                <div className="flex-shrink-0 hidden sm:block">
                  <span className="px-2 py-0.5 text-[10px] font-semibold rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                    Not seen
                  </span>
                </div>
              )}

              {/* Price */}
              <div className="text-right flex-shrink-0">
                <div className="text-sm font-bold text-gray-900 dark:text-white">
                  {formatCurrency(subscription.price, subscription.currency)}
                </div>
                {subscription.nextRenewalDate && isActive && (
                  <div className="text-[11px] text-gray-400 dark:text-gray-500">
                    {formatDate(subscription.nextRenewalDate)}
                  </div>
                )}
              </div>

              {/* Cancel button */}
              {isActive && (
                <button
                  onClick={() => handleCancel(subscription._id)}
                  disabled={cancellingId === subscription._id}
                  className="flex-shrink-0 p-1.5 text-gray-400 hover:text-red-500 dark:text-gray-500 dark:hover:text-red-400 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-50"
                  title="Cancel subscription"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default SubscriptionList;
