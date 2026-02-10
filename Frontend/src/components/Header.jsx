import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const Header = () => {
  const { isAuthenticated } = useAuth();

  return (
    <header className="absolute top-0 left-0 right-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-3 group">
            <div className="w-9 h-9 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20 group-hover:scale-105 transition-transform">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <span className="text-lg font-bold text-white hidden sm:block">
              Sub-Tracker
            </span>
          </Link>

          {/* Nav */}
          <nav className="flex items-center gap-2 sm:gap-3">
            {isAuthenticated ? (
              <Link
                to="/app/dashboard"
                className="px-5 py-2 text-sm font-semibold text-white bg-gradient-to-r from-indigo-500 to-purple-500 rounded-lg hover:from-indigo-400 hover:to-purple-400 shadow-md shadow-indigo-500/20 hover:shadow-indigo-500/30 transition-all hover:-translate-y-0.5"
              >
                Go to App
              </Link>
            ) : (
              <>
                <Link
                  to="/login"
                  className="px-4 py-2 text-sm font-medium text-gray-300 hover:text-white rounded-lg hover:bg-white/10 transition-colors"
                >
                  Sign In
                </Link>
                <Link
                  to="/register"
                  className="px-5 py-2 text-sm font-semibold text-white bg-gradient-to-r from-indigo-500 to-purple-500 rounded-lg hover:from-indigo-400 hover:to-purple-400 shadow-md shadow-indigo-500/20 hover:shadow-indigo-500/30 transition-all hover:-translate-y-0.5"
                >
                  Get Started
                </Link>
              </>
            )}
          </nav>
        </div>
      </div>
    </header>
  );
};

export default Header;
