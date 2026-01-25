export function normalizeTitle(title: string): string {
  return (title || '')
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeCondition(condition: string | null | undefined): 'new' | 'used' | null {
  if (!condition) return null;
  
  const lower = condition.toLowerCase().trim();
  
  // NEW conditions in various European languages
  const newKeywords = [
    'new',           // English
    'neu',           // German
    'neuf',          // French
    'nuevo',         // Spanish
    'nuovo',         // Italian
    'nieuw',         // Dutch
    'novo',          // Portuguese
    'nowy',          // Polish
    'ny',            // Swedish/Danish/Norwegian
    'uusi',          // Finnish
    'brand new',     // English variant
    'factory sealed', // English variant
    'sealed',        // English variant
    'misb',          // Mint In Sealed Box
    'nisb',          // New In Sealed Box
    'bnib',          // Brand New In Box
  ];
  
  // USED conditions in various European languages
  const usedKeywords = [
    'used',          // English
    'gebraucht',     // German
    'occasion',      // French
    'usado',         // Spanish/Portuguese
    'usato',         // Italian
    'gebruikt',      // Dutch
    'pre-owned',     // English variant
    'preowned',      // English variant
    'pre owned',     // English variant
    'second hand',   // English variant
    'secondhand',    // English variant
    'gebrauch',      // German variant
    'd\'occasion',   // French variant
    'uzywany',       // Polish
    'begagnad',      // Swedish
    'brugt',         // Danish
    'brukt',         // Norwegian
    'käytetty',      // Finnish
    'very good',     // eBay condition
    'good',          // eBay condition (when standalone)
    'acceptable',    // eBay condition
  ];
  
  // Check for NEW first (more specific match)
  for (const keyword of newKeywords) {
    if (lower.includes(keyword)) {
      return 'new';
    }
  }
  
  // Check for USED
  for (const keyword of usedKeywords) {
    if (lower.includes(keyword)) {
      return 'used';
    }
  }
  
  return null;
}

export function containsExcludeWord(title: string, excludeWords: string[]): boolean {
  if (!excludeWords || excludeWords.length === 0) return false;
  
  const normalizedTitle = normalizeTitle(title);
  
  return excludeWords.some((word) => {
    const normalizedWord = word.toLowerCase().trim();
    return normalizedTitle.includes(normalizedWord);
  });
}
