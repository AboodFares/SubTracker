import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { authAPI } from '../services/api';
import Header from './Header';
import Footer from './Footer';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const result = await login(email, password);

    if (result.success) {
      navigate('/app/dashboard');
    } else {
      setError(result.message);
    }

    setLoading(false);
  };

  const handleGoogleLogin = () => {
    authAPI.googleLogin();
  };

  return (
    <div className="min-h-screen flex flex-col bg-gray-950">
      <Header />
      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm rounded-xl bg-gray-900 p-8 text-gray-100 shadow-2xl">
          <p className="text-center text-2xl font-bold">Login</p>

          {error && (
            <div className="mt-4 rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div className="text-sm">
              <label htmlFor="email" className="mb-1 block text-gray-400">Email</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full rounded-md border border-gray-700 bg-gray-900 px-4 py-3 text-gray-100 outline-none transition focus:border-violet-400"
              />
            </div>

            <div className="text-sm">
              <label htmlFor="password" className="mb-1 block text-gray-400">Password</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full rounded-md border border-gray-700 bg-gray-900 px-4 py-3 text-gray-100 outline-none transition focus:border-violet-400"
              />
              <div className="mt-2 flex justify-end text-xs">
                <a href="#" className="text-gray-100 hover:underline hover:decoration-violet-400">Forgot Password ?</a>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="block w-full rounded-md bg-violet-400 py-3 text-center font-semibold text-gray-900 transition hover:bg-violet-300 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>

          <div className="flex items-center pt-4">
            <div className="h-px flex-1 bg-gray-700" />
            <p className="px-3 text-sm text-gray-400">Or continue with</p>
            <div className="h-px flex-1 bg-gray-700" />
          </div>

          <div className="mt-3 flex justify-center">
            <button
              onClick={handleGoogleLogin}
              aria-label="Log in with Google"
              className="flex items-center gap-2 rounded-md border border-gray-700 px-4 py-2.5 text-sm text-gray-200 transition hover:bg-white/5"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              Google
            </button>
          </div>

          <p className="mt-6 text-center text-xs text-gray-400">
            Don't have an account?{' '}
            <Link to="/register" className="text-sm text-gray-100 hover:underline hover:decoration-violet-400">Sign up</Link>
          </p>
          <p className="mt-2 text-center text-xs">
            <Link to="/" className="text-gray-500 hover:text-gray-300">← Back to Home</Link>
          </p>
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default Login;

