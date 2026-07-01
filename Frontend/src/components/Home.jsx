import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { authAPI } from '../services/api';
import { getLogoUrl } from '../utils/brandLogo';
import Header from './Header';
import Footer from './Footer';

const brandNames = ['Netflix', 'Spotify', 'Apple', 'YouTube', 'Disney+', 'Adobe', 'Amazon', 'ChatGPT'];

const features = [
  {
    title: 'Smart AI Detection',
    description: 'Our AI reads your emails and bank statements to automatically find and categorize every subscription.',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" />
      </svg>
    ),
    iconBg: 'from-indigo-500 to-purple-500',
  },
  {
    title: 'Spending Insights',
    description: 'See your total monthly and yearly costs at a glance. Track every dollar across all your subscriptions.',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
      </svg>
    ),
    iconBg: 'from-emerald-500 to-teal-500',
  },
  {
    title: 'Renewal Alerts',
    description: 'Get notified 5 days before any subscription renews. Never get surprised by an unexpected charge again.',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
      </svg>
    ),
    iconBg: 'from-orange-400 to-rose-500',
  },
];

const previewCards = [
  { name: 'Netflix',  amount: '$15.99', cycle: 'monthly', next: 'Jun 3',  dot: 'bg-red-400',    rotate: 'rotate(6deg)',  top: '8%',  left: '0%',  anim: 'float-a 6s ease-in-out infinite' },
  { name: 'Spotify',  amount: '$9.99',  cycle: 'monthly', next: 'Jun 12', dot: 'bg-green-400',  rotate: 'rotate(-4deg)', top: '38%', left: '22%', anim: 'float-b 7s ease-in-out infinite 0.8s' },
  { name: 'Adobe CC', amount: '$54.99', cycle: 'monthly', next: 'Jun 1',  dot: 'bg-orange-400', rotate: 'rotate(3deg)',  top: '62%', left: '5%',  anim: 'float-a 8s ease-in-out infinite 1.5s' },
];

/* ── Scroll-in animation hook ── */
const useInView = () => {
  const ref = useRef(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setInView(true); observer.disconnect(); } },
      { threshold: 0.12 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  return [ref, inView];
};

const AnimateIn = ({ children, delay = 0, className = '' }) => {
  const [ref, inView] = useInView();
  return (
    <div
      ref={ref}
      className={`transition-all duration-700 ease-out ${inView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'} ${className}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
};

/* ── Auth Modal ── */
const AuthModal = ({ mode, onClose, onSwitch }) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login, register } = useAuth();
  const navigate = useNavigate();
  const isLogin = mode === 'login';

  useEffect(() => {
    const handleKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    if (!isLogin && password.length < 6) {
      setError('Password must be at least 6 characters');
      setLoading(false);
      return;
    }
    const result = isLogin
      ? await login(email, password)
      : await register(email, password, name);
    if (result.success) navigate('/app/dashboard');
    else setError(result.message);
    setLoading(false);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" />
      <div className="relative w-full max-w-sm rounded-xl bg-gray-900 p-8 text-gray-100 shadow-2xl">
        <button onClick={onClose} className="absolute top-4 right-4 flex h-8 w-8 items-center justify-center rounded-full text-gray-500 transition hover:bg-white/10 hover:text-gray-200">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
        </button>

        <p className="text-center text-2xl font-bold">{isLogin ? 'Login' : 'Sign up'}</p>

        {error && <div className="mt-4 rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">{error}</div>}

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          {!isLogin && (
            <div className="text-sm">
              <label htmlFor="auth-name" className="mb-1 block text-gray-400">Name</label>
              <input id="auth-name" type="text" value={name} onChange={(e) => setName(e.target.value)} required className="w-full rounded-md border border-gray-700 bg-gray-900 px-4 py-3 text-gray-100 outline-none transition focus:border-violet-400" />
            </div>
          )}
          <div className="text-sm">
            <label htmlFor="auth-email" className="mb-1 block text-gray-400">Email</label>
            <input id="auth-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="w-full rounded-md border border-gray-700 bg-gray-900 px-4 py-3 text-gray-100 outline-none transition focus:border-violet-400" />
          </div>
          <div className="text-sm">
            <label htmlFor="auth-password" className="mb-1 block text-gray-400">Password</label>
            <input id="auth-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required className="w-full rounded-md border border-gray-700 bg-gray-900 px-4 py-3 text-gray-100 outline-none transition focus:border-violet-400" />
            {isLogin ? (
              <div className="mt-2 flex justify-end text-xs">
                <a href="#" className="text-gray-100 hover:underline hover:decoration-violet-400">Forgot Password ?</a>
              </div>
            ) : (
              <p className="mt-2 text-xs text-gray-500">At least 6 characters</p>
            )}
          </div>
          <button type="submit" disabled={loading} className="block w-full rounded-md bg-violet-400 py-3 text-center font-semibold text-gray-900 transition hover:bg-violet-300 disabled:cursor-not-allowed disabled:opacity-50">
            {loading ? (isLogin ? 'Signing in…' : 'Creating account…') : (isLogin ? 'Sign in' : 'Create account')}
          </button>
        </form>

        <div className="flex items-center pt-4">
          <div className="h-px flex-1 bg-gray-700" />
          <p className="px-3 text-sm text-gray-400">Or continue with</p>
          <div className="h-px flex-1 bg-gray-700" />
        </div>

        <div className="mt-3 flex justify-center">
          <button onClick={() => authAPI.googleLogin()} aria-label="Log in with Google" className="flex items-center gap-2 rounded-md border border-gray-700 px-4 py-2.5 text-sm text-gray-200 transition hover:bg-white/5">
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
          {isLogin ? "Don't have an account? " : 'Already have an account? '}
          <button type="button" onClick={() => onSwitch(isLogin ? 'register' : 'login')} className="text-sm text-gray-100 hover:underline hover:decoration-violet-400">
            {isLogin ? 'Sign up' : 'Sign in'}
          </button>
        </p>
      </div>
    </div>
  );
};

const Home = () => {
  const { isAuthenticated } = useAuth();
  const [authModal, setAuthModal] = useState(null);

  return (
    <div className="min-h-screen flex flex-col bg-[#eef0f6] text-gray-900 overflow-x-hidden">
      {authModal && (
        <AuthModal mode={authModal} onClose={() => setAuthModal(null)} onSwitch={(m) => setAuthModal(m)} />
      )}

      <Header onSignIn={() => setAuthModal('login')} onGetStarted={() => setAuthModal('register')} />

      <main className="flex-1">

        {/* ===== HERO ===== */}
        <section className="relative min-h-[90vh] flex items-center overflow-hidden bg-[#23252e]">
          {/* Animated gradient orbs */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] rounded-full bg-indigo-600/30 blur-[120px] animate-orb-1" />
            <div className="absolute bottom-[-20%] right-[-10%] w-[500px] h-[500px] rounded-full bg-purple-600/30 blur-[100px] animate-orb-2" />
            <div className="absolute top-[40%] left-[40%] w-[400px] h-[400px] rounded-full bg-pink-600/20 blur-[100px] animate-orb-3" />
          </div>

          {/* Dot grid overlay */}
          <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1px)', backgroundSize: '32px 32px' }} />

          <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 w-full">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">

              {/* Left — copy */}
              <div>
                <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-white/10 bg-white/5 backdrop-blur-sm mb-8">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-sm text-gray-300">AI-powered subscription tracking</span>
                </div>

                <h1 className="text-5xl sm:text-6xl font-bold tracking-tight leading-[1.08] mb-6 text-white">
                  Never lose track
                  <br />
                  <span className="bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
                    of your money
                  </span>
                </h1>

                <p className="text-lg text-gray-400 mb-10 leading-relaxed max-w-lg">
                  Connect Gmail and bank statements. Our AI automatically detects every recurring charge — so you always know where your money goes.
                </p>

                {isAuthenticated && (
                  <Link to="/app/dashboard" className="inline-block px-7 py-3.5 bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-xl font-semibold text-base hover:from-indigo-400 hover:to-purple-400 transition-all shadow-lg shadow-indigo-500/30 hover:-translate-y-0.5">
                    Go to Dashboard
                  </Link>
                )}
              </div>

              {/* Right — floating subscription cards */}
              <div className="relative h-[420px] hidden lg:block">
                {previewCards.map((card, i) => (
                  <div
                    key={card.name}
                    style={{ position: 'absolute', top: card.top, left: card.left, zIndex: i + 1, animation: card.anim }}
                  >
                    <div className="glass-card w-[210px] p-5 text-left" style={{ transform: card.rotate }}>
                      <div className="flex items-center gap-3 mb-4">
                        <img src={getLogoUrl(card.name)} alt={card.name} className="w-9 h-9 rounded-lg" />
                        <div>
                          <p className="font-semibold text-gray-900 text-sm">{card.name}</p>
                          <p className="text-xs text-gray-500">{card.cycle}</p>
                        </div>
                      </div>
                      <p className="text-2xl font-bold text-gray-900 mb-1">{card.amount}</p>
                      <div className="flex items-center gap-1.5">
                        <span className={`w-1.5 h-1.5 rounded-full ${card.dot}`} />
                        <p className="text-xs text-gray-500">Renews {card.next}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Bottom fade into page background */}
          <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-[#eef0f6] to-transparent pointer-events-none" />
        </section>

        {/* ===== BRAND MARQUEE ===== */}
        <section className="py-14 bg-[#eef0f6] border-b border-gray-200/70">
          <p className="text-center text-xs font-semibold text-gray-500 uppercase tracking-widest mb-10">
            Detects subscriptions from the services you use
          </p>
          <div className="relative overflow-hidden">
            {/* Edge fades */}
            <div className="absolute left-0 top-0 bottom-0 w-32 bg-gradient-to-r from-[#eef0f6] to-transparent z-10 pointer-events-none" />
            <div className="absolute right-0 top-0 bottom-0 w-32 bg-gradient-to-l from-[#eef0f6] to-transparent z-10 pointer-events-none" />

            <div className="flex animate-marquee w-max gap-14 items-center">
              {[...brandNames, ...brandNames, ...brandNames].map((name, i) => (
                <div key={`${name}-${i}`} className="flex flex-col items-center gap-2 group cursor-default flex-shrink-0">
                  <img
                    src={getLogoUrl(name)}
                    alt={name}
                    className="w-10 h-10 rounded-xl grayscale opacity-50 group-hover:grayscale-0 group-hover:opacity-100 transition-all duration-300"
                  />
                  <span className="text-xs text-gray-400 group-hover:text-gray-700 transition-colors duration-300 font-medium">
                    {name}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ===== FEATURES ===== */}
        <section className="py-24 bg-[#e6eaf3]">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <AnimateIn className="text-center mb-16">
              <p className="text-base font-semibold text-indigo-600 uppercase tracking-widest mb-4">Features</p>
              <p className="text-2xl sm:text-3xl font-bold text-gray-900 max-w-2xl mx-auto leading-snug">Powerful tools to find, track, and manage every subscription automatically.</p>
            </AnimateIn>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {features.map((f, i) => (
                <AnimateIn key={i} delay={i * 120}>
                  <div className="glass-card group relative p-10 h-full text-left overflow-hidden">
                    <span className="absolute top-0 left-0 h-1.5 w-0 bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-500 ease-out group-hover:w-full" />
                    <h3 className="text-2xl font-bold text-gray-900 mb-3">{f.title}</h3>
                    <p className="text-base text-gray-600 leading-relaxed">{f.description}</p>
                  </div>
                </AnimateIn>
              ))}
            </div>
          </div>
        </section>

        {/* ===== STATS ===== */}
        <section className="py-24 relative overflow-hidden bg-[#eef0f6] border-t border-gray-200/70">
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            <div className="absolute top-[-30%] right-[-10%] w-[500px] h-[500px] rounded-full bg-purple-400/20 blur-[100px]" />
            <div className="absolute bottom-[-20%] left-[-5%] w-[400px] h-[400px] rounded-full bg-indigo-400/20 blur-[80px]" />
          </div>

          <div className="relative max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
            <AnimateIn className="text-center mb-14">
              <h2 className="text-4xl sm:text-5xl font-bold text-gray-900">Built for real tracking</h2>
            </AnimateIn>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
              {[
                { value: '3', label: 'Detection Sources', sub: 'Email · Bank · Statements' },
                { value: 'Auto', label: 'Smart Detection', sub: 'Finds every charge' },
                { value: '5d', label: 'Early Alerts', sub: 'Before every renewal' },
                { value: '24/7', label: 'Always Monitoring', sub: 'Automated scanning' },
              ].map((s, i) => (
                <AnimateIn key={i} delay={i * 100} className="h-full">
                  <div className="glass-card p-8 text-center h-full flex flex-col justify-center">
                    <div className="text-5xl font-bold text-gray-900 mb-2">{s.value}</div>
                    <div className="text-base font-semibold text-gray-800 mb-0.5">{s.label}</div>
                    <div className="text-sm text-gray-500">{s.sub}</div>
                  </div>
                </AnimateIn>
              ))}
            </div>
          </div>
        </section>

        {/* ===== FINAL CTA ===== */}
        <section className="py-24 bg-[#eef0f6]">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
            <AnimateIn>
              <div className="relative rounded-3xl overflow-hidden bg-gradient-to-br from-emerald-600 via-teal-600 to-cyan-600 shadow-2xl shadow-emerald-200">
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(255,255,255,0.15),transparent_60%)]" />
                <div className="absolute inset-0" style={{ backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1px)', backgroundSize: '24px 24px' }} />
                <div className="relative px-8 py-16 sm:px-16 text-center">
                  <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">Ready to take control?</h2>
                  <p className="text-lg text-white/70 mb-8 max-w-lg mx-auto">Stop overpaying for forgotten subscriptions. Start tracking in under a minute.</p>
                  {!isAuthenticated ? (
                    <button onClick={() => setAuthModal('register')} className="inline-block px-8 py-3.5 bg-white text-emerald-700 rounded-xl font-semibold text-base hover:bg-gray-50 transition-all shadow-lg hover:-translate-y-0.5">
                      Get Started Free
                    </button>
                  ) : (
                    <Link to="/app/dashboard" className="inline-block px-8 py-3.5 bg-white text-emerald-700 rounded-xl font-semibold text-base hover:bg-gray-50 transition-all shadow-lg hover:-translate-y-0.5">
                      Go to Dashboard
                    </Link>
                  )}
                </div>
              </div>
            </AnimateIn>
          </div>
        </section>

      </main>
      <Footer />
    </div>
  );
};

export default Home;
