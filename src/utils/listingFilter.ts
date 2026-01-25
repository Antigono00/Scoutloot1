/**
 * Smart Listing Filter v6 (Updated V12)
 * 
 * Filters eBay listings to find ACTUAL complete LEGO sets, not:
 * - Individual minifigures (even if they're from the correct set)
 * - Individual parts that mention the set number
 * - Display cases / vitrines
 * - Instructions only
 * - SEO-stuffed listings that mention multiple sets
 * - Incomplete sets (without minifigures, etc.)
 * - Big figures only (Rancor creature without the set)
 * - Non-LEGO products (bearings, COBI, Mega Bloks, etc.)
 * - "New: Other" condition when user wants sealed new
 * - LED lighting kits (Vonado, BriksMax, Lightailing, etc.) - V12
 */

// Star Wars character names - if title has one of these + "figur/figure", it's a minifig
const CHARACTER_NAMES = [
  'luke', 'skywalker', 'malakili', 'gamorrean', 'guard', 'oola',
  'jabba', 'leia', 'han', 'solo', 'vader', 'darth', 'obi-wan', 'kenobi',
  'boba', 'fett', 'yoda', 'chewbacca', 'chewie', 'c-3po', 'r2-d2', 'r2d2',
  'palpatine', 'emperor', 'stormtrooper', 'trooper', 'pilot', 'droid',
  'anakin', 'padme', 'amidala', 'mace', 'windu', 'qui-gon', 'maul',
  'rey', 'finn', 'poe', 'kylo', 'ren', 'snoke', 'hux', 'phasma',
  'ahsoka', 'tano', 'mandalorian', 'mando', 'grogu', 'baby yoda',
  'clone', 'jedi', 'sith', 'ewok', 'wookiee', 'tusken', 'jawa',
  'greedo', 'bossk', 'dengar', 'ig-88', '4-lom', 'zuckuss',
  'bib fortuna', 'salacious', 'crumb', 'max rebo', 'sy snootles',
];

// Competitor brands to REJECT
const COMPETITOR_BRANDS = [
  'cobi',           // Polish brick brand
  'mega bloks',     // Mattel competitor
  'megabloks',
  'mega construx',  // Newer Mega brand name
  'lepin',          // Chinese knockoff
  'lele',           // Chinese knockoff
  'bela',           // Chinese knockoff
  'decool',         // Chinese knockoff
  'sembo',          // Chinese knockoff
  'sy block',       // Chinese knockoff
  'king',           // Chinese knockoff
  'queen',          // Chinese knockoff (Queen Anne's Revenge etc.)
  'kazi',           // Chinese knockoff
  'gudi',           // Chinese knockoff
  'enlighten',      // Chinese brick brand
  'xingbao',        // Chinese brick brand
  'mould king',     // Chinese brick brand
  'cada',           // Chinese technic brand
  'playmobil',      // Different toy brand
  'nanoblock',      // Micro brick brand
  'oxford',         // Korean brick brand
  'bluebrixx',      // Competitor brick brand
  'qman',           // Chinese brick brand
  'wange',          // Chinese brick brand
  'sluban',         // Chinese brick brand
];

// Non-LEGO product keywords that indicate this is NOT a LEGO listing
const NON_LEGO_PRODUCTS = [
  // Bearings (various languages)
  'rodamiento',     // Bearing (Spanish)
  'kugellager',     // Ball bearing (German)
  'bearing',        // Bearing
  'roulement',      // Bearing (French)
  'cuscinetto',     // Bearing (Italian)
  'lager ',         // Bearing (German, with space to avoid "lager" in other contexts)
  'fag ',           // FAG bearing brand
  'skf ',           // SKF bearing brand
  'nsk ',           // NSK bearing brand
  'ntn ',           // NTN bearing brand
  'ina ',           // INA bearing brand
  'timken',         // Timken bearing brand
  'rótula',         // Ball joint (Spanish)
  
  // Military models (often COBI)
  'battleship',     // COBI makes battleships
  'acorazado',      // Battleship (Spanish)
  'panzer',         // Tank - often COBI (unless with LEGO)
  'warship',        // COBI makes warships
  'kriegsschiff',   // Warship (German)
  'pennsylvania',   // USS Pennsylvania - COBI set
  'missouri',       // USS Missouri - COBI set (unless LEGO specific)
  'yamato',         // Japanese battleship - COBI
  'bismarck',       // German battleship - COBI (unless LEGO specific)
  'tirpitz',        // German battleship - COBI
  
  // ============================================
  // LED LIGHTING KITS (V12)
  // Third-party LED kits that mention LEGO set numbers
  // ============================================
  
  // LED kit brand names
  'vonado',         // Major LED kit brand
  'briksmax',       // LED kit brand
  'briksmax',       // Alternate spelling
  'lightailing',    // LED kit brand
  'lightaling',     // Common misspelling
  'light my bricks', // LED kit brand
  'lightmybricks',  // No space variant
  'brick loot',     // LED kit brand
  'brickloot',      // No space variant
  'game of bricks', // LED kit brand
  'gameofbricks',   // No space variant
  'joy mags',       // LED kit brand
  'joymags',        // No space variant
  'kyglaring',      // LED kit brand
  'brickbling',     // LED kit brand
  'lmb ',           // Light My Bricks abbreviation
  
  // LED kit keywords (English)
  'led lighting',   // LED lighting kit
  'led light kit',  // LED light kit
  'led kit',        // LED kit
  'led set',        // LED set
  'lighting kit',   // Lighting kit
  'light kit',      // Light kit
  'led beleuchtung', // LED lighting (German)
  'beleuchtungsset', // Lighting set (German)
  'licht set',      // Light set (German)
  'lichtset',       // Light set (German, no space)
  'led-beleuchtung', // LED lighting (German with hyphen)
  'led leuchten',   // LED lights (German)
  
  // LED kit keywords (French)
  'kit lumière',    // Light kit (French)
  'kit lumiere',    // Light kit (French, no accent)
  'kit éclairage',  // Lighting kit (French)
  'kit eclairage',  // Lighting kit (French, no accent)
  'led éclairage',  // LED lighting (French)
  'led eclairage',  // LED lighting (French, no accent)
  'kit led',        // LED kit (French/Spanish/Italian)
  
  // LED kit keywords (Spanish)
  'kit iluminación', // Lighting kit (Spanish)
  'kit iluminacion', // Lighting kit (Spanish, no accent)
  'iluminación led', // LED lighting (Spanish)
  'iluminacion led', // LED lighting (Spanish, no accent)
  'luces led',      // LED lights (Spanish)
  'kit de luces',   // Light kit (Spanish)
  
  // LED kit keywords (Italian)
  'kit illuminazione', // Lighting kit (Italian)
  'illuminazione led', // LED lighting (Italian)
  'kit luce',       // Light kit (Italian)
  'luci led',       // LED lights (Italian)
  
  // LED kit keywords (Dutch)
  'led verlichting', // LED lighting (Dutch)
  'verlichtingsset', // Lighting set (Dutch)
  'licht set',      // Light set (Dutch)
  
  // Generic LED patterns
  'only led',       // Only LED (not the set)
  'nur led',        // Only LED (German)
  'solo led',       // Only LED (Spanish/Italian)
  'uniquement led', // Only LED (French)
];

// Multi-language negative keywords
const NEGATIVE_KEYWORDS = [
  // Display cases
  'vitrine', 'vitrina', 'display case', 'showcase', 'acryl', 'acrylic',
  'schaukasten', 'glasvitrine', 'staubschutz', 'dust cover',
  // Parts
  'einzelteil', 'einzelteile', 'ersatzteil', 'ersatzteile', 'spare part',
  'nur körper', 'only body', 'nur kopf', 'only head',
  'nur arm', 'only arm', 'nur bein', 'only leg',
  'steine aus', 'bricks from', 'teile aus', 'parts from',
  'tür aus', 'door from', 'tor aus', 'gate from',
  'teil aus', 'part from', 'teil von',
  // Minifigures
  'minifigur', 'minifigure', 'minifig ', 'mini fig ',
  'figur aus', 'figure from', 'figurine du',
  'aus set ', 'from set ', 'du set ', 'dal set ', 'del set ',
  '1x lego', '2x lego', '3x lego', '4x lego', '5x lego',
  'konvolut figur', 'bundle figure', 'lot figur',
  'nur figur', 'only figure', 'just figure', 'solo figura',
  'sammelfigur',
  // Instructions only
  'nur anleitung', 'only instructions', 'instructions only',
  'bauanleitung nur', 'manual only', 'solo instrucciones',
  'ohne steine', 'without bricks', 'no bricks',
  // Incomplete
  'ohne figuren', 'without figures', 'without minifigures', 'sans figurines',
  'ohne minifiguren', 'sin figuras', 'senza minifigure',
  'ohne box', 'without box', 'no box', 'sans boite', 'ohne ovp',
  'unvollständig', 'incomplete', 'incompleto', 'incomplet',
  'nicht komplett', 'not complete', 'pas complet',
  'teile fehlen', 'parts missing', 'missing parts',
  'defekt', 'defect', 'broken', 'kaputt', 'beschädigt', 'damaged',
  // Box only
  'nur box', 'nur karton', 'nur verpackung', 'only box', 'box only',
  'empty box', 'leere box', 'boite vide', 'caja vacia',
  // Stickers
  'aufkleber nur', 'stickerbogen', 'sticker sheet', 'decal sheet',
  // Custom
  'moc ', ' moc', 'custom build', 'eigenbau', 'selbstgebaut',
  // Wanted
  'suche', 'looking for', 'recherche', 'cerco', 'busco', 'gezocht',
  'wanted', 'wtb', 'want to buy',
  // Big figure parts
  'rancor figur', 'rancor figure', 'figura rancor',
  'nur rancor', 'only rancor', 'solo rancor',
  'rancor monster', 'rancor tier', 'rancor sammelfigur',
];

// Strong positive keywords (sealed, complete)
const STRONG_POSITIVE_KEYWORDS = [
  'komplett set', 'complete set', 'set completo', 'set complet',
  'komplettset',
  'neu ovp', 'new sealed', 'neuf scellé', 'nuevo sellado',
  'misb', 'nisb', 'bnisb',
  'originalverpackt', 'factory sealed',
  'mit allen figuren', 'with all figures', 'all minifigures included',
];

// Set name keywords for validation
const SET_NAME_KEYWORDS: Record<string, string[]> = {
  '75005': ['rancor', 'pit'],
  '75192': ['millennium', 'falcon'],
  '75059': ['sandcrawler'],
  '75244': ['tantive'],
  '10497': ['galaxy', 'explorer'],
  '75810': ['upside', 'down', 'stranger'],
  '9516': ['jabba', 'palace'],
  '75220': ['sandcrawler'],
  '21309': ['saturn', 'apollo', 'nasa', 'rocket'], // Saturn V - helps filter out bearings
  '4842': ['hogwarts', 'castle', 'harry', 'potter'], // Hogwarts Castle 2010
};

/**
 * Check if set number is in title (not as part code)
 */
function titleContainsSetNumber(title: string, setNumber: string): boolean {
  const regex = new RegExp(`\\b${setNumber}\\b(?![a-z]|pb|c\\d)`, 'i');
  return regex.test(title);
}

/**
 * Check if title contains LEGO brand
 * This is CRITICAL for filtering out non-LEGO products
 */
function titleContainsLegoBrand(title: string): boolean {
  const titleLower = title.toLowerCase();
  
  // Must contain "lego" somewhere in the title
  // This filters out bearings, COBI sets, etc.
  return /\blego\b/i.test(titleLower);
}

/**
 * Check if listing is from a competitor brand
 */
function isCompetitorBrand(title: string): boolean {
  const titleLower = title.toLowerCase();
  return COMPETITOR_BRANDS.some(brand => titleLower.includes(brand.toLowerCase()));
}

/**
 * Check if listing is a non-LEGO product (bearing, LED kit, etc.)
 */
function isNonLegoProduct(title: string): boolean {
  const titleLower = title.toLowerCase();
  return NON_LEGO_PRODUCTS.some(keyword => titleLower.includes(keyword.toLowerCase()));
}

/**
 * Check if title contains negative keywords
 */
function containsNegativeKeywords(title: string): boolean {
  const titleLower = title.toLowerCase();
  return NEGATIVE_KEYWORDS.some(kw => titleLower.includes(kw.toLowerCase()));
}

/**
 * Check if title has strong positive indicators
 */
function containsStrongPositiveKeywords(title: string): boolean {
  const titleLower = title.toLowerCase();
  return STRONG_POSITIVE_KEYWORDS.some(kw => titleLower.includes(kw.toLowerCase()));
}

/**
 * Check if title matches set name keywords
 */
function titleMatchesSetName(title: string, setNumber: string): boolean {
  const titleLower = title.toLowerCase();
  const keywords = SET_NAME_KEYWORDS[setNumber];
  if (!keywords) return true; // Can't validate without keywords
  return keywords.some(kw => titleLower.includes(kw));
}

/**
 * CRITICAL: Check eBay condition for "New: Other" variants
 * 
 * eBay conditions that mean "NOT truly sealed new":
 * - "Neu: Sonstige (siehe Artikelbeschreibung)" - German
 * - "New: Other (see details)" - English
 * - "Neuf: autre (voir détails)" - French
 * - "Nuevo: Otro (ver detalles)" - Spanish
 * - "Nuovo: Altro (vedi dettagli)" - Italian
 * 
 * These are open box, damaged packaging, or otherwise not factory sealed.
 */
function isNewOtherCondition(condition: string | null | undefined): boolean {
  if (!condition) return false;
  
  const conditionLower = condition.toLowerCase();
  
  // Patterns that indicate "New: Other" (not truly new/sealed)
  const newOtherPatterns = [
    'sonstige',       // German "Other"
    'other',          // English
    'autre',          // French
    'otro',           // Spanish
    'altro',          // Italian
    'anders',         // Dutch
    'see details',    // English variant
    'siehe artikel',  // German variant
    'voir détails',   // French variant
    'ver detalles',   // Spanish variant
    'vedi dettagli',  // Italian variant
  ];
  
  // Must contain "new/neu/neuf/nuevo/nuovo" AND one of the "other" keywords
  const hasNewKeyword = /\b(new|neu|neuf|nuevo|nuovo|nieuw)\b/i.test(conditionLower);
  const hasOtherKeyword = newOtherPatterns.some(pattern => conditionLower.includes(pattern));
  
  return hasNewKeyword && hasOtherKeyword;
}

/**
 * Normalize condition and check if it matches user's filter
 * 
 * @param condition - eBay condition string
 * @param userWantsCondition - 'new', 'used', or 'any'
 * @returns true if condition is acceptable, false if should be filtered out
 */
export function conditionMatchesFilter(
  condition: string | null | undefined,
  userWantsCondition: 'new' | 'used' | 'any'
): boolean {
  // If user wants any condition, always pass
  if (userWantsCondition === 'any') return true;
  
  if (!condition) return true; // Unknown condition, let it through
  
  const conditionLower = condition.toLowerCase();
  
  if (userWantsCondition === 'new') {
    // User wants NEW - must be truly new, not "New: Other"
    
    // REJECT "New: Other" variants
    if (isNewOtherCondition(condition)) {
      return false;
    }
    
    // Must contain a "new" keyword
    const newKeywords = ['new', 'neu', 'neuf', 'nuevo', 'nuovo', 'nieuw', 'sealed', 'misb', 'nisb', 'bnib'];
    const isNew = newKeywords.some(kw => conditionLower.includes(kw));
    
    // REJECT if it's clearly used
    const usedKeywords = ['used', 'gebraucht', 'occasion', 'usado', 'usato', 'gebruikt', 'pre-owned', 'preowned'];
    const isUsed = usedKeywords.some(kw => conditionLower.includes(kw));
    
    if (isUsed) return false;
    
    return isNew;
  }
  
  if (userWantsCondition === 'used') {
    // User wants USED - reject anything clearly new
    const newKeywords = ['new', 'neu', 'neuf', 'nuevo', 'nuovo', 'nieuw', 'sealed', 'misb', 'nisb', 'bnib'];
    const isNew = newKeywords.some(kw => conditionLower.includes(kw));
    
    // "New: Other" is acceptable for used filter (it's basically used/open box)
    if (isNewOtherCondition(condition)) return true;
    
    return !isNew;
  }
  
  return true;
}

/**
 * CRITICAL: Detect if this is a CHARACTER FIGURE listing
 * Pattern: [Character Name] + "Figur/Figure" = REJECT
 */
function isCharacterFigureListing(title: string): boolean {
  const titleLower = title.toLowerCase();
  
  // Check if title has "figur" or "figure" (singular, not "figuren"/"figures" which means "with figures")
  const hasFigurSingular = /\bfigur\b|\bfigure\b|\bfigura\b/i.test(titleLower);
  
  if (!hasFigurSingular) {
    return false;
  }
  
  // If it says "mit figuren" or "with figures" or "inkl. figuren", it's about included minifigs, not a figure listing
  if (/mit\s+figur|with\s+figure|inkl\.?\s*figur|incl\.?\s*figure|alle\s+figur|all\s+figure/i.test(titleLower)) {
    return false;
  }
  
  // Check if any character name is in the title
  const hasCharacterName = CHARACTER_NAMES.some(name => titleLower.includes(name.toLowerCase()));
  
  if (hasCharacterName) {
    return true; // Character name + "figur" = minifig listing
  }
  
  // Check pattern: "Figur - Set" or "Figure - Set" (common pattern for figure listings)
  if (/figur[ae]?\s*[-–—]\s*set/i.test(titleLower)) {
    return true;
  }
  
  // Check pattern: "[word] Figur [set number]" at start
  if (/^[a-z]+\s+figur/i.test(titleLower)) {
    return true;
  }
  
  return false;
}

/**
 * Check if title indicates a PART (door, gate, brick, plate)
 */
function isPartListing(title: string, price: number): boolean {
  const titleLower = title.toLowerCase();
  
  // Part patterns with prices typically under €60
  if (price > 60) return false;
  
  const partPatterns = [
    /\btür\b/i,       // Door (German)
    /\btor\b/i,       // Gate (German)  
    /\bgate\b/i,      // Gate
    /\bdoor\b/i,      // Door
    /\b\d{4,6}pb\d/i, // Part number with print code
    /\bteil\b/i,      // Part (German)
  ];
  
  // Don't flag if it has "Rancor Pit" (set name contains "pit")
  if (titleLower.includes('rancor pit')) {
    return false;
  }
  
  return partPatterns.some(p => p.test(titleLower));
}

/**
 * Check if it's likely a minifig based on price and patterns
 */
function isLikelyMinifigure(title: string, price: number): boolean {
  const titleLower = title.toLowerCase();
  
  // Minifig code patterns
  if (/\bsw\d{3,4}\b/i.test(titleLower)) return true;
  if (/\b\d+x\s*lego/i.test(titleLower)) return true;
  if (/\baus\s+\d{4,5}\b/i.test(titleLower)) return true;
  
  // Very low price without strong positives = suspicious
  if (price < 50 && !containsStrongPositiveKeywords(title)) {
    return true;
  }
  
  return false;
}

/**
 * Check if set number is primary (not SEO stuffing or multi-set listing)
 */
function isSetNumberPrimary(title: string, setNumber: string): boolean {
  const titleLower = title.toLowerCase();
  
  // Find all potential set numbers (4-5 digits that look like LEGO sets)
  const allNumbers = titleLower.match(/\b\d{4,5}\b/g) || [];
  
  // Filter to likely set numbers (exclude obvious years)
  const setNumbers = allNumbers.filter(num => {
    const n = parseInt(num);
    if (n >= 1990 && n <= 2030) return false;
    return true;
  });
  
  const uniqueSetNumbers = [...new Set(setNumbers)];
  
  // RULE 1: 3+ unique set numbers = SEO spam, always reject
  if (uniqueSetNumbers.length >= 3) {
    return false;
  }
  
  // RULE 2: 2 unique set numbers - check if ours is the PRIMARY one
  if (uniqueSetNumbers.length === 2) {
    const ourPosition = titleLower.indexOf(setNumber);
    const otherSetNumber = uniqueSetNumbers.find(n => n !== setNumber);
    const otherPosition = otherSetNumber ? titleLower.indexOf(otherSetNumber) : -1;
    
    if (ourPosition > otherPosition && otherPosition !== -1) {
      return false;
    }
    
    const complementaryKeywords = [
      'ergänzend', 'passend zu', 'complementary', 'goes with',
      'zu set', 'for set', 'with set', 'und set', 'and set',
      '+ ', ' + ', ' & ', ' und ', ' and ', ' et ', ' e ', ' y ',
    ];
    
    for (const keyword of complementaryKeywords) {
      if (titleLower.includes(keyword)) {
        return false;
      }
    }
  }
  
  return true;
}

/**
 * Calculate quality score (0-100)
 */
export function calculateListingQualityScore(
  title: string,
  setNumber: string,
  setName: string | null,
  price: number
): number {
  let score = 50;
  const titleLower = title.toLowerCase();
  
  // Hard fails
  if (!titleContainsSetNumber(title, setNumber)) return 0;
  if (!titleContainsLegoBrand(title)) return 5; // No LEGO brand = very low score
  if (isCompetitorBrand(title)) return 5;
  if (isNonLegoProduct(title)) return 5;
  if (isCharacterFigureListing(title)) return 10;
  if (isLikelyMinifigure(title, price)) return 15;
  if (isPartListing(title, price)) return 15;
  if (containsNegativeKeywords(title)) return 20;
  if (!isSetNumberPrimary(title, setNumber)) return 25;
  
  // Positives
  if (titleMatchesSetName(title, setNumber)) score += 25;
  if (containsStrongPositiveKeywords(title)) score += 20;
  
  // Price bonuses
  if (price >= 200) score += 15;
  else if (price >= 150) score += 10;
  else if (price >= 100) score += 5;
  else if (price < 80) score -= 10;
  
  return Math.max(0, Math.min(100, score));
}

export interface FilterResult {
  passed: boolean;
  reason?: string;
  qualityScore: number;
}

/**
 * Main filter function
 */
export function filterListing(
  title: string,
  setNumber: string,
  setName: string | null,
  price: number,
  minQualityScore: number = 50,
  condition?: string | null,
  userWantsCondition: 'new' | 'used' | 'any' = 'any'
): FilterResult {
  // Step 0: CRITICAL - Check for competitor brands and non-LEGO products FIRST
  if (isCompetitorBrand(title)) {
    return { passed: false, reason: 'Competitor brand (COBI, Mega Bloks, etc.)', qualityScore: 5 };
  }
  
  if (isNonLegoProduct(title)) {
    return { passed: false, reason: 'Non-LEGO product (bearing, LED kit, etc.)', qualityScore: 5 };
  }
  
  // Step 1: Set number must be in title
  if (!titleContainsSetNumber(title, setNumber)) {
    return { passed: false, reason: 'Set number not found in title', qualityScore: 0 };
  }
  
  // Step 2: CRITICAL - Must contain "LEGO" in title
  if (!titleContainsLegoBrand(title)) {
    return { passed: false, reason: 'Title does not contain LEGO brand', qualityScore: 5 };
  }
  
  // Step 3: Check condition matches user filter
  if (!conditionMatchesFilter(condition, userWantsCondition)) {
    return { passed: false, reason: `Condition "${condition}" does not match filter "${userWantsCondition}"`, qualityScore: 30 };
  }
  
  // Step 4: REJECT character figure listings (catches deceptive titles!)
  if (isCharacterFigureListing(title)) {
    return { passed: false, reason: 'Character figure listing (e.g., "Luke Skywalker Figur")', qualityScore: 10 };
  }
  
  // Step 5: Reject likely minifigures
  if (isLikelyMinifigure(title, price)) {
    return { passed: false, reason: 'Likely minifigure listing', qualityScore: 15 };
  }
  
  // Step 6: Reject parts
  if (isPartListing(title, price)) {
    return { passed: false, reason: 'Likely part listing', qualityScore: 15 };
  }
  
  // Step 7: Reject negative keywords
  if (containsNegativeKeywords(title)) {
    return { passed: false, reason: 'Contains negative keywords', qualityScore: 20 };
  }
  
  // Step 8: Check if set number is primary
  if (!isSetNumberPrimary(title, setNumber)) {
    return { passed: false, reason: 'Set number not primary (SEO stuffing)', qualityScore: 25 };
  }
  
  // Step 9: Calculate quality score
  const qualityScore = calculateListingQualityScore(title, setNumber, setName, price);
  
  if (qualityScore < minQualityScore) {
    return { passed: false, reason: `Quality score ${qualityScore} < ${minQualityScore}`, qualityScore };
  }
  
  return { passed: true, qualityScore };
}

/**
 * Get default exclude words for UI display
 */
export function getDefaultExcludeWords(): string[] {
  return [
    'vitrine', 'display case', 'einzelteil', 'spare part',
    'nur anleitung', 'instructions only', 'ohne figuren', 
    'without figures', 'unvollständig', 'incomplete',
    'minifigur', 'minifigure',
  ];
}
