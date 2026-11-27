export type ParsedIntent = {
  intent:
    | 'ADD_CREDIT'
    | 'RECORD_PAYMENT'
    | 'ADD_SALE'
    | 'ADD_EXPENSE'
    | 'ADD_CUSTOMER'
    | 'GET_BALANCE'
    | 'GET_TOTAL_OUTSTANDING'
    | 'GET_TODAY_TRANSACTIONS'
    | 'GET_CUSTOMER_TRANSACTIONS';
  customerName?: string;
  amount?: number;
  description?: string;
  confidence: number;
  missingFields: string[];
};

const HINGLISH_NUMBER_WORDS: Record<string, number> = {
  zero: 0, shunya: 0, ek: 1, one: 1, do: 2, two: 2, teen: 3, tin: 3, three: 3,
  char: 4, chaar: 4, four: 4, paanch: 5, panch: 5, pach: 5, five: 5,
  chhe: 6, che: 6, chhah: 6, six: 6, saat: 7, sat: 7, seven: 7,
  aath: 8, ath: 8, eight: 8, nau: 9, nine: 9, das: 10, ten: 10,
  gyarah: 11, eleven: 11, barah: 12, twelve: 12, terah: 13, thirteen: 13,
  chaudah: 14, fourteen: 14, pandrah: 15, fifteen: 15, solah: 16, sixteen: 16,
  satarah: 17, seventeen: 17, atharah: 18, eighteen: 18, unnis: 19, nineteen: 19,
  bees: 20, twenty: 20, tees: 30, thirty: 30, chalis: 40, forty: 40,
  pachas: 50, fifty: 50, saath: 60, sixty: 60, sattar: 70, seventy: 70,
  assi: 80, eighty: 80, nabbe: 90, ninety: 90,
  sau: 100, hundred: 100, hazar: 1000, hazaar: 1000, thousand: 1000, lakh: 100000, crore: 10000000,
};

const DEVANAGARI_DIGITS: Record<string, string> = {
  '०': '0', '१': '1', '२': '2', '३': '3', '४': '4', '५': '5', '६': '6', '७': '7', '८': '8', '९': '9',
};

const DEVANAGARI_NUMBER_WORDS: Record<string, number> = {
  'शून्य': 0, 'एक': 1, 'दो': 2, 'तीन': 3, 'चार': 4, 'पांच': 5, 'पाँच': 5, 'छह': 6, 'छः': 6,
  'सात': 7, 'आठ': 8, 'नौ': 9, 'दस': 10, 'ग्यारह': 11, 'बारह': 12, 'तेरह': 13, 'चौदह': 14,
  'पंद्रह': 15, 'सोलह': 16, 'सत्रह': 17, 'अठारह': 18, 'उन्नीस': 19, 'बीस': 20, 'तीस': 30,
  'चालीस': 40, 'पचास': 50, 'साठ': 60, 'सत्तर': 70, 'अस्सी': 80, 'नब्बे': 90,
  'सौ': 100, 'हजार': 1000, 'हज़ार': 1000, 'लाख': 100000, 'करोड़': 10000000,
};

const MULTIPLIERS = new Set([100, 1000, 100000, 10000000]);

const FILLER_PATTERNS: RegExp[] = [
  /\b(?:hello|hi|hey|ok|okay|please|pls|yaar|bhai|sir|madam|ji)\b/gi,
  /(?:^|\s)(?:हेलो|हाय|अरे|अच्छा|ठीक|कृपया|प्लीज|जी|यार|भाई|साहब)(?=\s|$)/g,
];

const CREDIT_CUES = ['udhaar', 'udhar', 'credit', 'loan', 'borrow', 'khata', 'khaata', 'owes', 'owe', 'due from', 'उधार', 'क्रेडिट', 'खाता', 'खाते'];
const PAYMENT_CUES = [
  'payment', 'paid', 'pay', 'received', 'receive', 'collect', 'collected', 'jama', 'jamaa', 'vasool', 'wasool',
  'de diye', 'de diya', 'de di', 'de do', 'diye', 'diya', 'dediye', 'dediya', 'paid kiya',
  'भुगतान', 'जमा', 'वसूल', 'दे दिए', 'दे दिया', 'दिए', 'दिया', 'दे दी', 'दे दो', 'मिला', 'मिले',
];
const SALE_CUES = ['sale', 'sold', 'sell', 'bech', 'bik', 'bill', 'invoice', 'बिक्री', 'बेचा', 'बेची', 'बिका', 'बिल'];
const EXPENSE_CUES = ['kharcha', 'expense', 'spent', 'spend', 'cost', 'purchase', 'buy', 'bought', 'खर्चा', 'खर्च', 'खरीदा', 'खरीदी'];
const CUSTOMER_CUES = ['customer', 'grahak', 'ग्राहक', 'कस्टमर'];
const ADD_CUSTOMER_CUES = [
  'new customer', 'add customer', 'create customer', 'customer add', 'customer create',
  'naya grahak', 'naya customer', 'grahak jodo', 'grahak banao', 'grahak bana', 'grahak jod',
  'customer jodo', 'customer banao', 'customer bana',
  'नया ग्राहक', 'नए ग्राहक', 'ग्राहक जोड़ो', 'ग्राहक जोड़', 'ग्राहक बनाओ', 'ग्राहक बनाना', 'ग्राहक बनाएं', 'ग्राहक बनाइए',
  'कस्टमर जोड़ो', 'कस्टमर बनाओ', 'नया कस्टमर',
];
const BALANCE_CUES = ['balance', 'baki', 'baaki', 'outstanding', 'due', 'kitna', 'kitne', 'hisaab', 'hisab', 'account', 'बकाया', 'बाकी', 'हिसाब', 'कितना', 'कितने', 'बैलेंस'];
const TOTAL_OUTSTANDING_CUES = ['total outstanding', 'total baki', 'total baaki', 'sab baki', 'sab ka baki', 'sab ka outstanding', 'kul baki', 'kul udhaar', 'कुल बकाया', 'कुल बाकी', 'सबका बकाया', 'सब का बकाया', 'सब बकाया'];
const TODAY_CUES = ['today', 'aaj', 'aaj ke', 'aaj ki', 'आज', 'आज के', 'आज की'];
const TRANSACTION_LIST_CUES = ['transactions', 'transaction', 'history', 'entries', 'ledger', 'list', 'लेनदेन', 'ट्रांजैक्शन', 'हिस्ट्री', 'सूची'];

function normalizeDevanagariDigits(text: string): string {
  return text.replace(/[०-९]/g, (d) => DEVANAGARI_DIGITS[d] ?? d);
}

function normalizeTranscript(input: string): string {
  let text = normalizeDevanagariDigits(String(input ?? ''));
  text = text
    .replace(/[""'`]/g, ' ')
    .replace(/₹/g, ' rs ')
    .replace(/\b(?:rs\.?|inr)\b/gi, ' rs ')
    .replace(/\b(?:rupaye|rupya|rupay|rupees|rupee)\b/gi, ' rs ')
    .replace(/(?:रुपये|रुपया|रु\.?)/g, ' rs ')
    .replace(/(\d),(?=\d)/g, '$1')
    .replace(/[|।,!?;:()[\]{}]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  for (const pattern of FILLER_PATTERNS) text = text.replace(pattern, ' ');
  text = text.replace(/(\d),(?=\d)/g, '$1');
  return text.replace(/\s+/g, ' ').trim();
}

function includesAny(text: string, cues: string[]): boolean {
  const lower = text.toLowerCase();
  return cues.some((cue) => {
    if (/[\u0900-\u097F]/.test(cue)) return text.includes(cue);
    const escaped = cue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
    return new RegExp(`(?:^|\\b|\\s)${escaped}(?=$|\\b|\\s)`, 'i').test(lower);
  });
}

function parseNumericAmount(text: string): number | null {
  const patterns = [
    /(?:\b(?:rs)\s*)([0-9]+(?:,[0-9]{2,3})*(?:\.[0-9]+)?)/i,
    /([0-9]+(?:,[0-9]{2,3})*(?:\.[0-9]+)?)\s*(?:rs\b|₹)/i,
    /\b([0-9]+(?:,[0-9]{2,3})*(?:\.[0-9]+)?)\b/,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      const value = Number(match[1].replace(/,/g, ''));
      if (Number.isFinite(value) && value > 0) return value;
    }
  }
  return null;
}

function tokenToNumber(token: string): number | null {
  const clean = token.toLowerCase().replace(/[^a-z\u0900-\u097F]/g, '');
  if (!clean) return null;
  if (DEVANAGARI_NUMBER_WORDS[clean] !== undefined) return DEVANAGARI_NUMBER_WORDS[clean];
  if (HINGLISH_NUMBER_WORDS[clean] !== undefined) return HINGLISH_NUMBER_WORDS[clean];
  if (/^\d+$/.test(clean)) return Number(clean);
  return null;
}

function parseSpokenAmount(text: string): number | null {
  const tokens = normalizeTranscript(text).toLowerCase().split(/\s+/).filter(Boolean);
  let total = 0;
  let current = 0;
  let sawNumber = false;
  for (const token of tokens) {
    const value = tokenToNumber(token);
    if (value === null) {
      if (sawNumber) { total += current; current = 0; sawNumber = false; }
      continue;
    }
    sawNumber = true;
    if (MULTIPLIERS.has(value)) {
      current = (current === 0 ? 1 : current) * value;
      total += current;
      current = 0;
      continue;
    }
    current += value;
  }
  if (sawNumber) total += current;
  return total > 0 ? total : null;
}

export function parseSpokenNumber(value: string): number | null {
  return parseSpokenAmount(value);
}

function extractAmount(text: string): number | null {
  const normalized = normalizeTranscript(text);
  const numeric = parseNumericAmount(normalized);
  if (numeric !== null) return numeric;
  const amountWindowPatterns = [
    /(?:rs\s*)([a-z\u0900-\u097F\s-]+?)(?=\s+(?:ka|ki|ke|ko|se|ne|diye|diya|de|liye|liya|udhaar|udhar|payment|baki|baaki|due|record|add)\b|$)/i,
    /([a-z\u0900-\u097F\s-]+?)\s*(?:rs\b)/i,
  ];
  for (const pattern of amountWindowPatterns) {
    const match = normalized.match(pattern);
    const candidate = match?.[1]?.trim();
    if (candidate) {
      const parsed = parseSpokenAmount(candidate);
      if (parsed !== null) return parsed;
    }
  }
  return parseSpokenAmount(normalized);
}

function stripAmountAndCurrency(text: string): string {
  return normalizeTranscript(text)
    .replace(/\b(?:rs)\b/gi, ' ')
    .replace(/[0-9]+(?:,[0-9]{2,3})*(?:\.[0-9]+)?/g, ' ')
    .replace(/\b(?:zero|shunya|ek|one|do|two|teen|tin|three|char|chaar|four|paanch|panch|pach|five|chhe|che|chhah|six|saat|sat|seven|aath|ath|eight|nau|nine|das|ten|gyarah|eleven|barah|twelve|terah|thirteen|chaudah|fourteen|pandrah|fifteen|solah|sixteen|satarah|seventeen|atharah|eighteen|unnis|nineteen|bees|twenty|tees|thirty|chalis|forty|pachas|fifty|saath|sixty|sattar|seventy|assi|eighty|nabbe|ninety|sau|hundred|hazar|hazaar|thousand|lakh|crore)\b/gi, ' ')
    .replace(/(?:शून्य|एक|दो|तीन|चार|पांच|पाँच|छह|छः|सात|आठ|नौ|दस|ग्यारह|बारह|तेरह|चौदह|पंद्रह|सोलह|सत्रह|अठारह|उन्नीस|बीस|तीस|चालीस|पचास|साठ|सत्तर|अस्सी|नब्बे|सौ|हजार|हज़ार|लाख|करोड़)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isLikelyNameToken(token: string): boolean {
  return /^[A-Za-z][A-Za-z'.-]*$/.test(token) || /^[\u0900-\u097F][\u0900-\u097F'.-]*$/.test(token);
}

function cleanNameToken(token: string): string {
  return token.replace(/^[^A-Za-z\u0900-\u097F]+|[^A-Za-z\u0900-\u097F'.-]+$/g, '');
}

function normalizeName(name: string): string {
  return name.split(/\s+/).filter(Boolean).map((part) => {
    if (/^[\u0900-\u097F'.-]+$/.test(part)) return part;
    return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
  }).join(' ').trim();
}

function looksLikeCommandPhrase(name: string): boolean {
  const lower = name.toLowerCase();
  return ['total outstanding', 'aaj ke transactions', 'today transactions', 'customer transactions', 'total baki', 'sab baki', 'ledger update'].includes(lower);
}

function extractNameFromPatterns(original: string): string | undefined {
  const text = normalizeDevanagariDigits(original).replace(/\s+/g, ' ').trim();
  const patterns: RegExp[] = [
    /(?:^|\s)([A-Za-z\u0900-\u097F][A-Za-z\u0900-\u097F\s'.-]{1,60}?)(?:\s+(?:ko|se|ka|ke|ki|ne|par|को|से|का|के|की|ने|पर))(?=\s|$)/u,
    /(?:^|\s)(?:for|to|from)\s+([A-Za-z\u0900-\u097F][A-Za-z\u0900-\u097F\s'.-]{1,60}?)(?=\s|$)/iu,
    /(?:^|\s)([A-Za-z\u0900-\u097F][A-Za-z\u0900-\u097F\s'.-]{1,60}?)(?:\s+(?:owes|paid|balance|ka|ke|ki|का|के|की))(?=\s|$)/iu,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    const candidate = match?.[1]?.trim();
    if (!candidate) continue;
    const cleaned = normalizeName(candidate.split(/\s+/).map(cleanNameToken).filter(Boolean).join(' ')).replace(/[.]+$/g, '').trim();
    if (cleaned && !looksLikeCommandPhrase(cleaned)) return cleaned;
  }
  return undefined;
}

function extractCustomerNameForAddCustomer(text: string): string | undefined {
  const normalized = normalizeDevanagariDigits(String(text ?? '')).replace(/\s+/g, ' ').trim();
  const actionWords = new Set(['जोड़ो', 'जोड़', 'बनाओ', 'बनाना', 'बनाएं', 'बनाइए', 'बना', 'add', 'create']);
  const patterns: RegExp[] = [
    /([A-Za-z\u0900-\u097F][A-Za-z\u0900-\u097F\s'.-]{1,60}?)\s+नाम\s+का\s+(?:नया\s+)?(?:ग्राहक|कस्टमर)(?=\s|$)/u,
    /(?:नया|नए)\s+(?:ग्राहक|कस्टमर)\s+([A-Za-z\u0900-\u097F][A-Za-z\u0900-\u097F\s'.-]{1,60}?)(?=\s+(?:जोड़ो|जोड़|बनाओ|बनाना|बनाएं|बनाइए|बना)|$)/u,
    /(?:add|create)\s+(?:a\s+)?(?:new\s+)?customer\s+(?:named\s+)?([A-Za-z\u0900-\u097F][A-Za-z\u0900-\u097F\s'.-]{1,60}?)(?=$|\s)/iu,
    /(?:new)\s+customer\s+(?:named\s+)?([A-Za-z\u0900-\u097F][A-Za-z\u0900-\u097F\s'.-]{1,60}?)(?=$|\s)/iu,
    /(?:ग्राहक|कस्टमर)\s+([A-Za-z\u0900-\u097F][A-Za-z\u0900-\u097F\s'.-]{1,60}?)(?=\s+(?:जोड़ो|जोड़|बनाओ|बनाना|बनाएं|बनाइए|बना)|$)/u,
  ];
  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    const candidate = match?.[1]?.trim();
    if (!candidate) continue;
    const cleaned = normalizeName(candidate.split(/\s+/).map(cleanNameToken).filter(Boolean).join(' ')).replace(/[.]+$/g, '').trim();
    if (!cleaned || looksLikeCommandPhrase(cleaned)) continue;
    if (actionWords.has(cleaned.toLowerCase()) || actionWords.has(candidate.toLowerCase())) continue;
    return cleaned;
  }
  return undefined;
}

function extractCustomerName(text: string, intent: ParsedIntent['intent']): string | undefined {
  if (intent === 'GET_TOTAL_OUTSTANDING' || intent === 'GET_TODAY_TRANSACTIONS') return undefined;
  if (intent === 'ADD_CUSTOMER') return extractCustomerNameForAddCustomer(text) ?? extractNameFromPatterns(text);
  const patterned = extractNameFromPatterns(text);
  if (patterned) return patterned;

  const withoutAmounts = stripAmountAndCurrency(text);
  const scrubbed = withoutAmounts
    .replace(/\b(?:udhaar|udhar|credit|payment|paid|sale|kharcha|expense|balance|baki|baaki|outstanding|due|total|today|aaj|kal|transaction|transactions|history|ledger|customer|add|record|get|show|dikhao|dikha|batao|bataye|kitna|kitne|ka|ki|ke|ko|se|ne|par|liye|liya|lena|dena|de|do|diya|diye|tha|thi|the|hai|hain|ho|hoga|hogaya|gaya|gaye|huye|hui|amount|for|to|from|and|me|mein|main|kya|new|create|named|jodo|banao|bana)\b/gi, ' ')
    .replace(/(?:उधार|क्रेडिट|भुगतान|जमा|बिक्री|खर्चा|खर्च|बकाया|बाकी|हिसाब|कुल|आज|लेनदेन|ट्रांजैक्शन|ग्राहक|कस्टमर|दिखाओ|बताओ|कितना|कितने|का|की|के|को|से|ने|पर|लिया|लिए|देना|दिए|दिया|दे|दो|है|हैं|था|थी|थे|हो|गया|गए|हुए|हुई|में|मैं|सामान|माल|नया|नए|जोड़ो|जोड़|बनाओ|बनाना|बनाएं|बनाइए|बना)\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const tokens = scrubbed.split(/\s+/).map(cleanNameToken).filter(isLikelyNameToken);
  if (tokens.length === 0) return undefined;
  const name = normalizeName(tokens.slice(0, 4).join(' '));
  if (!name || looksLikeCommandPhrase(name)) return undefined;
  return name;
}

function inferIntent(text: string, amount: number | null): { intent: ParsedIntent['intent']; isFallback: boolean; ambiguous: boolean } {
  const normalized = normalizeTranscript(text);
  const lower = normalized.toLowerCase();

  const isTotalOutstanding = includesAny(lower, TOTAL_OUTSTANDING_CUES) || (/\btotal\b/.test(lower) && includesAny(lower, BALANCE_CUES));
  const isToday = includesAny(lower, TODAY_CUES);
  const isTxnList = includesAny(lower, TRANSACTION_LIST_CUES);
  const isBalanceCue = includesAny(lower, BALANCE_CUES);
  const hasPaymentCue = includesAny(lower, PAYMENT_CUES) || /\b(de\s*diya|de\s*diye|diya|diye|dediye|dediya)\b/i.test(lower) || /दे\s*दिया|दे\s*दिए|दिए|दिया/.test(text);
  const hasCreditCue = includesAny(lower, CREDIT_CUES) || /उधार/.test(text);
  const hasSaleCue = includesAny(lower, SALE_CUES);
  const hasExpenseCue = includesAny(lower, EXPENSE_CUES);
  const hasCustomerCue = includesAny(lower, CUSTOMER_CUES);
  const hasAddCustomerCue = includesAny(lower, ADD_CUSTOMER_CUES) || (/\b(add|create|new)\b/i.test(lower) && hasCustomerCue) || (/(?:जोड़|बना|नया|नए)/.test(text) && hasCustomerCue);
  const isQuestion = /\b(kitna|kitne|kitni|kya|kaun|kab|how much|how many|what|show|batao|bataye)\b/i.test(lower) || /[?]|(?:कितना|कितने|कितनी|क्या|कौन|कब|बताओ|बताइए|दिखाओ)/.test(text);

  const creditAction = /\b(udhaar\s+(?:diya|diye|do|dena|de)|udhar\s+(?:diya|diye|do|dena|de)|credit\s+do|khata\s+kholo|khaata\s+kholo|lene\s+hain|lene\s+hai)\b/i.test(lower) || /उधार\s*(?:दिया|दिए|दो|देना|दे|लिखो|चढ़ा|खोलो)/.test(text);
  const paymentAction = /\b(de\s*diya|de\s*diye|de\s*di|de\s*do|dediye|dediya|paid\s*kiya|payment\s*kiya|jama\s*kiya|vasool\s*kiya|mil\s*gaye|mila)\b/i.test(lower) || /(?:दे\s*दिया|दे\s*दिए|दे\s*दी|दे\s*दो|जमा\s*किया|वसूल\s*किया|मिला|मिले)/.test(text);
  const genericGive = /\b(?:diya|diye)\b/i.test(lower) || /(?:दिया|दिए)/.test(text);
  const isPayment = hasPaymentCue || paymentAction || (genericGive && !creditAction);
  const isCredit = hasCreditCue || creditAction;
  const isSale = hasSaleCue;
  const isExpense = hasExpenseCue;
  const isAddCustomer = hasAddCustomerCue && !isQuestion && amount === null;
  const hasWriteCue = isPayment || isCredit || isSale || isExpense || isAddCustomer;

  if (isAddCustomer) return { intent: 'ADD_CUSTOMER', isFallback: false, ambiguous: false };
  if (isTotalOutstanding) return { intent: 'GET_TOTAL_OUTSTANDING', isFallback: false, ambiguous: false };
  if (isToday && isTxnList) return { intent: 'GET_TODAY_TRANSACTIONS', isFallback: false, ambiguous: false };
  if (isTxnList && !hasWriteCue) return { intent: 'GET_CUSTOMER_TRANSACTIONS', isFallback: false, ambiguous: false };
  if (isBalanceCue && (!hasWriteCue || isQuestion)) return { intent: 'GET_BALANCE', isFallback: false, ambiguous: false };

  const writeScores: Record<string, number> = { RECORD_PAYMENT: 0, ADD_CREDIT: 0, ADD_SALE: 0, ADD_EXPENSE: 0 };
  if (isPayment) writeScores.RECORD_PAYMENT += 2;
  if (isCredit) writeScores.ADD_CREDIT += 2;
  if (isSale) writeScores.ADD_SALE += 2;
  if (isExpense) writeScores.ADD_EXPENSE += 2;

  if (paymentAction) writeScores.RECORD_PAYMENT += 2;
  if (creditAction) writeScores.ADD_CREDIT += 2;
  if (hasCreditCue && !paymentAction) writeScores.ADD_CREDIT += 1;
  if (hasPaymentCue && !creditAction) writeScores.RECORD_PAYMENT += 1;

  if (/\b(di(?:ye|ya)|de\s*di(?:ye|ya))\b/i.test(lower) || /(?:दिए|दिया|दे\s*दिए|दे\s*दिया)/.test(text)) {
    if (creditAction && !paymentAction) writeScores.ADD_CREDIT += 1;
    else writeScores.RECORD_PAYMENT += 2;
  }

  const ranked = Object.entries(writeScores).filter(([, s]) => s > 0).sort((a, b) => b[1] - a[1]);
  if (ranked.length > 0) {
    const [topIntent, topScore] = ranked[0];
    const secondScore = ranked[1]?.[1] ?? 0;
    const ambiguous = ranked.length > 1 && topScore === secondScore;
    if (!ambiguous) return { intent: topIntent as ParsedIntent['intent'], isFallback: false, ambiguous: false };

    if (isBalanceCue && hasCreditCue) return { intent: 'GET_BALANCE', isFallback: false, ambiguous: false };
    return { intent: topIntent as ParsedIntent['intent'], isFallback: false, ambiguous: true };
  }

  if (amount !== null) return { intent: 'GET_BALANCE', isFallback: true, ambiguous: true };
  return { intent: 'GET_BALANCE', isFallback: true, ambiguous: true };
}

function inferDescription(text: string, _intent: ParsedIntent['intent'], customerName?: string): string {
  let cleaned = stripAmountAndCurrency(text)
    .replace(/\b(?:ko|se|ka|ke|ki|ne|par|for|to|from|me|mein|main|udhaar|udhar|credit|payment|paid|sale|kharcha|expense|balance|baki|baaki|outstanding|total|today|aaj|kal|transaction|transactions|history|ledger|add|record|get|show|dikhao|dikha|batao|bataye|kitna|kitne|diya|diye|de|do|lena|dene|dena|hai|hain|tha|thi|the|owes|owe|amount|samaan|maal|goods|item|items)\b/gi, ' ')
    .replace(/(?:उधार|भुगतान|जमा|बिक्री|खर्चा|बकाया|बाकी|हिसाब|कुल|आज|कल|लेनदेन|दिखाओ|बताओ|कितना|कितने|को|से|का|के|की|ने|पर|दिया|दिए|दे|दो|लेना|देना|है|हैं|था|थी|में|मैं|सामान|माल)\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  cleaned = cleaned.replace(/[^A-Za-z\u0900-\u097F\s-]/g, ' ').replace(/[.]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!cleaned) return 'Ledger update';
  let tokens = cleaned.split(/\s+/).filter(Boolean);
  const residualStop = new Set(['ledger','update','rs','rupees','rupaye','customer','name','amount','r','ka']);
  tokens = tokens.filter((t) => !residualStop.has(t.toLowerCase()));
  if (customerName) {
    const nameTokens = new Set(customerName.toLowerCase().split(/\s+/).map((t)=>t.replace(/[^a-z\u0900-\u097F]/g,'')).filter(Boolean));
    tokens = tokens.filter((t)=>!nameTokens.has(t.toLowerCase().replace(/[^a-z\u0900-\u097F]/g,'')));
  }
  if (tokens.length === 0) return 'Ledger update';
  if (tokens.length === 1) {
    const t=tokens[0].toLowerCase().replace(/[^a-zऀ-ॿ]/g,'');
    if (customerName) {
      const nameSet=new Set(customerName.toLowerCase().split(/\s+/).map(x=>x.replace(/[^a-zऀ-ॿ]/g,'')).filter(Boolean));
      if(nameSet.has(t)) return 'Ledger update';
    }
    // Single leftover token that looks like a name in ambiguous/fallback text is not useful description.
    if (/^[A-Z][a-z'.-]*$/.test(tokens[0]) || /^[ऀ-ॿ'.-]+$/.test(tokens[0])) return 'Ledger update';
  }
  const joined = tokens.join(' ').trim();
  if (!joined) return 'Ledger update';
  return joined;
}

export async function interpretTranscript(rawTranscript: string): Promise<ParsedIntent> {
  const text = normalizeTranscript(rawTranscript);
  if (!text) {
    return { intent: 'GET_BALANCE', confidence: 0, missingFields: ['transcript', 'customerName'] };
  }

  const amount = extractAmount(text);
  const { intent, isFallback, ambiguous } = inferIntent(text, amount);
  const customerName = isFallback ? undefined : extractCustomerName(text, intent);
  const description = inferDescription(text, intent, customerName);

  const readIntentsNotNeedingCustomer = ['GET_TOTAL_OUTSTANDING', 'GET_TODAY_TRANSACTIONS'];
  const readIntentsNeedingCustomer = ['GET_BALANCE', 'GET_CUSTOMER_TRANSACTIONS'];
  const writeIntents = ['ADD_CREDIT', 'RECORD_PAYMENT', 'ADD_SALE', 'ADD_EXPENSE'];

  const customerNameRequired = readIntentsNeedingCustomer.includes(intent) || writeIntents.includes(intent) || intent === 'ADD_CUSTOMER';
  const amountRequired = writeIntents.includes(intent);
  const missingFields = [
    ambiguous ? 'intent' : null,
    customerNameRequired && !customerName ? 'customerName' : null,
    amountRequired && amount === null ? 'amount' : null,
  ].filter(Boolean) as string[];

  let confidence: number;
  if (isFallback || ambiguous) confidence = 0;
  else if (intent === 'ADD_CUSTOMER') confidence = customerName ? 0.9 : 0.5;
  else if (readIntentsNotNeedingCustomer.includes(intent)) confidence = 0.9;
  else if (readIntentsNeedingCustomer.includes(intent)) confidence = customerName ? 0.9 : 0.5;
  else if (customerName && amount !== null) confidence = 0.9;
  else if (customerName || amount !== null) confidence = 0.5;
  else confidence = 0.3;

  return {
    intent,
    customerName: customerName ?? undefined,
    amount: amount ?? undefined,
    description,
    confidence,
    missingFields,
  };
}
