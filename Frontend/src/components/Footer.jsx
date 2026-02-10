import { Link } from 'react-router-dom';
import { FaGithub, FaLinkedinIn, FaTwitter, FaInstagram } from 'react-icons/fa';

const socialLinks = [
  { href: 'https://github.com', icon: FaGithub, label: 'GitHub' },
  { href: 'https://linkedin.com', icon: FaLinkedinIn, label: 'LinkedIn' },
  { href: 'https://twitter.com', icon: FaTwitter, label: 'Twitter' },
  { href: 'https://instagram.com', icon: FaInstagram, label: 'Instagram' },
];

const Footer = () => {
  return (
    <footer className="bg-gray-950 text-gray-400 border-t border-white/5">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Brand */}
          <div className="md:col-span-2">
            <Link to="/" className="inline-block text-lg font-bold text-white mb-4 hover:opacity-80 transition-opacity">
              Sub-Tracker
            </Link>
            <p className="text-sm text-gray-500 max-w-sm leading-relaxed">
              Automatically track and manage all your subscriptions in one place. Connect your bank and Gmail for smarter subscription detection.
            </p>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="text-sm font-semibold text-white uppercase tracking-wider mb-4">Quick Links</h4>
            <ul className="space-y-3">
              <li>
                <Link to="/" className="text-gray-500 hover:text-indigo-400 transition-colors text-sm">Home</Link>
              </li>
              <li>
                <a href="#features" className="text-gray-500 hover:text-indigo-400 transition-colors text-sm">Features</a>
              </li>
              <li>
                <a href="#" className="text-gray-500 hover:text-indigo-400 transition-colors text-sm">Privacy Policy</a>
              </li>
              <li>
                <a href="#" className="text-gray-500 hover:text-indigo-400 transition-colors text-sm">Terms of Service</a>
              </li>
            </ul>
          </div>

          {/* Social */}
          <div>
            <h4 className="text-sm font-semibold text-white uppercase tracking-wider mb-4">Follow Us</h4>
            <div className="flex gap-3">
              {socialLinks.map(({ href, icon: Icon, label }) => (
                <a
                  key={label}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={label}
                  className="w-10 h-10 rounded-lg bg-white/5 border border-white/5 hover:bg-indigo-500/20 hover:border-indigo-500/30 flex items-center justify-center text-gray-500 hover:text-indigo-400 transition-all duration-200"
                >
                  <Icon className="w-4 h-4" />
                </a>
              ))}
            </div>
          </div>
        </div>

        {/* Bottom */}
        <div className="mt-10 pt-8 border-t border-white/5 flex flex-col sm:flex-row justify-between items-center gap-4">
          <p className="text-sm text-gray-600">
            &copy; 2026 Sub-Tracker. All rights reserved.
          </p>
          <p className="text-xs text-gray-700">
            Bank linking via Plaid &bull; Gmail integration for smart detection
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
