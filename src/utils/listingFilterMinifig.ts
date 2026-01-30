/**
 * Minifigure Listing Filter for eBay
 * 
 * V3: Added LEGO part number detection and standalone body part filtering
 * V2: Complete rewrite with code-required logic
 * 
 * KEY DIFFERENCE FROM SET FILTER:
 * - Sets: Name is unique (75192 = one product)
 * - Minifigs: Name is NOT unique ("Darth Vader" = 20+ variants)
 * 
 * Therefore, we REQUIRE a BrickLink or Rebrickable code to match.
 * Name-only matching would send users wrong variants.
 */

// ============================================
// CODE PATTERN DETECTION
// ============================================

/**
 * BrickLink minifig code patterns
 * Format: 2-4 letters + numbers + optional letter suffix
 * Examples: sw0001, sh001, hp001a, col123, cty0456a, njo001
 */
const BRICKLINK_CODE_PATTERNS = [
  // Standard format with optional suffix
  /\b(sw|sh|hp|col|cty|njo|loc|tlm|dis|mar|sup|bat|spd|poc|pot|lor|tnt|gen|cas|pi|adv|alp|aq|agt|atl|ava|bel|bob|but|car|cre|din|dp|elf|exf|frn|fst|gal|hol|idea|iaj|jw|kkl|mba|mc|min|mof|msk|nex|ow|pck|pharaoh|pln|pm|rb|res|rock|rom|sc|scr|sim|soc|spa|spp|sr|stu|sw|tfol|toy|trn|tru|twn|uagt|vik|ww|xyz)\d{3,4}[a-z]?\b/gi,
];

/**
 * Rebrickable minifig code pattern
 * Format: fig-XXXXXX (6 digits)
 * Examples: fig-003509, fig-000001
 */
const REBRICKABLE_CODE_PATTERN = /\bfig[-\s]?\d{6}\b/gi;

/**
 * Check if title contains the watched BrickLink code
 * 
 * IMPORTANT: We only match EXACT codes with minor formatting variations.
 * We do NOT strip leading zeros because sw0024 ≠ sw024 (different minifigs!)
 */
function titleContainsBricklinkCode(title: string, figNum: string): boolean {
  const titleLower = title.toLowerCase();
  const figNumLower = figNum.toLowerCase();
  
  // Direct match (most common) - e.g., "sw0001"
  if (titleLower.includes(figNumLower)) {
    return true;
  }
  
  // Match with space between prefix and number - e.g., "sw 0001"
  const codeWithSpace = figNumLower.replace(/([a-z]+)(\d+)([a-z]?)$/, '$1 $2$3');
  if (codeWithSpace !== figNumLower && titleLower.includes(codeWithSpace)) {
    return true;
  }
  
  // Match with hyphen between prefix and number - e.g., "sw-0001"
  const codeWithHyphen = figNumLower.replace(/([a-z]+)(\d+)([a-z]?)$/, '$1-$2$3');
  if (codeWithHyphen !== figNumLower && titleLower.includes(codeWithHyphen)) {
    return true;
  }
  
  // Match with # symbol - e.g., "sw#0001" (rare but exists)
  const codeWithHash = figNumLower.replace(/([a-z]+)(\d+)([a-z]?)$/, '$1#$2$3');
  if (codeWithHash !== figNumLower && titleLower.includes(codeWithHash)) {
    return true;
  }
  
  // NO matching without leading zeros - sw0024 and sw024 could be different!
  
  return false;
}

/**
 * Check if title contains a Rebrickable code
 * We need both: the code exists in title AND it matches our watched code
 */
function titleContainsRebrickableCode(title: string, figNum: string): boolean {
  const titleLower = title.toLowerCase();
  const figNumLower = figNum.toLowerCase();
  
  // If the watched figNum IS a Rebrickable code, check for it
  if (/^fig[-\s]?\d{6}$/i.test(figNum)) {
    // Direct match
    if (titleLower.includes(figNumLower.replace(/\s+/g, '-'))) {
      return true;
    }
    // Match with space instead of hyphen
    const withSpace = figNumLower.replace(/-/g, ' ');
    if (titleLower.includes(withSpace)) {
      return true;
    }
    // Match without hyphen
    const withoutHyphen = figNumLower.replace(/-/g, '');
    if (titleLower.includes(withoutHyphen)) {
      return true;
    }
  }
  
  return false;
}

/**
 * Check if title contains ANY code that matches our watched code
 */
function titleContainsMatchingCode(title: string, figNum: string): boolean {
  return titleContainsBricklinkCode(title, figNum) || titleContainsRebrickableCode(title, figNum);
}

// ============================================
// LEGO PART NUMBER DETECTION (V3)
// ============================================

/**
 * LEGO element/part number patterns
 * These indicate individual PARTS, not complete minifigs
 * 
 * Examples:
 * - 970c55pb04 (legs with print)
 * - 973pb1234 (torso with print)  
 * - 3626bpb0456 (head with print)
 * - 59363 (hair piece element)
 */
const LEGO_PART_NUMBER_PATTERNS = [
  // Legs patterns: 970 + variant letter + optional numbers + optional print
  /\b970[cdex]\d{0,3}(pb\d+)?\b/i,
  // Hips/legs short: 970 with print
  /\b970(pb|pr|px)\d+\b/i,
  // Torso patterns: 973 + optional variant + print
  /\b973[cp]?(pb|pr|px)\d+\b/i,
  // Head patterns: 3626 + variant + print
  /\b3626[abc]?(pb|px)\d+\b/i,
  // Common hips/legs elements
  /\b(92081|92083|30408|37364|37365|41879|42446|16709|24055|24083|76382)(c|pb|pr)?\d*\b/i,
  // Common hair elements
  /\b(59363|60748|62810|85974|87990|87991|88283|88286|92746|92747|93230|95225|98371|99930|15440|16175|17346|18226|20597|20877|21269|23186|24236|25378|25740|26139|28420|30400|35660|36055|37823|40239|40240|40239|41612|43753|43751|53981|54186|57555|58558|59362|60239|61183|62696|62810|64798|64799|65240|66610|70796|71133|72343|75775|77510|78334|79986|85385|85386|87695|88930|91676|92746|92752|93563|95328|98371|99240|99248)\b/i,
  // Common helmet/headgear elements  
  /\b(30273|30303|30408|35458|35459|44360|47298|50665|53451|55704|56891|57900|59306|62689|67037|69975|87555|87557|88415|89520|89918|89918|91851|92035|92081|93560|95678|98130|98133)\b/i,
  // Generic element with print/pattern suffix (4-6 digit number + pb/pr/px + numbers)
  /\b\d{4,6}(pb|pr|px|pat)\d{1,4}\b/i,
  // Generic element format seen in listings (5-digit element ID)
  /\b[1-9]\d{4}(pb|pr|px)\d+\b/i,
];

/**
 * Check if title contains LEGO part/element numbers
 * These indicate it's a PART listing, not a complete minifig
 */
function containsLegoPartNumber(title: string): { found: boolean; partNumber?: string } {
  for (const pattern of LEGO_PART_NUMBER_PATTERNS) {
    const match = title.match(pattern);
    if (match) {
      return { found: true, partNumber: match[0] };
    }
  }
  return { found: false };
}

// ============================================
// STANDALONE BODY PART WORDS (V3)
// ============================================

/**
 * Body part words that indicate this is a PART listing, not complete minifig
 * These are checked as standalone words (with word boundaries)
 * 
 * IMPORTANT: Only trigger if NO minifig indicator present
 */
const BODY_PART_WORDS: { word: string; type: string }[] = [
  // === LEGS/PANTS (most common parts sold separately) ===
  { word: 'legs', type: 'legs' },
  { word: 'leg', type: 'legs' },
  { word: 'hips', type: 'legs' },
  { word: 'beine', type: 'legs' },      // German
  { word: 'bein', type: 'legs' },       // German
  { word: 'hüfte', type: 'legs' },      // German
  { word: 'hose', type: 'legs' },       // German (pants)
  { word: 'jambes', type: 'legs' },     // French
  { word: 'piernas', type: 'legs' },    // Spanish
  { word: 'pierna', type: 'legs' },     // Spanish
  { word: 'patas', type: 'legs' },      // Spanish (legs/feet)
  { word: 'gambe', type: 'legs' },      // Italian
  { word: 'benen', type: 'legs' },      // Dutch
  
  // === TORSO ===
  { word: 'torso', type: 'torso' },
  { word: 'oberkörper', type: 'torso' }, // German
  { word: 'oberkorper', type: 'torso' }, // German no umlaut
  { word: 'torse', type: 'torso' },      // French
  { word: 'busto', type: 'torso' },      // Spanish/Italian
  { word: 'romp', type: 'torso' },       // Dutch
  
  // === HEAD ===
  { word: 'kopf', type: 'head' },        // German
  { word: 'tête', type: 'head' },        // French
  { word: 'tete', type: 'head' },        // French no accent
  { word: 'cabeza', type: 'head' },      // Spanish
  { word: 'testa', type: 'head' },       // Italian
  { word: 'hoofd', type: 'head' },       // Dutch
  
  // === HAIR (very commonly sold separately) ===
  { word: 'hair', type: 'hair' },
  { word: 'hairpiece', type: 'hair' },
  { word: 'haar', type: 'hair' },        // German/Dutch
  { word: 'haare', type: 'hair' },       // German plural
  { word: 'haarteil', type: 'hair' },    // German
  { word: 'cheveux', type: 'hair' },     // French
  { word: 'pelo', type: 'hair' },        // Spanish
  { word: 'cabello', type: 'hair' },     // Spanish
  { word: 'capelli', type: 'hair' },     // Italian
  { word: 'peluca', type: 'hair' },      // Spanish (wig)
  { word: 'perücke', type: 'hair' },     // German (wig)
  { word: 'perruque', type: 'hair' },    // French (wig)
  
  // === HEADGEAR (commonly sold separately) ===
  { word: 'helmet', type: 'headgear' },
  { word: 'helm', type: 'headgear' },    // German/Dutch
  { word: 'casque', type: 'headgear' },  // French
  { word: 'casco', type: 'headgear' },   // Spanish/Italian
  { word: 'hat', type: 'headgear' },
  { word: 'hut', type: 'headgear' },     // German
  { word: 'sombrero', type: 'headgear' },// Spanish
  { word: 'chapeau', type: 'headgear' }, // French
  { word: 'hood', type: 'headgear' },
  { word: 'kapuze', type: 'headgear' },  // German
  { word: 'capuche', type: 'headgear' }, // French
  { word: 'capucha', type: 'headgear' }, // Spanish
  
  // === CAPE/CLOTH ===
  { word: 'cape', type: 'cape' },
  { word: 'umhang', type: 'cape' },      // German
  { word: 'capa', type: 'cape' },        // Spanish
  { word: 'mantello', type: 'cape' },    // Italian
  { word: 'cloak', type: 'cape' },
  { word: 'mantel', type: 'cape' },      // German/Dutch
  
  // === ARMS ===
  { word: 'arme', type: 'arms' },        // German plural
  { word: 'arm', type: 'arms' },
  { word: 'brazos', type: 'arms' },      // Spanish
  { word: 'bras', type: 'arms' },        // French
  { word: 'braccia', type: 'arms' },     // Italian
  
  // === HANDS ===
  { word: 'hands', type: 'hands' },
  { word: 'hand', type: 'hands' },
  { word: 'hände', type: 'hands' },      // German
  { word: 'hande', type: 'hands' },      // German no umlaut
  { word: 'manos', type: 'hands' },      // Spanish
  { word: 'mains', type: 'hands' },      // French
  { word: 'mani', type: 'hands' },       // Italian
];

/**
 * Words that indicate the listing IS for a complete minifig
 * If these are present, body part words don't disqualify the listing
 */
const MINIFIG_INDICATOR_WORDS = [
  'minifig', 'minifigure', 'minifigur', 'minifigura', 'minifigurine',
  'figurine', 'figura', 'figuur', 'figur', 'figure',
  'complete', 'komplett', 'completo', 'complète', 'complet',
  'vollständig', 'vollstandig', 'compleet',
  'with all', 'mit allem', 'con todo', 'avec tout',
  'includes', 'inkl', 'incluye', 'comprend',
  'original', 'authentic', 'genuine', 'echt',
];

/**
 * Check if title is primarily about a body part (not a complete minifig)
 * 
 * Logic:
 * 1. Find position of first body part word
 * 2. Find position of first minifig indicator word
 * 3. If body part appears BEFORE minifig indicator → IS a parts listing
 *    (Sellers often add "minifigur" for SEO even when selling just hair/legs)
 * 4. If minifig indicator comes first → trust it's a complete minifig
 * 5. If only body part word (no minifig indicator) → IS a parts listing
 */
function isBodyPartListing(title: string): { found: boolean; part?: string; type?: string } {
  const titleLower = title.toLowerCase();
  
  // Find first body part word and its position
  let firstBodyPart: { word: string; type: string; position: number } | null = null;
  
  for (const { word, type } of BODY_PART_WORDS) {
    const escapedWord = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escapedWord}\\b`, 'i');
    const match = regex.exec(titleLower);
    
    if (match) {
      const position = match.index;
      if (!firstBodyPart || position < firstBodyPart.position) {
        firstBodyPart = { word, type, position };
      }
    }
  }
  
  // No body part word found → not a parts listing
  if (!firstBodyPart) {
    return { found: false };
  }
  
  // Find first minifig indicator and its position
  let firstMinifigIndicatorPosition: number | null = null;
  
  for (const indicator of MINIFIG_INDICATOR_WORDS) {
    const position = titleLower.indexOf(indicator.toLowerCase());
    if (position !== -1) {
      if (firstMinifigIndicatorPosition === null || position < firstMinifigIndicatorPosition) {
        firstMinifigIndicatorPosition = position;
      }
    }
  }
  
  // No minifig indicator → body part word means it's a parts listing
  if (firstMinifigIndicatorPosition === null) {
    return { found: true, part: firstBodyPart.word, type: firstBodyPart.type };
  }
  
  // KEY LOGIC: If body part word appears BEFORE minifig indicator,
  // it's likely a parts listing (e.g., "Leia Haare Minifigur" = hair piece)
  // If minifig indicator comes first, trust it's a complete minifig
  // (e.g., "Minifigur Leia mit Haaren" = complete minifig with hair)
  if (firstBodyPart.position < firstMinifigIndicatorPosition) {
    return { found: true, part: firstBodyPart.word, type: firstBodyPart.type };
  }
  
  // Minifig indicator comes first → trust it's a complete minifig
  return { found: false };
}

// ============================================
// LEGO BRAND DETECTION
// ============================================

/**
 * Check if title contains LEGO brand
 */
function titleContainsLegoBrand(title: string): boolean {
  const titleLower = title.toLowerCase();
  
  const legoPatterns = [
    /\blego\b/i,
    /\blégo\b/i,  // French accent
    /\bl\.e\.g\.o\b/i,
  ];
  
  return legoPatterns.some(p => p.test(titleLower));
}

// ============================================
// NEGATIVE KEYWORDS (Minifig-specific)
// ============================================

/**
 * Parts-only listings (explicit "only" or "solo" phrasing)
 */
const PARTS_ONLY_KEYWORDS = [
  // Head only - explicit
  'nur kopf', 'only head', 'head only', 'kopf nur',
  'just head', 'just the head', 'tête seule', 'solo cabeza',
  'seulement tête', 'seulement tete',
  // Torso only - explicit
  'nur torso', 'only torso', 'torso only', 'just torso',
  'nur oberkörper', 'torse seul', 'solo torso',
  'seulement torse',
  // Legs only - explicit
  'nur beine', 'only legs', 'legs only', 'just legs',
  'jambes seules', 'solo piernas', 'seulement jambes',
  // Arms only - explicit
  'nur arme', 'only arms', 'arms only', 'just arms',
  'bras seuls', 'solo brazos',
  // Hair only - explicit
  'nur haar', 'only hair', 'hair only', 'just hair',
  'cheveux seuls', 'solo pelo',
  // Cape only - explicit
  'nur umhang', 'only cape', 'cape only', 'just cape',
  'cape seule', 'solo capa',
  // Generic parts
  'ersatzteil', 'spare part', 'replacement part',
  'einzelteil', 'single part', 'loose part',
  'part only', 'parts only', 'nur teil',
  'pièce détachée', 'pieza suelta', 'pezzo singolo',
  'onderdeel', 'ricambio', 'repuesto',
];

/**
 * Non-minifig products (keychains, magnets, etc.)
 */
const NON_MINIFIG_PRODUCTS = [
  // Keychains
  'schlüsselanhänger', 'schlusselanhanger', 'keychain', 'keyring', 'key chain', 'key ring',
  'portachiavi', 'llavero', 'porte-clés', 'porte-cles', 'sleutelhanger',
  // Magnets
  'magnet', 'kühlschrank', 'kuhlschrank', 'fridge', 'refrigerator',
  // Electronics/gadgets
  'torch', 'flashlight', 'taschenlampe', 'lampe', 'linterna',
  'alarm clock', 'wecker', 'clock', 'watch', 'reloj', 'horloge',
  'kugelschreiber', 'pen', 'stift', 'ballpoint', 'boligrafo', 'stylo',
  'radiergummi', 'eraser', 'rubber', 'goma', 'gomme',
  // Large figures (not minifigs)
  'big fig', 'bigfig', 'large figure', 'große figur', 'grosse figur', 'buildable figure',
  'technic figure', 'giant', 'brick built', 'brick-built',
  'constraction', 'action figure', 'actionfigur',
  // Other products
  'duplo', 'quatro', 'primo', 'fabuland',
  'poster', 'print', 'artwork', 'kunst',
  'sticker', 'aufkleber', 'decal', 'pegatina', 'autocollant',
  'card', 'karte', 'trading card', 'sammelkarte', 'carta', 'carte',
  'book', 'buch', 'magazine', 'zeitschrift', 'libro', 'livre', 'revista',
  'plush', 'plüsch', 'plusch', 'peluche', 'stuffed',
];

/**
 * Full sets (we want individual minifig, not a set that includes it)
 */
const FULL_SET_KEYWORDS = [
  'complete set', 'komplett set', 'komplettes set',
  'vollständiges set', 'vollstandiges set',
  'set complet', 'set completo', 'complete doos',
  'original box', 'originalverpackung', 'ovp komplett',
  'with box', 'mit karton', 'avec boite', 'con caja',
  'sealed set', 'versiegelt set', 'sellado',
  'neu ovp', 'new sealed', 'nuevo sellado', 'neuf scellé',
];

/**
 * Custom/Fake/Knockoff products
 */
const CUSTOM_FAKE_KEYWORDS = [
  // Custom
  'custom', 'moc', 'eigenbau', 'selbstgebaut',
  'self made', 'handmade', 'hand made', 'homemade',
  'modified', 'modifiziert', 'customized', 'customised',
  'custom printed', 'bedruckt', 'custom print', 'impreso',
  'decaled', 'waterslide', 'calcomanía',
  'personalizado', 'personnalisé',
  // Fake/knockoff
  'fake', 'replica', 'knockoff', 'knock off', 'nachbau',
  'compatible', 'kompatibel', 'fits lego', 'passt zu lego',
  'non lego', 'nicht lego', 'no lego', 'no es lego',
  'alternativa', 'alternative', 'klon', 'clone', 'clon',
  // Competitor brands
  'lepin', 'cada', 'cobi', 'mega bloks', 'megabloks',
  'kre-o', 'kreo', 'best-lock', 'oxford', 'sluban',
  'enlighten', 'decool', 'bela', 'lele', 'xinh', 'pogo',
  'kopf', 'koruit', 'wm', 'dlp', 'sy', 'jx', 'pg', // Known bootleg brands
  'sembo', 'xingbao', 'mould king', 'mouldking',
];

/**
 * Bulk lots (can't verify specific variant)
 */
const BULK_LOT_KEYWORDS = [
  'konvolut', 'sammlung', 'collection of',
  'lot of', 'bundle of', 'set of',
  'bulk', 'joblot', 'job lot',
  'gemischt', 'mixed', 'assorted', 'random', 'surtido',
  'verschiedene', 'diverse', 'varios', 'vari', 'divers',
  '5x', '10x', '20x', '50x', '100x', // Quantity indicators
  '5 x', '10 x', '20 x',
  'minifigs lot', 'minifigures lot', 'figuren lot',
  'minifig bundle', 'figure bundle', 'figurenpaket',
  'lote de', 'lot de', 'pacchetto',
];

/**
 * Instructions/manuals only (no physical item)
 */
const INSTRUCTIONS_KEYWORDS = [
  'bauanleitung', 'anleitung', 'instructions',
  'manual only', 'nur anleitung', 'only instructions',
  'instruction book', 'instructions only',
  'digital instructions', 'pdf', 'instrucciones',
  'notice de montage', 'istruzioni',
];

/**
 * Display cases (no minifig included)
 */
const DISPLAY_KEYWORDS = [
  'vitrine', 'display case', 'showcase',
  'sammelbox', 'storage box', 'display box',
  'acryl', 'acrylic case', 'glass case',
  'ohne figur', 'without figure', 'figure not included',
  'empty', 'leer', 'vacío', 'vacio', 'vide', 'vuoto',
  'sin figura', 'sans figurine', 'senza figura',
];

/**
 * Check if title contains any negative keywords
 */
function containsNegativeKeywords(title: string): { found: boolean; keyword?: string } {
  const titleLower = title.toLowerCase();
  
  const allNegativeKeywords = [
    ...PARTS_ONLY_KEYWORDS,
    ...NON_MINIFIG_PRODUCTS,
    ...FULL_SET_KEYWORDS,
    ...CUSTOM_FAKE_KEYWORDS,
    ...BULK_LOT_KEYWORDS,
    ...INSTRUCTIONS_KEYWORDS,
    ...DISPLAY_KEYWORDS,
  ];
  
  for (const keyword of allNegativeKeywords) {
    if (titleLower.includes(keyword.toLowerCase())) {
      return { found: true, keyword };
    }
  }
  
  return { found: false };
}

// ============================================
// SET DETECTION (reject if it's actually a full set)
// ============================================

/**
 * Check if listing appears to be a full LEGO set
 * A minifig listing priced over €100 that mentions set numbers is suspicious
 */
function isSetListing(title: string, price: number): boolean {
  const titleLower = title.toLowerCase();
  
  // If price is low, probably not a set
  if (price < 80) {
    return false;
  }
  
  // Look for set number patterns (4-5 digit numbers that aren't minifig codes)
  const setPatterns = [
    /\b\d{5}\b/,  // 5-digit set numbers (75192, 10294)
    /\b[1-9]\d{3}\b(?![\da-z])/i,  // 4-digit set numbers not followed by letters
    /set\s+\d{4,5}/i,
    /\bset\s+#?\d{4,5}\b/i,
    /\bnr\.?\s*\d{4,5}\b/i,
  ];
  
  const hasSetNumber = setPatterns.some(p => p.test(title));
  
  // If has set number AND set-indicating words, likely a set
  const setWords = ['set', 'complete', 'komplett', 'ovp', 'misb', 'nisb', 'bnisb'];
  const hasSetWord = setWords.some(w => titleLower.includes(w));
  
  if (hasSetNumber && hasSetWord && price > 100) {
    return true;
  }
  
  // Very high price + set indicators = likely set
  if (price > 200 && hasSetWord) {
    return true;
  }
  
  return false;
}

// ============================================
// PRICE VALIDATION
// ============================================

/**
 * Check if price is reasonable for a minifig
 * Most minifigs: €1-€300
 * Rare/exclusive: up to €1000+
 * Over €2000 is very suspicious
 */
function isPriceReasonable(price: number): { valid: boolean; reason?: string } {
  if (price < 0.50) {
    return { valid: false, reason: 'Price too low (< €0.50) - likely scam or wrong item' };
  }
  
  if (price > 2000) {
    return { valid: false, reason: 'Price too high (> €2000) - likely wrong item or scam' };
  }
  
  return { valid: true };
}

// ============================================
// CONDITION MATCHING
// ============================================

/**
 * Check if eBay condition matches user's filter
 */
function conditionMatchesFilter(
  condition: string | null | undefined,
  userWantsCondition: 'new' | 'used' | 'any'
): boolean {
  if (userWantsCondition === 'any') return true;
  if (!condition) return true; // Unknown = let through
  
  const conditionLower = condition.toLowerCase();
  
  // New indicators
  const newKeywords = ['new', 'neu', 'neuf', 'nuevo', 'nuovo', 'nieuw', 'nowy'];
  const isNew = newKeywords.some(kw => conditionLower.includes(kw));
  
  // Used indicators
  const usedKeywords = ['used', 'gebraucht', 'occasion', 'usado', 'usato', 'gebruikt', 'pre-owned'];
  const isUsed = usedKeywords.some(kw => conditionLower.includes(kw));
  
  // "New: Other" is more like used for minifigs (opened polybag, etc.)
  const isNewOther = isNew && /\b(other|sonstige|autre|otro|altro)\b/i.test(conditionLower);
  
  if (userWantsCondition === 'new') {
    if (isUsed || isNewOther) return false;
    return isNew;
  }
  
  if (userWantsCondition === 'used') {
    // Accept used OR "new other"
    if (isNew && !isNewOther) return false;
    return true;
  }
  
  return true;
}

// ============================================
// MAIN FILTER FUNCTION
// ============================================

export interface MinifigFilterResult {
  passed: boolean;
  reason?: string;
  qualityScore: number;
  codeFound?: string;
}

/**
 * Filter an eBay listing for minifigure validity
 * 
 * CORE LOGIC: Code is REQUIRED
 * - Must have BrickLink code (sw0001) OR Rebrickable code (fig-003509)
 * - Name-only matching is NOT allowed (too many variants with same name)
 * 
 * V3: Added part number and body part detection
 * 
 * @param title - Listing title
 * @param figNum - Minifigure ID to match (BrickLink or Rebrickable format)
 * @param figName - Minifigure name (for logging only, not used for matching)
 * @param price - Listing price in EUR
 * @param minQualityScore - Minimum score to pass (default 40)
 * @param condition - eBay condition string
 * @param userWantsCondition - User's condition preference
 */
export function filterMinifigListing(
  title: string,
  figNum: string,
  figName: string | null,
  price: number,
  minQualityScore: number = 40,
  condition?: string | null,
  userWantsCondition: 'new' | 'used' | 'any' = 'any'
): MinifigFilterResult {
  
  // ============================================
  // STEP 1: Must contain LEGO brand
  // ============================================
  if (!titleContainsLegoBrand(title)) {
    return { 
      passed: false, 
      reason: 'No LEGO brand in title', 
      qualityScore: 5 
    };
  }
  
  // ============================================
  // STEP 2: Must contain matching code (BrickLink OR Rebrickable)
  // This is the KEY difference - name alone is NOT enough!
  // ============================================
  if (!titleContainsMatchingCode(title, figNum)) {
    return { 
      passed: false, 
      reason: `Code "${figNum}" not found in title (name-only matching disabled)`, 
      qualityScore: 10 
    };
  }
  
  // ============================================
  // STEP 3: Check for LEGO part numbers (V3)
  // If title has part numbers like 970c55pb04, it's a PART, not complete minifig
  // ============================================
  const partNumberCheck = containsLegoPartNumber(title);
  if (partNumberCheck.found) {
    return { 
      passed: false, 
      reason: `Contains LEGO part number "${partNumberCheck.partNumber}" - likely a part, not complete minifig`, 
      qualityScore: 12 
    };
  }
  
  // ============================================
  // STEP 4: Check for standalone body part words (V3)
  // If title mentions "piernas", "pelo", etc. WITHOUT "minifig" context
  // ============================================
  const bodyPartCheck = isBodyPartListing(title);
  if (bodyPartCheck.found) {
    return { 
      passed: false, 
      reason: `Appears to be ${bodyPartCheck.type} part only ("${bodyPartCheck.part}"), not complete minifig`, 
      qualityScore: 15 
    };
  }
  
  // ============================================
  // STEP 5: Check for negative keywords
  // ============================================
  const negativeCheck = containsNegativeKeywords(title);
  if (negativeCheck.found) {
    return { 
      passed: false, 
      reason: `Contains negative keyword: "${negativeCheck.keyword}"`, 
      qualityScore: 15 
    };
  }
  
  // ============================================
  // STEP 6: Check if it's actually a set listing
  // ============================================
  if (isSetListing(title, price)) {
    return { 
      passed: false, 
      reason: 'Appears to be a full set listing, not individual minifig', 
      qualityScore: 20 
    };
  }
  
  // ============================================
  // STEP 7: Validate price range
  // ============================================
  const priceCheck = isPriceReasonable(price);
  if (!priceCheck.valid) {
    return { 
      passed: false, 
      reason: priceCheck.reason, 
      qualityScore: 10 
    };
  }
  
  // ============================================
  // STEP 8: Check condition matches user preference
  // ============================================
  if (!conditionMatchesFilter(condition, userWantsCondition)) {
    return { 
      passed: false, 
      reason: `Condition "${condition}" does not match filter "${userWantsCondition}"`, 
      qualityScore: 30 
    };
  }
  
  // ============================================
  // STEP 9: Calculate quality score
  // ============================================
  let qualityScore = 70; // Start high since code matched
  
  // Bonus: Has minifig-indicating words
  const minifigWords = ['minifig', 'minifigure', 'minifigur', 'figurine', 'figura', 'figuur'];
  if (minifigWords.some(w => title.toLowerCase().includes(w))) {
    qualityScore += 10;
  }
  
  // Bonus: Has name match (in addition to code)
  if (figName && title.toLowerCase().includes(figName.toLowerCase())) {
    qualityScore += 10;
  }
  
  // Bonus: Reasonable price range (€5-€100 is typical)
  if (price >= 5 && price <= 100) {
    qualityScore += 5;
  }
  
  // Cap at 100
  qualityScore = Math.min(100, qualityScore);
  
  // ============================================
  // STEP 10: Final check against minimum score
  // ============================================
  if (qualityScore < minQualityScore) {
    return { 
      passed: false, 
      reason: `Quality score ${qualityScore} below threshold ${minQualityScore}`, 
      qualityScore 
    };
  }
  
  // ============================================
  // PASSED ALL CHECKS
  // ============================================
  return { 
    passed: true, 
    qualityScore,
    codeFound: figNum 
  };
}

// ============================================
// UTILITY EXPORTS
// ============================================

/**
 * Get default exclude words for minifig watches (UI display)
 */
export function getDefaultMinifigExcludeWords(): string[] {
  return [
    'custom', 'moc', 'fake', 'replica', 'compatible',
    'konvolut', 'lot of', 'bundle',
    'nur kopf', 'only head', 'nur torso', 'only torso',
    'keychain', 'magnet', 'schlüsselanhänger',
  ];
}

/**
 * Check if a string looks like a BrickLink minifig code
 */
export function isBricklinkMinifigCode(input: string): boolean {
  return /^[a-z]{2,4}\d{1,4}[a-z]?$/i.test(input.trim());
}

/**
 * Check if a string looks like a Rebrickable minifig code
 */
export function isRebrickableMinifigCode(input: string): boolean {
  return /^fig[-\s]?\d{6}$/i.test(input.trim());
}

/**
 * Check if a string is any valid minifig code format
 */
export function isValidMinifigCode(input: string): boolean {
  return isBricklinkMinifigCode(input) || isRebrickableMinifigCode(input);
}
