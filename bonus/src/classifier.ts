// Voice intent classifier
// classifies text into: capture, exit, wake, chat, none
// supports English, Hindi (devanagari + romanized), Telugu (script + romanized)

export type Intent = 'capture' | 'exit' | 'wake' | 'chat' | 'none';
export type Language = 'english' | 'hindi' | 'telugu' | 'unknown';

export interface ClassificationResult {
  intent: Intent;
  confidence: number;
  language: Language;
  scores: Record<Intent, number>;
  tokens: string[];
  processingTimeMs: number;
}

// each entry is [keyword/phrase, weight from 0-1]
type Dict = Array<[string, number]>;

// --- english intent keywords ---

const ENGLISH: Record<Intent, Dict> = {
  capture: [
    ['take a photo', 1.0], ['take photo', 1.0], ['capture', 0.9], ['snap', 0.8],
    ['photograph', 0.9], ['take a picture', 1.0], ['take picture', 1.0],
    ['shoot', 0.7], ['click', 0.7], ['record', 0.6], ['screenshot', 0.7],
    ['camera', 0.6], ['pic', 0.7], ['selfie', 0.8], ['scan', 0.6],
    ['photo', 0.8], ['picture', 0.8], ['image', 0.6],
  ],
  exit: [
    ['exit', 1.0], ['quit', 1.0], ['close', 0.8], ['stop', 0.7],
    ['shut down', 0.9], ['shutdown', 0.9], ['turn off', 0.9], ['goodbye', 0.8],
    ['bye', 0.7], ['end', 0.6], ['terminate', 0.9], ['power off', 0.9],
    ['disconnect', 0.8], ['leave', 0.6], ['dismiss', 0.7],
  ],
  wake: [
    ['hey glass', 1.0], ['ok glass', 1.0], ['hello glass', 0.9],
    ['wake up', 0.9], ['hey glasslink', 1.0], ['activate', 0.8],
    ['listen', 0.7], ['hey buddy', 0.7], ['attention', 0.7],
    ['start listening', 0.8], ['are you there', 0.7], ['hello', 0.5],
    ['hi', 0.4], ['hey', 0.4], ['wake', 0.7],
  ],
  chat: [
    ['what is', 0.7], ['tell me', 0.8], ['describe', 0.8], ['explain', 0.8],
    ['what do you see', 0.9], ['what\'s happening', 0.8], ['help me', 0.7],
    ['navigate', 0.7], ['where am i', 0.8], ['read this', 0.8],
    ['translate', 0.8], ['summarize', 0.7], ['how do i', 0.7],
    ['can you', 0.5], ['what are', 0.6], ['who is', 0.7],
    ['directions to', 0.8], ['search for', 0.7], ['look up', 0.7],
    ['find', 0.5], ['show me', 0.7],
  ],
  none: [],
};

// --- hindi ---

const HINDI: Record<Intent, Dict> = {
  capture: [
    ['फोटो लो', 1.0], ['फ़ोटो लो', 1.0], ['तस्वीर लो', 1.0],
    ['फोटो खींचो', 1.0], ['कैमरा', 0.7], ['फोटो', 0.8],
    ['तस्वीर', 0.8], ['photo lo', 1.0], ['photo khincho', 1.0],
    ['tasveer lo', 0.9], ['snap lo', 0.8], ['click karo', 0.8],
    ['capture karo', 0.9],
  ],
  exit: [
    ['बंद करो', 1.0], ['बाहर निकलो', 0.9], ['रुको', 0.7],
    ['बंद', 0.7], ['छोड़ो', 0.8], ['अलविदा', 0.8],
    ['band karo', 1.0], ['bahar niklo', 0.9], ['ruko', 0.7],
    ['chodo', 0.7], ['bye', 0.7], ['exit karo', 0.9], ['quit karo', 0.9],
  ],
  wake: [
    ['हे ग्लास', 1.0], ['ओके ग्लास', 1.0], ['हैलो ग्लास', 0.9],
    ['जागो', 0.8], ['सुनो', 0.7], ['hey glass', 1.0],
    ['ok glass', 1.0], ['suno', 0.7], ['jago', 0.8], ['hello glass', 0.9],
  ],
  chat: [
    ['बताओ', 0.7], ['क्या है', 0.7], ['यह क्या है', 0.9],
    ['कहाँ हूँ', 0.8], ['रास्ता बताओ', 0.9], ['मदद करो', 0.8],
    ['पढ़ो', 0.7], ['समझाओ', 0.8], ['batao', 0.7],
    ['kya hai', 0.7], ['kahan hoon', 0.8], ['rasta batao', 0.9],
    ['madad karo', 0.8], ['padho', 0.7], ['translate karo', 0.8],
  ],
  none: [],
};

// --- telugu ---

const TELUGU: Record<Intent, Dict> = {
  capture: [
    ['ఫోటో తీయి', 1.0], ['ఫోటో తీసుకో', 1.0], ['చిత్రం తీయి', 0.9],
    ['ఫోటో', 0.8], ['photo teeyi', 1.0], ['photo teesuko', 1.0],
    ['chitram teeyi', 0.9], ['snap teeyi', 0.8], ['click cheyyi', 0.8],
    ['capture cheyyi', 0.9],
  ],
  exit: [
    ['ఆపు', 0.9], ['బంద్ చెయ్యి', 1.0], ['వెళ్ళిపో', 0.8],
    ['మూసెయ్', 0.8], ['aapu', 0.9], ['band cheyyi', 1.0],
    ['vellipo', 0.8], ['moosey', 0.8], ['exit cheyyi', 0.9],
    ['quit cheyyi', 0.9], ['bye', 0.7],
  ],
  wake: [
    ['హే గ్లాస్', 1.0], ['ఓకే గ్లాస్', 1.0], ['హలో గ్లాస్', 0.9],
    ['లేచి రా', 0.7], ['వినుమా', 0.7], ['hey glass', 1.0],
    ['ok glass', 1.0], ['hello glass', 0.9], ['lechi ra', 0.7], ['vinuma', 0.7],
  ],
  chat: [
    ['ఏమిటి', 0.7], ['చెప్పు', 0.8], ['ఇది ఏమిటి', 0.9],
    ['ఎక్కడ ఉన్నాను', 0.8], ['దారి చెప్పు', 0.9],
    ['సహాయం', 0.8], ['చదువు', 0.7], ['emiti', 0.7],
    ['cheppu', 0.8], ['idi emiti', 0.9], ['ekkada unnanu', 0.8],
    ['daari cheppu', 0.9], ['sahaayam', 0.8], ['chaduvu', 0.7],
  ],
  none: [],
};

// figure out what language the input is in
function detectLanguage(text: string): Language {
  if (/[\u0900-\u097F]/.test(text)) return 'hindi';      // devanagari
  if (/[\u0C00-\u0C7F]/.test(text)) return 'telugu';     // telugu script

  // check for romanized hindi/telugu words
  const lower = text.toLowerCase();
  const hindiWords = ['karo', 'kaho', 'batao', 'khincho', 'kahan', 'kya', 'hai', 'hoon', 'niklo', 'chodo', 'ruko', 'suno', 'jago', 'padho'];
  const teluguWords = ['cheyyi', 'teeyi', 'teesuko', 'cheppu', 'unnanu', 'emiti', 'aapu', 'vellipo', 'moosey', 'vinuma', 'lechi', 'daari', 'chitram', 'chaduvu'];

  const hScore = hindiWords.filter(w => lower.includes(w)).length;
  const tScore = teluguWords.filter(w => lower.includes(w)).length;

  if (tScore > hScore && tScore > 0) return 'telugu';
  if (hScore > 0) return 'hindi';
  return 'english';
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// basic levenshtein for fuzzy matching (handles STT typos)
function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

function fuzzyMatch(input: string, target: string): number {
  if (input === target) return 1.0;
  if (input.includes(target) || target.includes(input)) return 0.85;
  const dist = levenshtein(input, target);
  const maxLen = Math.max(input.length, target.length);
  if (maxLen === 0) return 0;
  return Math.max(0, 1 - dist / maxLen);
}

// main classification function
export function classify(text: string): ClassificationResult {
  const start = performance.now();
  const normalized = normalize(text);
  const language = detectLanguage(text);
  const tokens = normalized.split(' ').filter(Boolean);

  const dicts = language === 'hindi' ? HINDI : language === 'telugu' ? TELUGU : ENGLISH;
  const fallback = language !== 'english' ? ENGLISH : null;

  const scores: Record<Intent, number> = { capture: 0, exit: 0, wake: 0, chat: 0, none: 0 };
  const intents: Intent[] = ['capture', 'exit', 'wake', 'chat'];

  for (const intent of intents) {
    let best = 0;

    for (const [phrase, weight] of dicts[intent]) {
      // exact match
      if (normalized.includes(phrase.toLowerCase())) {
        best = Math.max(best, weight);
        continue;
      }
      // fuzzy match on tokens
      const phraseTokens = phrase.toLowerCase().split(' ');
      if (phraseTokens.length === 1) {
        for (const tok of tokens) {
          const sim = fuzzyMatch(tok, phraseTokens[0]);
          if (sim > 0.75) best = Math.max(best, weight * sim);
        }
      } else {
        // sliding window for multi-word phrases
        for (let i = 0; i <= tokens.length - phraseTokens.length; i++) {
          const window = tokens.slice(i, i + phraseTokens.length).join(' ');
          const sim = fuzzyMatch(window, phrase.toLowerCase());
          if (sim > 0.7) best = Math.max(best, weight * sim);
        }
      }
    }

    // also check english dict as fallback for code-mixed input
    if (fallback) {
      for (const [phrase, weight] of fallback[intent]) {
        if (normalized.includes(phrase.toLowerCase())) {
          best = Math.max(best, weight * 0.8);
        }
      }
    }

    scores[intent] = Math.round(best * 100) / 100;
  }

  // pick the highest scoring intent above threshold
  let winner: Intent = 'none';
  let topScore = 0.3; // minimum confidence threshold

  for (const intent of intents) {
    if (scores[intent] > topScore) {
      topScore = scores[intent];
      winner = intent;
    }
  }

  if (winner === 'none') scores.none = 1.0;

  return {
    intent: winner,
    confidence: winner === 'none' ? 0 : topScore,
    language,
    scores,
    tokens,
    processingTimeMs: Math.round((performance.now() - start) * 100) / 100,
  };
}

// test examples for the UI
export const EXAMPLES: Array<{ text: string; expectedIntent: Intent; lang: string }> = [
  { text: 'Take a photo of this', expectedIntent: 'capture', lang: 'English' },
  { text: 'Hey Glass, wake up', expectedIntent: 'wake', lang: 'English' },
  { text: 'What do you see?', expectedIntent: 'chat', lang: 'English' },
  { text: 'Exit the app', expectedIntent: 'exit', lang: 'English' },
  { text: 'Random nonsense blah', expectedIntent: 'none', lang: 'English' },
  { text: 'Snap a picture please', expectedIntent: 'capture', lang: 'English' },
  { text: 'Describe what is in front of me', expectedIntent: 'chat', lang: 'English' },
  { text: 'Goodbye, turn off', expectedIntent: 'exit', lang: 'English' },
  { text: 'फोटो खींचो', expectedIntent: 'capture', lang: 'Hindi' },
  { text: 'हे ग्लास सुनो', expectedIntent: 'wake', lang: 'Hindi' },
  { text: 'यह क्या है बताओ', expectedIntent: 'chat', lang: 'Hindi' },
  { text: 'बंद करो', expectedIntent: 'exit', lang: 'Hindi' },
  { text: 'photo khincho', expectedIntent: 'capture', lang: 'Hindi (Romanized)' },
  { text: 'band karo', expectedIntent: 'exit', lang: 'Hindi (Romanized)' },
  { text: 'ఫోటో తీయి', expectedIntent: 'capture', lang: 'Telugu' },
  { text: 'హే గ్లాస్', expectedIntent: 'wake', lang: 'Telugu' },
  { text: 'ఇది ఏమిటి చెప్పు', expectedIntent: 'chat', lang: 'Telugu' },
  { text: 'బంద్ చెయ్యి', expectedIntent: 'exit', lang: 'Telugu' },
  { text: 'photo teeyi', expectedIntent: 'capture', lang: 'Telugu (Romanized)' },
  { text: 'exit cheyyi', expectedIntent: 'exit', lang: 'Telugu (Romanized)' },
];
