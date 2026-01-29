/**
 * Minifigure Listing Filter for eBay
 * 
 * IMPORTANT: This filter has OPPOSITE logic compared to the set filter!
 * - For SETS: We REJECT listings with minifigure keywords
 * - For MINIFIGS: We WANT listings with minifigure keywords
 * 
 * This filter validates that an eBay listing is for the CORRECT minifigure,
 * not for a different minifig, a full set, or unrelated items.
 */

// ============================================
// POSITIVE KEYWORDS (signals this is a minifig listing)
// ============================================

const MINIFIG_POSITIVE_KEYWORDS = [
  // Minifigure terms (all languages)
  'minifigure', 'minifigur', 'minifig', 'mini fig',
  'figurine', 'figura', 'figuur', 'figurka',
  'figurka lego', 'lego figur', 'lego figure',
  
  // Condition indicators for minifigs
  'polybag', 'poly bag', 'sealed', 'new', 'mint',
  'complete', 'with accessories', 'mit zubehör',
  
  // Part indicators that are OK for minifigs
  'torso', 'legs', 'head', 'hair', 'helmet', 'cape',
  'accessory', 'weapon', 'lightsaber', 'blaster',
];

// ============================================
// NEGATIVE KEYWORDS (signals this is NOT just the minifig)
// ============================================

const MINIFIG_NEGATIVE_KEYWORDS = [
  // Full sets (we want just the minifig)
  'komplett set', 'complete set', 'set complet',
  'vollständig', 'vollstandig', 'komplettes set',
  'inkl. bauanleitung', 'with instructions',
  'mit ovp', 'with box', 'sealed box',
  'neu ovp', 'nisb', 'misb', 'bnisb',
  
  // Building instructions (not minifig)
  'bauanleitung', 'instructions', 'anleitung nur',
  'manual only', 'instructions only',
  
  // Display cases
  'vitrine', 'display case', 'showcase', 'acryl',
  'schaukasten', 'sammelbox',
  
  // Custom/MOC
  'moc ', ' moc', 'custom', 'eigenbau', 'selbstgebaut',
  'modified', 'custom printed', 'purist',
  
  // Wanted/Looking for
  'suche', 'wanted', 'looking for', 'recherche',
  'cerco', 'busco', 'gezocht', 'wtb',
  
  // Lots/Bundles (often mixed quality)
  'konvolut', 'sammlung', 'lot of', 'bundle',
  'set of', 'collection', 'bulk',
  
  // Parts only (not complete minifig)
  'nur kopf', 'only head', 'head only',
  'nur torso', 'only torso', 'torso only',
  'nur beine', 'only legs', 'legs only',
  'nur haare', 'only hair', 'hair only',
  'ersatzteil', 'spare part', 'replacement',
  
  // Non-LEGO brands
  'cobi', 'mega bloks', 'lepin', 'lele', 'bela',
  'decool', 'sembo', 'king', 'kazi', 'playmobil',
  
  // Digital/Non-physical
  'digital', 'nft', 'print', 'poster', 'sticker',
  'aufkleber', 'decal',
];

// ============================================
// CHARACTER VALIDATION
// ============================================

// Map of minifig theme prefixes to character name lists
const THEME_CHARACTERS: Record<string, string[]> = {
  'sw': [
    // Star Wars main characters
    'luke', 'skywalker', 'vader', 'darth', 'anakin', 'obi-wan', 'kenobi',
    'yoda', 'palpatine', 'emperor', 'leia', 'han', 'solo', 'chewbacca', 'chewie',
    'boba', 'fett', 'jango', 'mandalorian', 'mando', 'grogu', 'baby yoda',
    'rey', 'kylo', 'ren', 'finn', 'poe', 'snoke', 'hux', 'phasma',
    'maul', 'dooku', 'grievous', 'ahsoka', 'tano', 'padme', 'amidala',
    'mace', 'windu', 'qui-gon', 'jinn',
    // Troopers
    'stormtrooper', 'clone', 'trooper', 'scout', 'pilot', 'commander',
    'captain', 'sergeant', 'lieutenant', 'rex', 'cody', 'fives', 'echo',
    // Aliens/Creatures
    'jabba', 'hutt', 'ewok', 'wookiee', 'jawa', 'tusken', 'gamorrean',
    'twi\'lek', 'rodian', 'greedo', 'bossk', 'dengar', 'ig-88', '4-lom',
    'zuckuss', 'rancor', 'wampa',
    // Droids
    'r2-d2', 'r2d2', 'c-3po', 'c3po', 'bb-8', 'bb8', 'droid', 'gonk', 'astromech',
    'battle droid', 'super battle droid', 'destroyer droid', 'droideka',
  ],
  'sh': [
    // Marvel
    'spider-man', 'spiderman', 'iron man', 'ironman', 'captain america',
    'thor', 'hulk', 'black widow', 'hawkeye', 'ant-man', 'wasp',
    'black panther', 'doctor strange', 'scarlet witch', 'vision',
    'thanos', 'loki', 'ultron', 'venom', 'carnage', 'green goblin',
    'miles morales', 'gwen stacy', 'ghost spider',
    // DC
    'batman', 'superman', 'wonder woman', 'flash', 'aquaman', 'cyborg',
    'joker', 'harley', 'quinn', 'catwoman', 'riddler', 'penguin', 'bane',
    'robin', 'batgirl', 'nightwing', 'alfred',
  ],
  'hp': [
    // Harry Potter
    'harry', 'potter', 'hermione', 'granger', 'ron', 'weasley',
    'dumbledore', 'snape', 'mcgonagall', 'hagrid', 'voldemort',
    'draco', 'malfoy', 'neville', 'luna', 'lovegood', 'ginny',
    'sirius', 'black', 'remus', 'lupin', 'dobby', 'kreacher',
    'hedwig', 'fawkes', 'buckbeak', 'aragog',
  ],
  'cty': [
    // City generic
    'police', 'polizei', 'firefighter', 'feuerwehr', 'doctor', 'arzt',
    'pilot', 'astronaut', 'construction', 'builder', 'worker', 'arbeiter',
    'chef', 'farmer', 'scientist', 'explorer', 'diver', 'taucher',
  ],
  'njo': [
    // Ninjago
    'kai', 'jay', 'cole', 'zane', 'lloyd', 'nya', 'wu', 'garmadon',
    'ninja', 'samurai', 'skeleton', 'serpentine', 'ghost', 'oni',
  ],
};

// ============================================
// FIG_NUM VALIDATION
// ============================================

/**
 * Check if the listing title contains the minifig ID
 * e.g., "sw0001" should be in title for Star Wars minifig sw0001
 */
function titleContainsFigNum(title: string, figNum: string): boolean {
  const titleLower = title.toLowerCase();
  const figNumLower = figNum.toLowerCase();
  
  // Direct match
  if (titleLower.includes(figNumLower)) {
    return true;
  }
  
  // Match without leading zeros (e.g., "sw1" matches "sw0001")
  const normalized = figNumLower.replace(/^([a-z]+)0+/, '$1');
  if (titleLower.includes(normalized)) {
    return true;
  }
  
  // Match with space (e.g., "sw 0001")
  const withSpace = figNumLower.replace(/^([a-z]+)/, '$1 ');
  if (titleLower.includes(withSpace)) {
    return true;
  }
  
  return false;
}

/**
 * Check if title contains LEGO brand
 */
function titleContainsLegoBrand(title: string): boolean {
  return /\blego\b/i.test(title);
}

/**
 * Check if title contains any negative keywords
 */
function containsNegativeKeywords(title: string): boolean {
  const titleLower = title.toLowerCase();
  return MINIFIG_NEGATIVE_KEYWORDS.some(kw => titleLower.includes(kw.toLowerCase()));
}

/**
 * Check if title contains minifig-positive keywords
 */
function containsPositiveKeywords(title: string): boolean {
  const titleLower = title.toLowerCase();
  return MINIFIG_POSITIVE_KEYWORDS.some(kw => titleLower.includes(kw.toLowerCase()));
}

/**
 * Check if title mentions the correct character for this minifig theme
 */
function titleMatchesCharacter(title: string, figNum: string): boolean {
  const titleLower = title.toLowerCase();
  
  // Get theme prefix (sw, sh, hp, etc.)
  const themeMatch = figNum.match(/^([a-z]+)/i);
  if (!themeMatch) return true; // Can't validate, let it through
  
  const theme = themeMatch[1].toLowerCase();
  const characters = THEME_CHARACTERS[theme];
  
  // No character list for this theme = can't validate
  if (!characters) return true;
  
  // Check if any character name is in the title
  return characters.some(char => titleLower.includes(char.toLowerCase()));
}

/**
 * Check if this is a set listing (not individual minifig)
 */
function isSetListing(title: string, price: number): boolean {
  const titleLower = title.toLowerCase();
  
  // Set-like patterns
  const setPatterns = [
    /\b\d{4,5}\b(?!-[a-z])/i,  // 4-5 digit set numbers (not fig_nums like 0001)
    /set\s+\d{4,5}/i,
    /komplett\s+set/i,
    /complete\s+set/i,
    /original\s+set/i,
    /lego\s+\d{4,5}/i,
  ];
  
  const looksLikeSet = setPatterns.some(p => p.test(titleLower));
  
  // If price is very high and looks like a set, it's probably a set
  if (looksLikeSet && price > 100) {
    return true;
  }
  
  return false;
}

/**
 * Check if price is reasonable for a minifig
 * Most minifigs are €1-€500, with rare exceptions
 */
function isPriceReasonable(price: number): boolean {
  // Too cheap = probably scam or wrong item
  if (price < 0.50) return false;
  
  // Very expensive minifigs exist (Cloud City Boba, SDCC exclusives)
  // but over €2000 is suspicious
  if (price > 2000) return false;
  
  return true;
}

// ============================================
// QUALITY SCORING
// ============================================

/**
 * Calculate quality score for minifig listing (0-100)
 */
export function calculateMinifigQualityScore(
  title: string,
  figNum: string,
  price: number
): number {
  let score = 50; // Start neutral
  
  // REQUIRED: Must contain LEGO brand
  if (!titleContainsLegoBrand(title)) {
    return 10; // Very low score
  }
  
  // REQUIRED: Must contain fig_num or be obviously for this minifig
  if (!titleContainsFigNum(title, figNum)) {
    // Check if character matches at least
    if (!titleMatchesCharacter(title, figNum)) {
      return 15;
    }
    score -= 20; // Penalty for no fig_num, but character matches
  } else {
    score += 25; // Bonus for exact fig_num match
  }
  
  // Negative keywords = major penalty
  if (containsNegativeKeywords(title)) {
    score -= 30;
  }
  
  // Positive keywords = bonus
  if (containsPositiveKeywords(title)) {
    score += 15;
  }
  
  // Set listing = wrong category
  if (isSetListing(title, price)) {
    return 20;
  }
  
  // Price reasonability
  if (!isPriceReasonable(price)) {
    score -= 20;
  }
  
  // Price-based bonuses for typical minifig range
  if (price >= 5 && price <= 200) {
    score += 10; // Sweet spot for most minifigs
  }
  
  return Math.max(0, Math.min(100, score));
}

// ============================================
// MAIN FILTER FUNCTION
// ============================================

export interface MinifigFilterResult {
  passed: boolean;
  reason?: string;
  qualityScore: number;
}

/**
 * Filter an eBay listing for minifigure validity
 * 
 * @param title - Listing title
 * @param figNum - Minifigure ID (e.g., "sw0001")
 * @param figName - Minifigure name (optional, for better matching)
 * @param price - Listing price in EUR
 * @param minQualityScore - Minimum score to pass (default 40, lower than sets)
 * @param condition - eBay condition string (optional)
 * @param userWantsCondition - User's condition filter
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
  
  // Step 0: Must contain LEGO brand
  if (!titleContainsLegoBrand(title)) {
    return { passed: false, reason: 'Title does not contain LEGO brand', qualityScore: 10 };
  }
  
  // Step 1: Check for negative keywords (full sets, instructions, etc.)
  if (containsNegativeKeywords(title)) {
    return { passed: false, reason: 'Contains negative keywords (set, instructions, etc.)', qualityScore: 20 };
  }
  
  // Step 2: Check if it's actually a set listing
  if (isSetListing(title, price)) {
    return { passed: false, reason: 'Appears to be a set listing, not individual minifig', qualityScore: 20 };
  }
  
  // Step 3: Validate fig_num or character match
  const hasFigNum = titleContainsFigNum(title, figNum);
  const hasCharacter = titleMatchesCharacter(title, figNum);
  const hasName = figName ? title.toLowerCase().includes(figName.toLowerCase()) : false;
  
  if (!hasFigNum && !hasCharacter && !hasName) {
    return { passed: false, reason: 'Title does not match minifig ID or character', qualityScore: 15 };
  }
  
  // Step 4: Check condition if user has preference
  if (userWantsCondition !== 'any' && condition) {
    const conditionLower = condition.toLowerCase();
    
    if (userWantsCondition === 'new') {
      const isNew = /\b(new|neu|neuf|nuevo|nuovo|sealed|polybag)\b/i.test(conditionLower);
      if (!isNew) {
        return { passed: false, reason: `Condition "${condition}" does not match "new" filter`, qualityScore: 30 };
      }
    }
    
    if (userWantsCondition === 'used') {
      const isNew = /\b(new|neu|neuf|nuevo|nuovo|sealed|polybag)\b/i.test(conditionLower);
      if (isNew && !/\b(other|sonstige|autre|otro)\b/i.test(conditionLower)) {
        return { passed: false, reason: `Condition "${condition}" does not match "used" filter`, qualityScore: 30 };
      }
    }
  }
  
  // Step 5: Price reasonability
  if (!isPriceReasonable(price)) {
    return { passed: false, reason: `Price €${price.toFixed(2)} outside reasonable range`, qualityScore: 15 };
  }
  
  // Step 6: Calculate quality score
  const qualityScore = calculateMinifigQualityScore(title, figNum, price);
  
  if (qualityScore < minQualityScore) {
    return { passed: false, reason: `Quality score ${qualityScore} < ${minQualityScore}`, qualityScore };
  }
  
  return { passed: true, qualityScore };
}

// ============================================
// CONDITION MATCHING (for minifigs)
// ============================================

/**
 * Check if eBay condition matches user's filter for minifigs
 * 
 * For minifigs:
 * - "New" = sealed polybag or brand new
 * - "Used" = loose figure
 */
export function minifigConditionMatchesFilter(
  condition: string | null | undefined,
  userWantsCondition: 'new' | 'used' | 'any'
): boolean {
  if (userWantsCondition === 'any') return true;
  if (!condition) return true; // Unknown = let through
  
  const conditionLower = condition.toLowerCase();
  
  // New indicators
  const newKeywords = ['new', 'neu', 'neuf', 'nuevo', 'nuovo', 'nieuw', 'sealed', 'polybag'];
  const isNew = newKeywords.some(kw => conditionLower.includes(kw));
  
  // Used indicators
  const usedKeywords = ['used', 'gebraucht', 'occasion', 'usado', 'usato', 'gebruikt', 'pre-owned'];
  const isUsed = usedKeywords.some(kw => conditionLower.includes(kw));
  
  // "New: Other" is more like used for minifigs
  const isNewOther = /\b(new|neu|neuf)\b/i.test(conditionLower) && 
                     /\b(other|sonstige|autre|otro)\b/i.test(conditionLower);
  
  if (userWantsCondition === 'new') {
    if (isUsed || isNewOther) return false;
    return isNew;
  }
  
  if (userWantsCondition === 'used') {
    if (isNew && !isNewOther) return false;
    return true;
  }
  
  return true;
}

// ============================================
// EXPORT DEFAULT EXCLUDE WORDS FOR UI
// ============================================

export function getDefaultMinifigExcludeWords(): string[] {
  return [
    'komplett set', 'complete set', 'bauanleitung', 'instructions',
    'vitrine', 'display case', 'custom', 'moc', 'konvolut', 'lot of',
    'nur kopf', 'only head', 'nur torso', 'only torso',
  ];
}
