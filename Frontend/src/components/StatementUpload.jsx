import { useState, useEffect, useRef } from 'react';
import { statementsAPI } from '../services/api';
import { format, addMonths, addWeeks, addYears } from 'date-fns';

const StatementUpload = () => {
  const [uploading, setUploading] = useState(false);
  const [statements, setStatements] = useState([]);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [loadingStatements, setLoadingStatements] = useState(true);
  const fileInputRef = useRef(null);

  useEffect(() => {
    fetchStatements();
  }, []);

  const fetchStatements = async () => {
    try {
      setLoadingStatements(true);
      const response = await statementsAPI.getAll();
      if (response.data.success) {
        setStatements(response.data.statements);
      }
    } catch (err) {
      console.error('Error fetching statements:', err);
    } finally {
      setLoadingStatements(false);
    }
  };

  const handleUpload = async (file) => {
    if (!file) return;
    if (file.type !== 'application/pdf') {
      setError('Only PDF files are allowed');
      return;
    }

    setError('');
    setSuccessMsg('');
    setUploading(true);

    try {
      const response = await statementsAPI.upload(file);
      if (response.data.success) {
        setSuccessMsg(response.data.message);
        await fetchStatements();
      }
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to process bank statement';
      setError(msg);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleAddSubscription = async (statementId, index) => {
    try {
      setError('');
      const response = await statementsAPI.addSubscription(statementId, index);
      if (response.data.success) {
        setSuccessMsg(response.data.message);
        await fetchStatements();
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to add subscription');
    }
  };

  const handleDelete = async (statementId) => {
    try {
      setError('');
      await statementsAPI.delete(statementId);
      setSuccessMsg('Statement deleted');
      await fetchStatements();
    } catch (err) {
      setError('Failed to delete statement');
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleUpload(file);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = () => setDragOver(false);

  const getConfidenceBadge = (confidence) => {
    const styles = {
      high: 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300 border-green-200 dark:border-green-800',
      medium: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300 border-yellow-200 dark:border-yellow-800',
      low: 'bg-gray-100 dark:bg-gray-700/30 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-600',
    };
    return (
      <span className={`px-2 py-0.5 text-xs font-semibold rounded-full border ${styles[confidence] || styles.low}`}>
        {confidence}
      </span>
    );
  };

  const formatCurrency = (amount, currency = 'CAD') => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || 'CAD',
    }).format(amount);
  };

  const formatDate = (dateString) => {
    if (!dateString) return '';
    try {
      return format(new Date(dateString), 'MMM dd, yyyy');
    } catch {
      return dateString;
    }
  };

  const getStartDate = (sub) => {
    if (!sub.transactionDates || sub.transactionDates.length === 0) return null;
    const sorted = [...sub.transactionDates].map(d => new Date(d)).sort((a, b) => a - b);
    return sorted[0];
  };

  const getNextRenewal = (sub) => {
    if (!sub.transactionDates || sub.transactionDates.length === 0) return null;
    const sorted = [...sub.transactionDates].map(d => new Date(d)).sort((a, b) => a - b);
    const latest = sorted[sorted.length - 1];
    switch (sub.frequency) {
      case 'weekly': return addWeeks(latest, 1);
      case 'yearly': return addYears(latest, 1);
      case 'monthly':
      default: return addMonths(latest, 1);
    }
  };

  return (
    <div className="space-y-6">
      {/* Page header */}
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Bank Statements</h1>

      {/* How it works */}
      <div className="bg-white/90 dark:bg-gray-900/90 backdrop-blur-xl rounded-2xl shadow-xl border border-gray-200/60 dark:border-gray-800/60 p-6">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">How it works</h3>
        <div className="space-y-3 text-sm text-gray-600 dark:text-gray-400">
          <div className="flex items-start gap-3">
            <span className="flex-shrink-0 w-6 h-6 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-full flex items-center justify-center text-xs font-bold">1</span>
            <p>Upload your <strong className="text-gray-900 dark:text-white">last 3 bank statements</strong> as PDFs, starting from the oldest to the newest.</p>
          </div>
          <div className="flex items-start gap-3">
            <span className="flex-shrink-0 w-6 h-6 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-full flex items-center justify-center text-xs font-bold">2</span>
            <p>Our AI scans your transactions and identifies recurring charges that look like subscriptions.</p>
          </div>
          <div className="flex items-start gap-3">
            <span className="flex-shrink-0 w-6 h-6 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-full flex items-center justify-center text-xs font-bold">3</span>
            <p>Review the results, then click <strong className="text-gray-900 dark:text-white">Add</strong> to track any subscription. Going forward, just upload each new statement as you receive it.</p>
          </div>
        </div>

        {/* Confidence levels */}
        <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-800">
          <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Confidence Levels</h4>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 font-semibold rounded-full border bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300 border-green-200 dark:border-green-800">high</span>
              <span className="text-gray-500 dark:text-gray-400">Recurring pattern confirmed</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 font-semibold rounded-full border bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300 border-yellow-200 dark:border-yellow-800">medium</span>
              <span className="text-gray-500 dark:text-gray-400">Likely a subscription</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 font-semibold rounded-full border bg-gray-100 dark:bg-gray-700/30 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-600">low</span>
              <span className="text-gray-500 dark:text-gray-400">Might not be recurring</span>
            </div>
          </div>
        </div>
      </div>

      {/* Upload Zone */}
      <div className="bg-white/90 dark:bg-gray-900/90 backdrop-blur-xl rounded-2xl shadow-xl border border-gray-200/60 dark:border-gray-800/60 p-6">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">
          Upload Statement
        </h3>

        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => !uploading && fileInputRef.current?.click()}
          className={`relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-200 ${
            dragOver
              ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20'
              : 'border-gray-300 dark:border-gray-600 hover:border-indigo-400 hover:bg-gray-50 dark:hover:bg-gray-800/50'
          } ${uploading ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          {uploading ? (
            <div className="flex flex-col items-center">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600 mb-3"></div>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Processing your bank statement...
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Extracting transactions and analyzing with AI (this may take a minute)
              </p>
            </div>
          ) : (
            <div className="flex flex-col items-center">
              <svg className="w-10 h-10 text-gray-400 dark:text-gray-500 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Drop your PDF bank statement here
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                or click to browse (PDF only, max 10MB)
              </p>
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,application/pdf"
            className="hidden"
            onChange={(e) => handleUpload(e.target.files[0])}
            disabled={uploading}
          />
        </div>

        {error && (
          <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
          </div>
        )}
        {successMsg && (
          <div className="mt-4 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
            <p className="text-sm text-green-700 dark:text-green-300">{successMsg}</p>
          </div>
        )}
      </div>

      {/* Results / Previous Uploads */}
      {loadingStatements ? (
        <div className="flex justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
        </div>
      ) : statements.length > 0 ? (
        statements.map((statement) => (
          <div
            key={statement._id}
            className="bg-white/90 dark:bg-gray-900/90 backdrop-blur-xl rounded-2xl shadow-xl border border-gray-200/60 dark:border-gray-800/60 p-6"
          >
            <div className="flex items-center justify-between mb-4">
              <div>
                <h4 className="text-md font-bold text-gray-900 dark:text-white">
                  {statement.originalFilename}
                </h4>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Uploaded {formatDate(statement.uploadDate)} &middot; {statement.totalTransactions} transactions &middot;{' '}
                  {statement.extractedSubscriptions?.length || 0} subscriptions detected
                </p>
              </div>
              <button
                onClick={() => handleDelete(statement._id)}
                className="text-xs text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 font-medium"
              >
                Delete
              </button>
            </div>

            {statement.status === 'failed' && (
              <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                <p className="text-sm text-red-700 dark:text-red-300">{statement.errorMessage || 'Processing failed'}</p>
              </div>
            )}

            {statement.status === 'completed' && statement.extractedSubscriptions?.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-700">
                      <th className="text-left py-2 px-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Merchant</th>
                      <th className="text-left py-2 px-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Amount</th>
                      <th className="text-left py-2 px-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Frequency</th>
                      <th className="text-left py-2 px-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Occurrences</th>
                      <th className="text-left py-2 px-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Start Date</th>
                      <th className="text-left py-2 px-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Next Renewal</th>
                      <th className="text-left py-2 px-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Confidence</th>
                      <th className="text-right py-2 px-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {statement.extractedSubscriptions.map((sub, index) => (
                      <tr key={index} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/30">
                        <td className="py-3 px-3">
                          <span className="font-medium text-gray-900 dark:text-white">{sub.merchantName}</span>
                        </td>
                        <td className="py-3 px-3 text-gray-700 dark:text-gray-300">
                          {formatCurrency(sub.amount, sub.currency)}
                        </td>
                        <td className="py-3 px-3 text-gray-500 dark:text-gray-400 capitalize">
                          {sub.frequency}
                        </td>
                        <td className="py-3 px-3 text-gray-500 dark:text-gray-400">
                          {sub.occurrences}x
                        </td>
                        <td className="py-3 px-3 text-gray-500 dark:text-gray-400">
                          {getStartDate(sub) ? formatDate(getStartDate(sub)) : '—'}
                        </td>
                        <td className="py-3 px-3 text-gray-500 dark:text-gray-400">
                          {getNextRenewal(sub) ? formatDate(getNextRenewal(sub)) : '—'}
                        </td>
                        <td className="py-3 px-3">
                          {getConfidenceBadge(sub.confidence)}
                        </td>
                        <td className="py-3 px-3 text-right">
                          {sub.addedToSubscriptions ? (
                            <span className="text-xs text-green-600 dark:text-green-400 font-medium">Added</span>
                          ) : (
                            <button
                              onClick={() => handleAddSubscription(statement._id, index)}
                              className="px-3 py-1 text-xs font-medium text-white bg-gradient-to-r from-indigo-600 to-purple-600 rounded-lg hover:from-indigo-700 hover:to-purple-700 transition-all"
                            >
                              Add
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {statement.status === 'completed' && (!statement.extractedSubscriptions || statement.extractedSubscriptions.length === 0) && (
              <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
                No recurring subscriptions detected in this statement.
              </p>
            )}
          </div>
        ))
      ) : (
        <div className="text-center py-8">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            No bank statements uploaded yet. Upload a PDF to get started.
          </p>
        </div>
      )}
    </div>
  );
};

export default StatementUpload;
