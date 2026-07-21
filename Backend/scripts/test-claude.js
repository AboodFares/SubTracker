/**
 * Test script: can we call the Anthropic (Claude) API?
 *
 * Usage:  node scripts/test-claude.js
 *
 * What the errors mean:
 * - 401 authentication_error = ANTHROPIC_API_KEY in .env is missing/invalid
 * - 429 rate_limit_error    = plan/quota limits — wait or check your plan
 *
 * Get a key at: https://platform.claude.com/settings/keys
 */
require('dotenv').config();

const key = process.env.ANTHROPIC_API_KEY;
if (!key) {
  console.error('ANTHROPIC_API_KEY is not set in .env');
  process.exit(1);
}
console.log(`Key loaded (${key.slice(0, 12)}...${key.slice(-4)})`);

const Anthropic = require('@anthropic-ai/sdk');
const anthropic = new Anthropic({ apiKey: key });

(async () => {
  console.log('Calling Claude (model: claude-haiku-4-5)...');
  try {
    const r = await anthropic.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 32,
      messages: [{ role: 'user', content: 'Reply with the single word: ok' }]
    });
    const text = r.content.find((b) => b.type === 'text')?.text;
    console.log('Anthropic API OK. Reply:', text);
    console.log('Usage:', JSON.stringify(r.usage));
  } catch (err) {
    console.error('Anthropic error:');
    console.error(`  status: ${err.status}`);
    console.error(`  message: ${err.message}`);
    process.exit(1);
  }
})();
