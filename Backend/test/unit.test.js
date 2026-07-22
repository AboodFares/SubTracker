/**
 * Unit tests — pure logic, no network and no database.
 *
 * These cover small functions with real business meaning: the transaction
 * line extractor that feeds the ML classifier, and the AI event-type
 * validation used by the email pipeline.
 *
 * Run with:  npm test
 */

const { test } = require('node:test');
const assert = require('node:assert');

const { extractTransactionLines } = require('../services/mlClassifier');
const { isValidEventType, VALID_EVENT_TYPES } = require('../services/aiService');

test('extractTransactionLines pulls transaction lines out of statement text', () => {
  const raw = `
TD CANADA TRUST            Statement Period: Jun 1 - Jun 30
DATE   DESCRIPTION                    WITHDRAWALS   BALANCE
06/02  NETFLIX.COM AMSTERDAM          16.49         2,341.02
06/03  TIM HORTONS #2231 TORONTO      4.85          2,336.17
Page 1 of 2
`;
  const lines = extractTransactionLines(raw);
  assert.strictEqual(lines.length, 2);
  assert.ok(lines[0].includes('NETFLIX'));
  assert.ok(lines[1].includes('TIM HORTONS'));
});

test('extractTransactionLines skips headers, short lines, and duplicates', () => {
  const raw = `
06/02  NETFLIX.COM  16.49
06/02  NETFLIX.COM  16.49
Total withdrawals: none
x 1.00
`;
  const lines = extractTransactionLines(raw);
  // duplicate collapses to one; "x 1.00" has too few letters; "Total..." line has no amount
  assert.strictEqual(lines.length, 1);
  assert.ok(lines[0].includes('NETFLIX'));
});

test('isValidEventType accepts only the four known event types', () => {
  for (const type of VALID_EVENT_TYPES) {
    assert.strictEqual(isValidEventType(type), true);
  }
  assert.strictEqual(isValidEventType('purchase'), false);
  assert.strictEqual(isValidEventType(''), false);
  assert.strictEqual(isValidEventType(null), false);
});
