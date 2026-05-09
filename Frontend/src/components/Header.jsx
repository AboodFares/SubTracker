import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const Header = ({ onSignIn, onGetStarted }) => {
  const { isAuthenticated } = useAuth();

  return (
    <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-sm border-b border-gray-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo */}
          <Link to="/" className="text-lg font-bold text-gray-900 hover:text-indigo-600 transition-colors">
            Sub-Tracker
          </Link>

          {/* Nav */}
          <nav className="flex items-center gap-2 sm:gap-3">
            {isAuthenticated ? (
              <Link
                to="/app/dashboard"
                className="px-5 py-2 text-sm font-semibold text-white bg-gradient-to-r from-indigo-600 to-purple-600 rounded-lg hover:from-indigo-500 hover:to-purple-500 shadow-sm shadow-indigo-100 transition-all hover:-translate-y-0.5"
              >
                Go to App
              </Link>
            ) : (
              <>
                {onSignIn ? (
                  <button
                    onClick={onSignIn}
                    className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 rounded-lg hover:bg-gray-100 transition-colors"
                  >
                    Sign In
                  </button>
                ) : (
                  <Link
                    to="/login"
                    className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 rounded-lg hover:bg-gray-100 transition-colors"
                  >
                    Sign In
                  </Link>
                )}
                {onGetStarted ? (
                  <button
                    onClick={onGetStarted}
                    className="px-5 py-2 text-sm font-semibold text-white bg-gradient-to-r from-indigo-600 to-purple-600 rounded-lg hover:from-indigo-500 hover:to-purple-500 shadow-sm shadow-indigo-100 transition-all hover:-translate-y-0.5"
                  >
                    Get Started
                  </button>
                ) : (
                  <Link
                    to="/register"
                    className="px-5 py-2 text-sm font-semibold text-white bg-gradient-to-r from-indigo-600 to-purple-600 rounded-lg hover:from-indigo-500 hover:to-purple-500 shadow-sm shadow-indigo-100 transition-all hover:-translate-y-0.5"
                  >
                    Get Started
                  </Link>
                )}
              </>
            )}
          </nav>
        </div>
      </div>
    </header>
  );
};

export default Header;
