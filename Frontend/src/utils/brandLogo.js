// Maps tricky brand names to their actual domains
const DOMAIN_OVERRIDES = {
  'apple': 'apple.com',
  'icloud': 'apple.com',
  'apple tv': 'apple.com',
  'apple tv+': 'apple.com',
  'apple music': 'apple.com',
  'apple one': 'apple.com',
  'disney+': 'disneyplus.com',
  'disney plus': 'disneyplus.com',
  'disney': 'disneyplus.com',
  'hbo': 'hbomax.com',
  'hbo max': 'hbomax.com',
  'max': 'max.com',
  'prime video': 'amazon.com',
  'amazon prime': 'amazon.com',
  'amazon': 'amazon.com',
  'google one': 'google.com',
  'google': 'google.com',
  'youtube': 'youtube.com',
  'youtube premium': 'youtube.com',
  'youtube music': 'youtube.com',
  'microsoft': 'microsoft.com',
  'microsoft 365': 'microsoft.com',
  'office 365': 'microsoft.com',
  'xbox': 'xbox.com',
  'xbox game pass': 'xbox.com',
  'chatgpt': 'openai.com',
  'openai': 'openai.com',
  'claude': 'anthropic.com',
  'anthropic': 'anthropic.com',
  'crave': 'crave.ca',
  'paramount+': 'paramountplus.com',
  'paramount plus': 'paramountplus.com',
  'peacock': 'peacocktv.com',
  'adobe creative cloud': 'adobe.com',
  'creative cloud': 'adobe.com',
  'doordash': 'doordash.com',
  'dashpass': 'doordash.com',
  'uber eats': 'ubereats.com',
  'uber one': 'uber.com',
  'uber': 'uber.com',
};

/**
 * Converts a company name to a domain string.
 */
function getDomain(companyName) {
  const key = companyName.trim().toLowerCase();
  const override = DOMAIN_OVERRIDES[key];
  if (override) return override;
  return key.replace(/[^a-z0-9]/g, '') + '.com';
}

/**
 * Returns a Google favicon URL for the brand (always works, 128px).
 */
export function getLogoUrl(companyName) {
  const domain = getDomain(companyName);
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
}
