export type ParsedIntent = {
  intent: 
    | 'ADD_CREDIT'
    | 'RECORD_PAYMENT'
    | 'ADD_SALE'
    | 'ADD_EXPENSE'
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

const spokenNumberMap: Record<string, number> = {
  zero: 0,
  shunya: 0,
  ek: 1,
  do: 2,
  teen: 3,
  char: 4,
  chaar: 4,
  paanch: 5,
  pach: 5,
  che: 6,
  chhe: 6,
  saat: 7,
  sat: 7,
  aath: 8,
  ath: 8,
  nau: 9,
  das: 10,
  gyarah: 11,
  barah: 12,
  terah: 13,
  chaudah: 14,
  pandrah: 15,
  solah: 16,
  satarah: 17,
  atharah: 18,
  unnis: 19,
  bees: 20,
  is: 20,
  pachas: 50,
  sau: 100,
  hazar: 1000,
  hazaar: 1000,
  lakh: 100000,
  crore: 10000000,
  hundred: 100,
  thousand: 1000,
};

const numberWordFallback: Record<string, number> = {
  'one': 1,
  'two': 2,
  'three': 3,
  'four': 4,
  'five': 5,
  'six': 6,
  'seven': 7,
  'eight': 8,
  'nine': 9,
  'ten': 10,
  'eleven': 11,
  'twelve': 12,
  'thirteen': 13,
  'fourteen': 14,
  'fifteen': 15,
  'sixteen': 16,
  'seventeen': 17,
  'eighteen': 18,
  'nineteen': 19,
  'twenty': 20,
  'thirty': 30,
  'forty': 40,
  'fifty': 50,
  'sixty': 60,
  'seventy': 70,
  'eighty': 80,
  'ninety': 90,
};

function normalizeTranscript(input: string) {
  return input
    .toLowerCase()
    .replace(/₹/g, ' rupees ')
    .replace(/rs\.?/g, ' rupees ')
    .replace(/rupaye|rupya|rupees|rupee/gi, ' rupees ')
    .replace(/\s+/g, ' ')
    .trim();
}

function replaceNumberPhrases(text: string): string {
  const replacements: [RegExp, string][] = [
    [/\b(?:ek|one)\s+(?:hazaar|thousand)\b/g, ' 1000 '],
    [/\b(?:do|two)\s+(?:hazaar|thousand)\b/g, ' 2000 '],
    [/\b(?:teen|three)\s+(?:hazaar|thousand)\b/g, ' 3000 '],
    [/\b(?:char|chaar|four)\s+(?:hazaar|thousand)\b/g, ' 4000 '],
    [/\b(?:paanch|five)\s+(?:hazaar|thousand)\b/g, ' 5000 '],
    [/\b(?:ek|one)\s+(?:sau|hundred)\b/g, ' 100 '],
    [/\b(?:do|two)\s+(?:sau|hundred)\b/g, ' 200 '],
    [/\b(?:teen|three)\s+(?:sau|hundred)\b/g, ' 300 '],
    [/\b(?:char|chaar|four)\s+(?:sau|hundred)\b/g, ' 400 '],
    [/\b(?:paanch|five)\s+(?:sau|hundred)\b/g, ' 500 '],
    [/\b(?:che|chhe|six)\s+(?:sau|hundred)\b/g, ' 600 '],
    [/\b(?:sat|saat|seven)\s+(?:sau|hundred)\b/g, ' 700 '],
    [/\b(?:aath|eight)\s+(?:sau|hundred)\b/g, ' 800 '],
    [/\b(?:nau|nine)\s+(?:sau|hundred)\b/g, ' 900 '],
    [/\b(?:do|two)\s+(?:lakh)\b/g, ' 200000 '],
    [/\b(?:ek|one)\s+(?:lakh)\b/g, ' 100000 '],
    [/\b(?:paanch|five)\s+(?:sau|hundred)\b/g, ' 500 '],
  ];

  let nextText = text;
  for (const [pattern, replacement] of replacements) {
    nextText = nextText.replace(pattern, replacement);
  }

  return nextText;
}

function parseSpokenNumber(value: string): number | null {
  const cleaned = replaceNumberPhrases(value)
    .replace(/,/g, ' ')
    .replace(/\b(?:rupees|rupaye|rs)\b/g, ' ')
    .trim();

  const numericMatch = cleaned.match(/\d+/);
  if (numericMatch) {
    return Number(numericMatch[0]);
  }

  const tokens = cleaned.split(/\s+/).filter(Boolean);
  let total = 0;
  let current = 0;

  for (const token of tokens) {
    const normalizedToken = token.replace(/[^a-z]/gi, '');
    const numberValue = spokenNumberMap[normalizedToken] ?? numberWordFallback[normalizedToken];

    if (typeof numberValue === 'number') {
      current += numberValue;
      continue;
    }

    if (normalizedToken === 'sau' || normalizedToken === 'hundred') {
      current *= 100;
      continue;
    }

    if (normalizedToken === 'hazar' || normalizedToken === 'hazaar' || normalizedToken === 'thousand') {
      current *= 1000;
      continue;
    }

    if (normalizedToken === 'lakh') {
      current *= 100000;
      continue;
    }

    if (normalizedToken === 'crore') {
      current *= 10000000;
      continue;
    }

    if (!Number.isNaN(Number(token))) {
      current += Number(token);
      continue;
    }

    if (current > 0) {
      total += current;
      current = 0;
    }
  }

  if (current > 0) {
    total += current;
  }

  return total > 0 ? total : null;
}

function extractAmount(text: string): number | null {
  const normalized = normalizeTranscript(text);
  const amountMatches = [
    /(?:\b(?:rupees|rupaye|rs)\s*(?:ke|ka)?\s*([0-9]+(?:,[0-9]{3})*(?:\.[0-9]+)?)\b)/i,
    /\b([0-9]+(?:,[0-9]{3})*(?:\.[0-9]+)?)\s*(?:rupees|rupaye|rs)?\b/i,
    /\b(?:amount|kitne|kitna|kitni)\s*(?:rupees|rupaye|rs)?\s*([0-9]+(?:,[0-9]{3})*(?:\.[0-9]+)?)\b/i,
  ];

  for (const pattern of amountMatches) {
    const match = normalized.match(pattern);
    if (match) {
      const raw = match[1] ?? match[0];
      return Number(String(raw).replace(/,/g, ''));
    }
  }

  const spokenMatches = [
    /(?:\b(?:rupees|rupaye|rs)\s+)([a-zA-Z\s]+?)(?=\s+(?:ka|ki|ko|se|ne|hai|diya|de|liye|liye|hue|hui))/i,
    /\b([a-zA-Z\s]+?)\s*(?:rupees|rupaye|rs)\b/i,
  ];

  for (const pattern of spokenMatches) {
    const match = normalized.match(pattern);
    if (match) {
      const spoken = match[1]?.trim();
      if (spoken) {
        const parsed = parseSpokenNumber(spoken);
        if (parsed) {
          return parsed;
        }
      }
    }
  }

  const fallback = parseSpokenNumber(normalized);
  return fallback ?? null;
}

function extractCustomerName(text: string, intent: ParsedIntent['intent']): string | undefined {
  const cleaned = text
    .replace(/(?:ko|ne|se|ka|ki|par|mein|mein)\s+/gi, ' ')
    .replace(/\b(?:udhaar|payment|sale|kharcha|maal|baki|kitna|hai|hoga|karun|karna|kar diya|de diye|diya|liye|liya|batao)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const match = cleaned.match(/[A-Za-z][A-Za-z\s]{1,25}/);
  if (match) {
    const candidate = match[0].trim();
    if (candidate && !/^(?:aaj|today|kitna|baki|hisaab|rupi|rupaye|rupees)$/i.test(candidate)) {
      return candidate;
    }
  }

  const tokens = cleaned.split(/\s+/);
  const firstToken = tokens[0];
  if (firstToken && /[A-Za-z]/.test(firstToken)) {
    return firstToken;
  }

  return undefined;
}

function inferIntent(text: string): ParsedIntent['intent'] {
  const lower = text.toLowerCase();

  if (/(udhaar|udhar|credit|loan|dene|diya|de diy|de diye)/.test(lower)) {
    return 'ADD_CREDIT';
  }

  if (/(payment|paid|de diye|de diya|payment kar|dena|de rahe|de diye)/.test(lower)) {
    return 'RECORD_PAYMENT';
  }

  if (/(sale|sell|bech|bik|bikh|maal|sale hui|bik gay|ki sale)/.test(lower)) {
    return 'ADD_SALE';
  }

  if (/(kharcha|expense|expense hua|kharch|cost|purchase|liya|market se|wholesale)/.test(lower)) {
    return 'ADD_EXPENSE';
  }

  if (/(kitna.*udhaar|udhaar.*kitna|balance|baki|hisaab.*hai|kitne.*paise|ka.*hisaab|kitna.*hai)/.test(lower)) {
    return 'GET_BALANCE';
  }

  if (/(total.*outstanding|sab.*baki|mere customers.*paise|total kitne paise|total outstanding)/.test(lower)) {
    return 'GET_TOTAL_OUTSTANDING';
  }

  if (/(aaj.*transaction|aaj.*transactions|today.*transaction|today.*transactions|transactions dikhao|aaj ke transactions)/.test(lower)) {
    return 'GET_TODAY_TRANSACTIONS';
  }

  if (/(customer.*transactions|transactions.*customer|raju.*transactions|hisab.*dikhao)/.test(lower)) {
    return 'GET_CUSTOMER_TRANSACTIONS';
  }

  return 'ADD_CREDIT';
}

function inferDescription(text: string): string {
  const cleaned = text
    .toLowerCase()
    .replace(/^(?:raju|amit|neha|suresh)\s+/i, '')
    .replace(/\b(?:ko|ne|se|ka|ki|me|mein|hisaab|batao|kitna|udhaar|payment|sale|kharcha|samaan|maal|rupaye|rupees|rs)\b/gi, ' ')
    .replace(/\b(?:diya|de|di|liye|liya|kar|hue|hui|hai|hoga|suna|kya)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return cleaned || 'Ledger update';
}

export async function interpretTranscript(rawTranscript: string): Promise<ParsedIntent> {
  const text = String(rawTranscript ?? '').trim();

  if (!text) {
    return {
      intent: 'ADD_CREDIT',
      confidence: 0,
      missingFields: ['transcript'],
    };
  }

  const intent = inferIntent(text);
  const customerName = extractCustomerName(text, intent);
  const amount = extractAmount(text);
  const description = inferDescription(text);
  const missingFields = [
    !customerName ? 'customerName' : null,
    intent !== 'GET_BALANCE' && intent !== 'GET_TOTAL_OUTSTANDING' && intent !== 'GET_TODAY_TRANSACTIONS' && intent !== 'GET_CUSTOMER_TRANSACTIONS' && !amount ? 'amount' : null,
  ].filter(Boolean) as string[];

  return {
    intent,
    customerName,
    amount: amount ?? undefined,
    description,
    confidence: amount || customerName ? 0.9 : 0.5,
    missingFields,
  };
}
