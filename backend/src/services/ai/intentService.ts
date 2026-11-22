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
  panch: 5,
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

    // Multiplier words are checked before number values so that "hazar"
    // multiplies the running total rather than being added as 1000
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

    const numberValue = spokenNumberMap[normalizedToken] ?? numberWordFallback[normalizedToken];

    if (typeof numberValue === 'number') {
      current += numberValue;
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
  // Read intents that do not require a customer name
  if (intent === 'GET_TOTAL_OUTSTANDING' || intent === 'GET_TODAY_TRANSACTIONS') {
    return undefined;
  }

  const cleaned = text
    .toLowerCase()
    // Remove postpositions (Hindi/English) - word-boundary anchored to avoid
    // matching inside larger words (e.g. "ne" inside "lene")
    .replace(/\b(?:ko|ke|ne|se|ka|ki|par|mein|for|to|from)\s+/gi, ' ')
    // Remove transaction-related and action words
    .replace(/\b(?:udhaar|udhar|payment|sale|kharcha|maal|baki|kitna|hai|hoga|karun|karna|kar diya|de diye|de diya|diya|diye|liye|liya|lene|hain|batao|dikhao|dikha|transactions|owes|owed|show|list|credit|expense|samaan|maal|rupees|rupaye|rs|add|record)\b/gi, ' ')
    // Remove amounts (numeric)
    .replace(/\b\d+(?:[.,]\d+)*\b/g, ' ')
    // Remove currency words
    .replace(/\b(?:rupees|rupaye|rs)\b/gi, ' ')
    // Remove punctuation
    .replace(/[.,!?;:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) {
    return undefined;
  }

  const tokens = cleaned.split(/\s+/).filter(Boolean).filter((t) => /[a-z]/i.test(t));
  if (tokens.length === 0) {
    return undefined;
  }

  // Capitalize each token and join to support multi-word names
  return tokens.map((t) => t.charAt(0).toUpperCase() + t.slice(1)).join(' ');
}

function inferIntent(text: string): { intent: ParsedIntent['intent']; isFallback: boolean } {
  const lower = text.toLowerCase();

  // Read intents first (specific to general) to avoid being shadowed by write intents
  if (/(total.*outstanding|sab.*baki|mere customers.*paise|total kitne paise|total outstanding)/.test(lower)) {
    return { intent: 'GET_TOTAL_OUTSTANDING', isFallback: false };
  }

  if (/(customer.*transactions|transactions.*customer|raju.*transactions|hisab.*dikhao)/.test(lower)) {
    return { intent: 'GET_CUSTOMER_TRANSACTIONS', isFallback: false };
  }

  if (/(aaj.*transaction|aaj.*transactions|today.*transaction|today.*transactions|transactions dikhao|aaj ke transactions)/.test(lower)) {
    return { intent: 'GET_TODAY_TRANSACTIONS', isFallback: false };
  }

  if (/(kitna.*udhaar|udhaar.*kitna|balance|baki|hisaab.*hai|kitne.*paise|ka.*hisaab|kitna.*hai)/.test(lower)) {
    return { intent: 'GET_BALANCE', isFallback: false };
  }

  // Write intents - payment checked before credit to resolve overlap on "de diye"/"de diya"/"diye"
  if (/(payment|paid|de diye|de diya|diye|payment kar|dena|de rahe)/.test(lower)) {
    return { intent: 'RECORD_PAYMENT', isFallback: false };
  }

  if (/(udhaar|udhar|credit|loan|dene|lene|diya|owes)/.test(lower)) {
    return { intent: 'ADD_CREDIT', isFallback: false };
  }

  if (/(sale|sell|bech|bik|bikh|maal|sale hui|bik gay|ki sale)/.test(lower)) {
    return { intent: 'ADD_SALE', isFallback: false };
  }

  if (/(kharcha|expense|expense hua|kharch|cost|purchase|liya|market se|wholesale)/.test(lower)) {
    return { intent: 'ADD_EXPENSE', isFallback: false };
  }

  // Safe fallback: read-only intent, no financial write is invented for unknown input
  return { intent: 'GET_BALANCE', isFallback: true };
}

function inferDescription(text: string): string {
  const cleaned = text
    .toLowerCase()
    .replace(/^(?:raju|amit|neha|suresh)\s+/i, '')
    .replace(/\b(?:ko|ne|se|ka|ki|me|mein|hisaab|batao|kitna|udhaar|payment|sale|kharcha|samaan|maal|rupaye|rupees|rs)\b/gi, ' ')
    .replace(/\b(?:diya|de|di|liye|liya|kar|hue|hui|hai|hoga|suna|kya)\b/gi, ' ')
    .replace(/\b\d+(?:[.,]\d+)*\b/g, ' ')
    .replace(/[.,!?;:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return cleaned || 'Ledger update';
}

export async function interpretTranscript(rawTranscript: string): Promise<ParsedIntent> {
  const text = String(rawTranscript ?? '').trim();

  if (!text) {
    return {
      intent: 'GET_BALANCE',
      confidence: 0,
      missingFields: ['transcript', 'customerName'],
    };
  }

  const { intent, isFallback } = inferIntent(text);
  const customerName = isFallback ? undefined : extractCustomerName(text, intent);
  const amount = extractAmount(text);
  const description = inferDescription(text);

  // Fields required per intent type
  const readIntentsNotNeedingCustomer = ['GET_TOTAL_OUTSTANDING', 'GET_TODAY_TRANSACTIONS'];
  const readIntentsNeedingCustomer = ['GET_BALANCE', 'GET_CUSTOMER_TRANSACTIONS'];
  const writeIntents = ['ADD_CREDIT', 'RECORD_PAYMENT', 'ADD_SALE', 'ADD_EXPENSE'];

  const customerNameRequired =
    readIntentsNeedingCustomer.includes(intent) || writeIntents.includes(intent);
  const amountRequired = writeIntents.includes(intent);

  const missingFields = [
    customerNameRequired && !customerName ? 'customerName' : null,
    amountRequired && !amount ? 'amount' : null,
  ].filter(Boolean) as string[];

  // Confidence scoring: reflects whether fields needed for the intent were identified
  let confidence: number;
  if (isFallback) {
    confidence = 0;
  } else if (readIntentsNotNeedingCustomer.includes(intent)) {
    // No fields required for these read intents
    confidence = 0.9;
  } else if (readIntentsNeedingCustomer.includes(intent)) {
    confidence = customerName ? 0.9 : 0.5;
  } else {
    // Write intents: need both customerName and amount for high confidence
    if (customerName && amount) {
      confidence = 0.9;
    } else if (customerName || amount) {
      confidence = 0.5;
    } else {
      confidence = 0.3;
    }
  }

  return {
    intent,
    customerName,
    amount: amount ?? undefined,
    description,
    confidence,
    missingFields,
  };
}
