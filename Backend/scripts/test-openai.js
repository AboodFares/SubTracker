/**
 * Test script: can we call the OpenAI API?
 * Run from Backend folder: node scripts/test-openai.js
 *
 * Helps distinguish:
 * - 401 = bad or missing API key
 * - 429 insufficient_quota = account/plan/billing on OpenAI's side (e.g. add payment method for free tier)
 * - 429 rate_limit_exceeded = too many requests (different from quota)
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const key = process.env.OPENAI_API_KEY;
console.log('OPENAI_API_KEY:', key ? `set (starts with ${key.slice(0, 10)}..., length ${key.length})` : 'NOT SET');

if (!key) {
  console.error('Add OPENAI_API_KEY to Backend/.env and run again.');
  process.exit(1);
}

const OpenAI = require('openai');
const openai = new OpenAI({ apiKey: key });

async function run() {
  console.log('Calling OpenAI chat.completions.create (model: gpt-4o-mini)...');
  try {
    const r = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'Reply with exactly: OK' }],
      max_tokens: 10
    });
    console.log('OpenAI API OK. Reply:', r.choices[0]?.message?.content || r);
  } catch (e) {
    console.error('OpenAI error:');
    console.error('  status:', e.status);
    console.error('  code:', e.code);
    console.error('  type:', e.type);
    console.error('  message:', e.message);
    if (e.error && typeof e.error === 'object') {
      console.error('  error body:', JSON.stringify(e.error, null, 2));
    }
    if (e.status === 429 && (e.code === 'insufficient_quota' || e.type === 'insufficient_quota')) {
      console.error('\n→ 429 insufficient_quota usually means:');
      console.error('  1. Free tier: add a payment method at https://platform.openai.com/settings/organization/billing');
      console.error('  2. This API key or org has no credits / $0 spend limit');
      console.error('  3. Create a new API key at https://platform.openai.com/api-keys and try again');
    }
    if (e.status === 401) {
      console.error('\n→ 401: Check OPENAI_API_KEY in .env. Create key at https://platform.openai.com/api-keys');
    }
    process.exit(1);
  }
}

run();
