import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getLogoUrl } from '../utils/brandLogo';
import Header from './Header';
import Footer from './Footer';

const brandNames = ['Netflix', 'Spotify', 'Apple', 'YouTube', 'Disney+', 'Adobe', 'Amazon', 'ChatGPT'];

const features = [
  {
    title: 'Smart AI Detection',
    description: 'Our AI reads your emails and bank statements to automatically find and categorize every subscription you have.',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" />
      </svg>
    ),
    glow: 'from-indigo-500/20 to-purple-500/20',
    iconBg: 'from-indigo-500 to-purple-500'
  },
  {
    title: 'Spending Insights',
    description: 'See your total monthly and yearly costs at a glance. Track every dollar across all your active subscriptions.',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
      </svg>
    ),
    glow: 'from-emerald-500/20 to-teal-500/20',
    iconBg: 'from-emerald-500 to-teal-500'
  },
  {
    title: 'Renewal Alerts',
    description: 'Get notified 5 days before any subscription renews. Never get surprised by an unexpected charge again.',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
      </svg>
    ),
    glow: 'from-orange-500/20 to-amber-500/20',
    iconBg: 'from-orange-500 to-amber-500'
  }
];

const steps = [
  { num: '1', title: 'Create Account', desc: 'Sign up in seconds with Google OAuth' },
  { num: '2', title: 'Connect Sources', desc: 'Link Gmail, upload statements, or connect your bank' },
  { num: '3', title: 'AI Detects', desc: 'Our AI scans and identifies all recurring charges' },
  { num: '4', title: 'Stay in Control', desc: 'Track, manage, and get alerts for every subscription' }
];

const stats = [
  { value: '3', label: 'Detection Sources', sub: 'Email, Bank, Statements' },
  { value: 'AI', label: 'Powered by GPT-4', sub: 'Smart extraction' },
  { value: '5d', label: 'Early Alerts', sub: 'Before every renewal' },
  { value: 'Free', label: 'To Get Started', sub: 'No credit card needed' }
];

const Home = () => {
  const { isAuthenticated } = useAuth();

  return (
    <div className="min-h-screen flex flex-col bg-gray-950 text-white">
      <Header />
      <main className="flex-1">

        {/* ===== HERO ===== */}
        <section className="relative overflow-hidden">
          {/* Glow effects */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-gradient-to-b from-indigo-500/15 via-purple-500/10 to-transparent rounded-full blur-3xl pointer-events-none" />
          <div className="absolute top-40 left-1/4 w-[400px] h-[400px] bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute top-40 right-1/4 w-[400px] h-[400px] bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

          <div className="relative max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-28 pb-20 text-center">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-white/10 bg-white/5 backdrop-blur-sm mb-8">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-sm text-gray-300">AI-powered subscription tracking</span>
            </div>

            <h1 className="text-5xl sm:text-6xl md:text-7xl font-bold tracking-tight leading-[1.1] mb-6">
              <span className="text-white">Never lose track of</span>
              <br />
              <span className="bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
                your subscriptions
              </span>
            </h1>

            <p className="text-lg sm:text-xl text-gray-400 max-w-2xl mx-auto mb-10 leading-relaxed">
              Connect your Gmail and bank statements. Our AI automatically detects,
              categorizes, and tracks every recurring charge — so you always know where your money goes.
            </p>

            {!isAuthenticated ? (
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link
                  to="/register"
                  className="px-8 py-3.5 bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-xl font-semibold text-base hover:from-indigo-400 hover:to-purple-400 transition-all shadow-lg shadow-indigo-500/25 hover:shadow-indigo-500/40 hover:-translate-y-0.5"
                >
                  Get Started Free
                </Link>
                <Link
                  to="/login"
                  className="px-8 py-3.5 border border-white/20 text-white rounded-xl font-semibold text-base hover:bg-white/10 transition-all"
                >
                  Sign In
                </Link>
              </div>
            ) : (
              <Link
                to="/app/dashboard"
                className="inline-block px-8 py-3.5 bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-xl font-semibold text-base hover:from-indigo-400 hover:to-purple-400 transition-all shadow-lg shadow-indigo-500/25 hover:shadow-indigo-500/40 hover:-translate-y-0.5"
              >
                Go to Dashboard
              </Link>
            )}
          </div>

          {/* Brand logos marquee */}
          <div className="relative max-w-4xl mx-auto pb-20">
            <p className="text-center text-sm text-gray-500 mb-6 uppercase tracking-widest">Track subscriptions from</p>
            {/* Fade edges */}
            <div className="relative overflow-hidden">
              <div className="absolute left-0 top-0 bottom-0 w-20 bg-gradient-to-r from-gray-950 to-transparent z-10 pointer-events-none" />
              <div className="absolute right-0 top-0 bottom-0 w-20 bg-gradient-to-l from-gray-950 to-transparent z-10 pointer-events-none" />
              <div className="flex animate-marquee w-max gap-12 items-center">
                {[...brandNames, ...brandNames].map((name, i) => (
                  <img
                    key={`${name}-${i}`}
                    src={getLogoUrl(name)}
                    alt={name}
                    className="w-8 h-8 rounded-lg opacity-40 grayscale hover:opacity-100 hover:grayscale-0 transition-all duration-300 flex-shrink-0"
                  />
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ===== FEATURES ===== */}
        <section className="relative py-24 border-t border-white/5">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-16">
              <h2 className="text-3xl sm:text-4xl font-bold mb-4">
                <span className="bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
                  Everything you need
                </span>
              </h2>
              <p className="text-gray-400 max-w-xl mx-auto">
                Powerful tools to find, track, and manage every subscription automatically.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {features.map((f, i) => (
                <div key={i} className="group relative bg-white/[0.03] border border-white/[0.06] rounded-2xl p-8 hover:bg-white/[0.06] hover:border-white/[0.1] transition-all duration-300">
                  {/* Subtle glow on hover */}
                  <div className={`absolute inset-0 rounded-2xl bg-gradient-to-br ${f.glow} opacity-0 group-hover:opacity-100 transition-opacity duration-300 blur-xl -z-10`} />

                  <div className={`w-12 h-12 bg-gradient-to-br ${f.iconBg} rounded-xl flex items-center justify-center mb-5 text-white shadow-lg`}>
                    {f.icon}
                  </div>
                  <h3 className="text-lg font-semibold text-white mb-2">{f.title}</h3>
                  <p className="text-sm text-gray-400 leading-relaxed">{f.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ===== HOW IT WORKS ===== */}
        <section className="relative py-24 border-t border-white/5">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-16">
              <h2 className="text-3xl sm:text-4xl font-bold mb-4 text-white">How it works</h2>
              <p className="text-gray-400">Get started in minutes, not hours.</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {steps.map((s, i) => (
                <div key={i} className="relative text-center">
                  {/* Connecting line (desktop) */}
                  {i < steps.length - 1 && (
                    <div className="hidden lg:block absolute top-7 left-[60%] w-[80%] h-px bg-gradient-to-r from-white/10 to-transparent" />
                  )}
                  <div className="w-14 h-14 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-2xl flex items-center justify-center mx-auto mb-4 text-white text-xl font-bold shadow-lg shadow-indigo-500/20">
                    {s.num}
                  </div>
                  <h3 className="text-base font-semibold text-white mb-1">{s.title}</h3>
                  <p className="text-sm text-gray-500">{s.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ===== STATS ===== */}
        <section className="relative py-24 border-t border-white/5">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
              {stats.map((s, i) => (
                <div key={i} className="text-center p-6 rounded-2xl bg-white/[0.03] border border-white/[0.06]">
                  <div className="text-3xl font-bold bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent mb-1">
                    {s.value}
                  </div>
                  <div className="text-sm font-medium text-white mb-0.5">{s.label}</div>
                  <div className="text-xs text-gray-500">{s.sub}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ===== FINAL CTA ===== */}
        <section className="relative py-24">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="relative rounded-3xl overflow-hidden">
              {/* Gradient background */}
              <div className="absolute inset-0 bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-600 opacity-90" />
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(255,255,255,0.15),transparent_50%)]" />

              <div className="relative px-8 py-16 sm:px-16 text-center">
                <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
                  Ready to take control?
                </h2>
                <p className="text-lg text-white/70 mb-8 max-w-lg mx-auto">
                  Stop overpaying for forgotten subscriptions. Start tracking in under a minute.
                </p>
                {!isAuthenticated ? (
                  <Link
                    to="/register"
                    className="inline-block px-8 py-3.5 bg-white text-gray-900 rounded-xl font-semibold text-base hover:bg-gray-100 transition-all shadow-lg hover:-translate-y-0.5"
                  >
                    Get Started Free
                  </Link>
                ) : (
                  <Link
                    to="/app/dashboard"
                    className="inline-block px-8 py-3.5 bg-white text-gray-900 rounded-xl font-semibold text-base hover:bg-gray-100 transition-all shadow-lg hover:-translate-y-0.5"
                  >
                    Go to Dashboard
                  </Link>
                )}
                <p className="text-sm text-white/50 mt-4">No credit card required</p>
              </div>
            </div>
          </div>
        </section>

      </main>
      <Footer />
    </div>
  );
};

export default Home;
