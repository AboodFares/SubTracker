import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import Header from './Header';
import Footer from './Footer';

const Register = () => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { register } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (password.length < 6) {
      setError('Password must be at least 6 characters long');
      setLoading(false);
      return;
    }

    const result = await register(email, password, name);

    if (result.success) {
      navigate('/app/dashboard');
    } else {
      setError(result.message);
    }

    setLoading(false);
  };

  return (
    <div className="min-h-screen flex flex-col bg-gray-950">
      <Header />
      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm rounded-xl bg-gray-900 p-8 text-gray-100 shadow-2xl">
          <p className="text-center text-2xl font-bold">Sign up</p>

          {error && (
            <div className="mt-4 rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div className="text-sm">
              <label htmlFor="name" className="mb-1 block text-gray-400">Name</label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full rounded-md border border-gray-700 bg-gray-900 px-4 py-3 text-gray-100 outline-none transition focus:border-violet-400"
              />
            </div>

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
                minLength={6}
                className="w-full rounded-md border border-gray-700 bg-gray-900 px-4 py-3 text-gray-100 outline-none transition focus:border-violet-400"
              />
              <p className="mt-2 text-xs text-gray-500">At least 6 characters</p>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="block w-full rounded-md bg-violet-400 py-3 text-center font-semibold text-gray-900 transition hover:bg-violet-300 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? 'Creating account...' : 'Sign up'}
            </button>
          </form>

          <p className="mt-6 text-center text-xs text-gray-400">
            Already have an account?{' '}
            <Link to="/login" className="text-sm text-gray-100 hover:underline hover:decoration-violet-400">Sign in</Link>
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

export default Register;

