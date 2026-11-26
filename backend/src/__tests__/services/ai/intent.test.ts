import { describe, it } from 'node:test';
import assert from 'node:assert';
import { interpretTranscript } from '../../../services/ai/intentService.js';

describe('AI intent service - interpretTranscript', () => {
  it('returns GET_BALANCE with confidence 0 for empty transcript', async () => {
    const result = await interpretTranscript('');
    assert.strictEqual(result.intent, 'GET_BALANCE');
    assert.strictEqual(result.confidence, 0);
    assert.ok(result.missingFields.includes('transcript'));
    assert.ok(result.missingFields.includes('customerName'));
  });

  it('returns ADD_CREDIT for Hindi credit phrase', async () => {
    const result = await interpretTranscript('Raju ko 450 rupaye ka samaan udhaar diya.');
    assert.strictEqual(result.intent, 'ADD_CREDIT');
    assert.strictEqual(result.customerName, 'Raju');
    assert.strictEqual(result.amount, 450);
    assert.strictEqual(result.confidence, 0.9);
  });

  it('handles reported Hindi/Devanagari payment phrase', async () => {
    const result = await interpretTranscript('हेलो राहुल को मैं 450 दिए');
    assert.strictEqual(result.intent, 'RECORD_PAYMENT');
    assert.strictEqual(result.customerName, 'राहुल');
    assert.strictEqual(result.amount, 450);
    assert.strictEqual(result.confidence, 0.9);
    assert.deepStrictEqual(result.missingFields, []);
  });

  it('returns ADD_CREDIT for English credit phrase', async () => {
    const result = await interpretTranscript('Raju owes 200 rupees.');
    assert.strictEqual(result.intent, 'ADD_CREDIT');
    assert.strictEqual(result.customerName, 'Raju');
    assert.strictEqual(result.amount, 200);
  });

  it('classifies payment phrase as RECORD_PAYMENT (not ADD_CREDIT)', async () => {
    const result = await interpretTranscript('Raju ne 200 rupaye de diye.');
    assert.strictEqual(result.intent, 'RECORD_PAYMENT');
    assert.strictEqual(result.customerName, 'Raju');
    assert.strictEqual(result.amount, 200);
    assert.strictEqual(result.confidence, 0.9);
  });

  it('returns GET_BALANCE for balance inquiry in Hinglish', async () => {
    const result = await interpretTranscript('Raju ka kitna udhaar hai?');
    assert.strictEqual(result.intent, 'GET_BALANCE');
    assert.strictEqual(result.customerName, 'Raju');
  });

  it('returns GET_TOTAL_OUTSTANDING for total outstanding query', async () => {
    const result = await interpretTranscript('Total outstanding kitna hai?');
    assert.strictEqual(result.intent, 'GET_TOTAL_OUTSTANDING');
  });

  it('returns GET_TODAY_TRANSACTIONS for today transactions query', async () => {
    const result = await interpretTranscript('Aaj ke transactions dikhao.');
    assert.strictEqual(result.intent, 'GET_TODAY_TRANSACTIONS');
  });

  it('returns GET_CUSTOMER_TRANSACTIONS for customer transactions query', async () => {
    const result = await interpretTranscript('Raju ke transactions dikhao.');
    assert.strictEqual(result.intent, 'GET_CUSTOMER_TRANSACTIONS');
    assert.strictEqual(result.customerName, 'Raju');
  });

  it('extracts amount from rupees-prefixed Hindi text', async () => {
    const result = await interpretTranscript('Raju ko 500 rupaye dene hain.');
    assert.strictEqual(result.amount, 500);
  });

  it('sets missingFields when customerName is missing', async () => {
    const result = await interpretTranscript('500 rupaye udhaar diya.');
    assert.ok(result.missingFields.includes('customerName'));
  });

  it('sets missingFields when amount is missing for write intent', async () => {
    const result = await interpretTranscript('Raju ko udhaar diya.');
    assert.ok(result.missingFields.includes('amount'));
  });

  it('returns confidence 0.9 when amount and customerName present', async () => {
    const result = await interpretTranscript('Raju ko 450 rupaye ka samaan udhaar diya.');
    assert.strictEqual(result.confidence, 0.9);
  });

  it('returns confidence 0 for unknown/ambiguous input', async () => {
    const result = await interpretTranscript('some random text without details');
    assert.strictEqual(result.confidence, 0);
    assert.ok(result.missingFields.includes('customerName'));
  });

  it('returns GET_BALANCE (safe fallback) for unknown input without inventing a financial write', async () => {
    const result = await interpretTranscript('blah blah blah unknown');
    // Safe fallback is a read-only intent, not ADD_CREDIT
    assert.strictEqual(result.intent, 'GET_BALANCE');
    assert.strictEqual(result.confidence, 0);
    assert.ok(result.missingFields.includes('intent'));
  });

  it('defaults to safe fallback for ambiguous input with no clear intent', async () => {
    const result = await interpretTranscript('maybe something');
    assert.strictEqual(result.intent, 'GET_BALANCE');
    assert.strictEqual(result.confidence, 0);
    assert.ok(result.missingFields.includes('intent'));
  });

  it('does not classify amount-only sentence as balance lookup', async () => {
    const result = await interpretTranscript('450');
    assert.strictEqual(result.confidence, 0);
    assert.ok(result.missingFields.includes('intent'));
    assert.ok(result.missingFields.includes('customerName'));
  });

  it('description defaults to Ledger update when cleaning removes all meaningful text', async () => {
    const result = await interpretTranscript('Raju ko 450 rupaye.');
    assert.strictEqual(result.description, 'Ledger update');
  });

  it('credit vs payment overlap: "de diya" maps to RECORD_PAYMENT not ADD_CREDIT', async () => {
    const result = await interpretTranscript('Raju ne 300 de diya.');
    assert.strictEqual(result.intent, 'RECORD_PAYMENT');
    assert.strictEqual(result.amount, 300);
  });

  it('credit vs payment overlap: "diye" alone maps to RECORD_PAYMENT', async () => {
    const result = await interpretTranscript('Raju ko 500 diye');
    assert.strictEqual(result.intent, 'RECORD_PAYMENT');
    assert.strictEqual(result.amount, 500);
  });

  it('balance query with "udhaar" is not classified as credit', async () => {
    const result = await interpretTranscript('Raju ka kitna baki hai?');
    assert.strictEqual(result.intent, 'GET_BALANCE');
    assert.strictEqual(result.confidence, 0.9);
  });

  it('ADD_CREDIT for "lene hain" (need to take from customer)', async () => {
    const result = await interpretTranscript('Raju se 500 lene hain.');
    assert.strictEqual(result.intent, 'ADD_CREDIT');
    assert.strictEqual(result.customerName, 'Raju');
    assert.strictEqual(result.amount, 500);
  });

  // Customer-name extraction: name at end of sentence
  it('extracts customer name when name appears at end ("Add 500 credit for Raju")', async () => {
    const result = await interpretTranscript('Add 500 credit for Raju.');
    assert.strictEqual(result.intent, 'ADD_CREDIT');
    assert.strictEqual(result.customerName, 'Raju');
    assert.strictEqual(result.amount, 500);
  });

  // Customer-name extraction: multi-word name
  it('extracts multi-word customer name', async () => {
    const result = await interpretTranscript('Raju Sharma ko 500 diye.');
    assert.strictEqual(result.intent, 'RECORD_PAYMENT');
    assert.strictEqual(result.customerName, 'Raju Sharma');
    assert.strictEqual(result.amount, 500);
  });

  // Amount extraction: numeric with comma
  it('extracts numeric amount with comma separator', async () => {
    const result = await interpretTranscript('Raju ko 1,500 rupaye diye.');
    assert.strictEqual(result.amount, 1500);
  });

  // Amount extraction: currency-prefixed (₹)
  it('extracts rupee-symbol-prefixed amount', async () => {
    const result = await interpretTranscript('Raju ko ₹500 diye.');
    assert.strictEqual(result.amount, 500);
  });

  // Amount extraction: currency-prefixed (Rs.)
  it('extracts Rs.-prefixed amount', async () => {
    const result = await interpretTranscript('Raju ko Rs. 500 diye.');
    assert.strictEqual(result.amount, 500);
  });

  // Amount extraction: currency-suffixed
  it('extracts rupees-suffixed amount', async () => {
    const result = await interpretTranscript('Raju ko 500 rupees diye.');
    assert.strictEqual(result.amount, 500);
  });

  // Amount extraction: Hindi spoken number "panch sau" (500)
  it('extracts Hindi spoken number "panch sau"', async () => {
    const result = await interpretTranscript('Raju ko panch sau rupaye diye.');
    assert.strictEqual(result.amount, 500);
  });

  // Amount extraction: Hinglish spoken number "do hazar" (2000)
  it('extracts Hinglish spoken number "do hazar"', async () => {
    const result = await interpretTranscript('Raju ko do hazar rupaye diye.');
    assert.strictEqual(result.amount, 2000);
  });

  // Description cleanup: no leftover numbers/punctuation
  it('description does not contain leftover numbers or punctuation', async () => {
    const result = await interpretTranscript('Raju ko 450 rupaye.');
    assert.strictEqual(result.description, 'Ledger update');
  });

  // Description cleanup: leftover text after removing name/amount/currency
  // "samaan" (goods/items) is a transaction-related word that gets removed,
  // leaving nothing meaningful → default description
  it('description defaults to Ledger update when all text is transaction-related', async () => {
    const result = await interpretTranscript('Raju ko 450 rupaye ka samaan udhaar diya.');
    assert.strictEqual(result.description, 'Ledger update');
  });

  // Confidence: unknown/fallback intent is 0
  it('unknown input has confidence 0', async () => {
    const result = await interpretTranscript('blah blah blah unknown');
    assert.strictEqual(result.confidence, 0);
  });

  // Confidence: read intent without amount is not penalized
  it('read intent (GET_TOTAL_OUTSTANDING) has high confidence without amount', async () => {
    const result = await interpretTranscript('Total outstanding kitna hai?');
    assert.strictEqual(result.intent, 'GET_TOTAL_OUTSTANDING');
    assert.strictEqual(result.confidence, 0.9);
    assert.ok(!result.missingFields.includes('amount'));
  });

  // Confidence: write intent missing customerName gets lower confidence
  it('write intent missing customerName has reduced confidence', async () => {
    const result = await interpretTranscript('500 rupaye diye.');
    assert.strictEqual(result.intent, 'RECORD_PAYMENT');
    assert.ok(!result.customerName);
    assert.strictEqual(result.amount, 500);
    assert.strictEqual(result.confidence, 0.5);
    assert.ok(result.missingFields.includes('customerName'));
  });

  // Confidence: all values are between 0 and 1
  it('confidence is always between 0 and 1', async () => {
    const inputs = [
      '',
      'Raju ko 450 rupaye ka samaan udhaar diya.',
      'Raju ne 200 rupaye de diye.',
      'Raju ka kitna udhaar hai?',
      'Total outstanding kitna hai?',
      'Aaj ke transactions dikhao.',
      'Raju ke transactions dikhao.',
      'some random text without details',
      '500 rupaye diye.',
      'Raju ko udhaar diya.',
    ];
    for (const input of inputs) {
      const result = await interpretTranscript(input);
      assert.ok(result.confidence >= 0 && result.confidence <= 1,
        `Confidence ${result.confidence} out of range for input: ${input}`);
    }
  });
});
