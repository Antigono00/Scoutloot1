/**
 * Smart Listing Filter V15 - BrickOwl Part Detection + "Only" Patterns
 * 
 * V15 Changes:
 * - Added BrickOwl part number pattern: (XXXXX / XXXXX) or (XXXXX) at end
 * - Added plain 'sticker' to negative keywords
 * - Added "for set" patterns in all languages (indicates part/accessory)
 * - Added "only" keyword patterns in all languages (indicates minifig/part)
 * - Fixed dimension patterns with spaces: "2 x 2"
 * - Added 21348 (Dungeons & Dragons) and 10190 (Market Street) to set keywords
 * 
 * Philosophy: Think broadly about patterns, not just specific cases.
 */

// ============================================
// CHARACTER NAMES AND ROLE TITLES (for minifig detection)
// If title has one of these + "figur/figure", or just the role alone, it's a minifig
// ============================================
const CHARACTER_NAMES = [
  // Star Wars characters
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
  'din djarin', 'bo-katan', 'moff gideon', 'cara dune', 'kuiil',
  // Marvel
  'spider-man', 'spiderman', 'iron man', 'ironman', 'captain america',
  'thor', 'hulk', 'black widow', 'hawkeye', 'thanos', 'groot',
  'rocket', 'black panther', 'doctor strange', 'ant-man', 'wasp',
  // DC
  'batman', 'superman', 'wonder woman', 'joker', 'harley quinn',
  'aquaman', 'flash', 'robin', 'batgirl', 'catwoman',
  // Harry Potter
  'harry potter', 'hermione', 'ron weasley', 'dumbledore', 'snape',
  'hagrid', 'voldemort', 'draco', 'mcgonagall', 'dobby',
  // Lord of the Rings
  'frodo', 'gandalf', 'legolas', 'aragorn', 'gimli', 'sauron',
  'gollum', 'smeagol', 'bilbo', 'samwise',
  // Other themes
  'wednesday', 'morticia', 'gomez', 'pugsley', 'uncle fester',
  'eleven', 'hopper', 'demogorgon', 'mike wheeler', 'dustin',
  // Dungeons & Dragons creatures
  'owl bear', 'owlbear', 'eulenbär', 'eulenbar', 'displacer beast', 'beholder',
  'gelatinous cube', 'mimic', 'red dragon', 'colin the fighter', 'colin',
];

// ============================================
// ROLE TITLES (indicate minifig listings)
// These are generic roles that when combined with a set number = minifig
// ============================================
const ROLE_TITLES = [
  // Military/Combat roles
  'crew member', 'crewmember', 'crew-member',
  'pilot', 'piloto', 'pilote', 'pilota',
  'gunner', 'artillero', 'artilleur', 'artigliere',
  'soldier', 'soldado', 'soldat', 'soldato',
  'trooper', 'officer', 'commander', 'captain', 'lieutenant',
  'general', 'admiral', 'sergeant', 'private', 'specialist',
  'scout', 'sniper', 'medic', 'engineer',
  
  // Star Wars specific roles (multilingual)
  'rebel', 'rebelle', 'rebelde',  // rebel in EN/FR/ES
  'imperial', 'impérial', 'imperiale',
  'resistance', 'résistance', 'resistencia',
  'first order', 'premier ordre', 'primera orden',
  'sith lord', 'jedi master', 'jedi knight', 'padawan',
  'bounty hunter', 'smuggler', 'senator', 'chancellor',
  'death star', 'hoth', 'endor', 'tatooine',
  
  // Police/Emergency
  'police', 'policía', 'polizei', 'polizia',
  'firefighter', 'bombero', 'pompier', 'pompiere', 'feuerwehrmann',
  'paramedic', 'doctor', 'nurse',
  
  // City roles
  'driver', 'conductor', 'chauffeur', 'fahrer', 'autista',
  'worker', 'trabajador', 'travailleur', 'arbeiter', 'lavoratore',
  'chef', 'cook', 'baker', 'farmer', 'fisherman',
  'mechanic', 'scientist', 'astronaut',
  
  // Ninjago
  'ninja', 'sensei', 'master', 'villain',
  
  // Castle/Medieval
  'knight', 'king', 'queen', 'prince', 'princess',
  'wizard', 'witch', 'dragon', 'skeleton', 'ghost',
  
  // Pirates
  'pirate', 'captain', 'sailor', 'navy',
];

// ============================================
// ALL BRICKLINK MINIFIG CODE PREFIXES
// Complete list from BrickLink database
// ============================================
const MINIFIG_CODE_PREFIXES = [
  // Main themes (most common)
  'sw',    // Star Wars
  'sh',    // Super Heroes (Marvel/DC)
  'hp',    // Harry Potter
  'cty',   // City
  'col',   // Collectible Minifigures
  'njo',   // Ninjago
  'lor',   // Lord of the Rings / Hobbit
  'poc',   // Pirates of the Caribbean
  'pot',   // Pirates of the Caribbean (alternate)
  'cas',   // Castle
  'pi',    // Pirates
  'sp',    // Space
  
  // Other themes (alphabetical)
  'adv',   // Adventurers
  'alp',   // Alpha Team
  'aq',    // Aquazone / Aqua Raiders
  'agt',   // Agents
  'atl',   // Atlantis
  'ava',   // Avatar
  'bat',   // Batman (old)
  'bel',   // Belville
  'bob',   // SpongeBob
  'but',   // Studios
  'car',   // Cars (Pixar)
  'che',   // Legends of Chima
  'cre',   // Creator
  'din',   // Dino
  'dis',   // Disney
  'dp',    // Disney Princess
  'elf',   // Elves
  'exf',   // Exo-Force
  'frn',   // Friends
  'fst',   // Fabuland
  'gal',   // Galaxy Squad
  'gen',   // Generic / Basic
  'hid',   // Hidden Side
  'hol',   // Holiday
  'idea',  // Ideas
  'iaj',   // Indiana Jones
  'jmo',   // Jurassic World/Park (alternate)
  'jw',    // Jurassic World
  'kkl',   // Knights Kingdom
  'lbt',   // Legoland Parks
  'lea',   // LEGO Education
  'lem',   // LEGO Movie
  'loc',   // Legends of Chima (alternate)
  'mar',   // Mars Mission
  'mba',   // Mindstorms / Bionicle
  'mc',    // Minecraft
  'min',   // Minions
  'mk',    // Monkie Kid
  'mof',   // Monster Fighters
  'msk',   // Mask (promotional)
  'nex',   // Nexo Knights
  'ow',    // Overwatch
  'pck',   // Pick a Brick
  'pha',   // Pharaoh's Quest
  'pln',   // Town Plan
  'pm',    // Power Miners
  'rac',   // Racers
  'rb',    // Rock Raiders
  'res',   // Rescue
  'rck',   // Rock Band
  'rom',   // Romans
  'sc',    // Speed Champions
  'scr',   // Scooby-Doo
  'sd',    // Studios (alternate)
  'sim',   // Simpsons
  'soc',   // Soccer
  'spa',   // Space Police
  'spd',   // Spider-Man (old)
  'spp',   // Sports
  'sr',    // Super Racing
  'st',    // Stranger Things
  'stu',   // Studios
  'tfol',  // Teen Fandom
  'tls',   // Time Cruisers
  'tlm',   // The LEGO Movie
  'tnt',   // Teenage Mutant Ninja Turtles
  'toy',   // Toy Story
  'trn',   // Trains
  'tru',   // Toys R Us exclusive
  'twn',   // Town
  'uagt',  // Ultra Agents
  'vik',   // Vikings
  'wc',    // World Cup
  'wst',   // Western
  'ww',    // Wonder Woman / DC (alternate)
  'xyz',   // Miscellaneous
  
  // CMF Series codes
  'cmf',   // Collectible Minifig generic
  'dfb',   // German Football
  'dis',   // Disney CMF
  'hpg',   // Harry Potter Gold
  'mcd',   // McDonald's
  'mar',   // Marvel CMF
  'mtr',   // Monsters
  'sim',   // Simpsons CMF
  'tgb',   // Team GB
  'tlm',   // LEGO Movie CMF
  'tlbm',  // LEGO Batman Movie
  'n2k',   // Ninjago 2000s
];

// ============================================
// COMPETITOR BRANDS TO REJECT
// ============================================
const COMPETITOR_BRANDS = [
  // Brick competitors
  'cobi', 'mega bloks', 'megabloks', 'mega construx',
  'lepin', 'lele', 'bela', 'decool', 'sembo', 'sy block',
  'king', 'queen', 'kazi', 'gudi', 'enlighten', 'xingbao',
  'mould king', 'cada', 'playmobil', 'nanoblock', 'oxford',
  'bluebrixx', 'qman', 'wange', 'sluban', 'jie star',
  'panlos', 'panlosbrick', 'loz', 'woma', 'cogo', 'hsanhe',
  
  // Knockoff indicators
  'replica', 'réplica', 'replika', 'nachbau',
  'fake', 'fälschung', 'falso', 'faux',
  'imitation', 'imitación', 'imitazione',
  'knockoff', 'knock-off', 'knock off',
  'compatible', 'kompatibel', 'compatibile', 'compatible con',
  'alternativa', 'alternative zu',
  'clon ', 'klon ',  // Clone brand (with space to not catch "clone trooper")
  'no original', 'nicht original', 'non originale',
];

// ============================================
// NON-LEGO PRODUCTS (comprehensive)
// ============================================
const NON_LEGO_PRODUCTS = [
  // ============================================
  // BEARINGS (all languages)
  // ============================================
  'rodamiento', 'kugellager', 'bearing', 'roulement', 'cuscinetto',
  'lager ', 'kogellager', 'łożysko', 'rolamento',
  'fag ', 'skf ', 'nsk ', 'ntn ', 'ina ', 'timken', 'rótula',
  
  // ============================================
  // MILITARY MODELS (COBI territory)
  // ============================================
  'battleship', 'acorazado', 'panzer', 'warship', 'kriegsschiff',
  'pennsylvania', 'missouri', 'yamato', 'bismarck', 'tirpitz',
  'schlachtschiff', 'cuirassé', 'corazzata', 'slagschip',
  
  // ============================================
  // LED LIGHTING KITS (all brands and languages)
  // ============================================
  // Brand names
  'vonado', 'briksmax', 'lightailing', 'lightaling', 'light my bricks',
  'lightmybricks', 'brick loot', 'brickloot', 'game of bricks',
  'gameofbricks', 'joy mags', 'joymags', 'kyglaring', 'brickbling',
  'lmb ', 'cooldac', 'yeabricks', 'lightkit', 'brickstuff',
  
  // English
  'led lighting', 'led light kit', 'led kit', 'led set', 'lighting kit',
  'light kit', 'only led', 'led only', 'usb light', 'battery box light',
  
  // German
  'led beleuchtung', 'beleuchtungsset', 'licht set', 'lichtset',
  'nur led', 'led-set', 'led-kit', 'beleuchtung für',
  
  // French
  'éclairage led', 'eclairage led', 'kit éclairage', 'kit eclairage',
  "kit d'éclairage", "kit d'eclairage", 'uniquement led', 'lumière led',
  'lumiere led', 'eclairage pour', 'télécommandé', 'telecommande',
  
  // Spanish
  'iluminación led', 'iluminacion led', 'kit de luz', 'kit luz',
  'luces led', 'kit de luces', 'set de luces', 'luces para',
  'solo led', 'luz led para', 'iluminación para',
  
  // Italian
  'kit illuminazione', 'illuminazione led', 'kit luce', 'luci led',
  'solo luci', 'illuminazione per', 'luce per',
  
  // Dutch
  'led verlichting', 'verlichtingsset', 'licht set', 'verlichting voor',
  
  // Portuguese
  'iluminação led', 'kit de iluminação', 'luz led', 'luzes para',
  
  // ============================================
  // DISPLAY CASES / VITRINES / STANDS (all languages)
  // ============================================
  // English
  'display case', 'display box', 'display stand', 'stand display',
  'display holder', 'display mount', 'display base', 'display shelf',
  'showcase', 'show case', 'dust cover', 'dust proof', 'dustproof',
  'acrylic case', 'acrylic box', 'acrylic display', 'acrylic stand',
  'plexiglass', 'plexi glass', 'glass case', 'glass box',
  'wall mount', 'wall bracket', 'wall holder', 'wall display',
  'stand for', 'holder for', 'mount for', 'base for', 'bracket for',
  
  // German
  'vitrine', 'schaukasten', 'glasvitrine', 'acrylvitrine',
  'staubschutz', 'staubabdeckung', 'staubhülle', 'staubhaube',
  'ständer', 'stander', 'halter', 'halterung', 'wandhalterung',
  'displayständer', 'displaystander', 'ausstellungsständer',
  'sockel', 'podest', 'präsentationsständer', 'aufsteller',
  'ständer für', 'stander fur', 'halterung für', 'passend für',
  
  // French
  'vitrine', 'présentoir', 'presentoir', 'boîtier', 'boitier',
  'socle', 'support', "support d'exposition", 'support mural',
  'protection anti-poussière', 'anti-poussiere', 'coffret',
  'support pour', 'présentoir pour', 'socle pour', 'base pour',
  'étui', 'etui', 'cadre pour',
  
  // Spanish
  'vitrina', 'expositor', 'soporte', 'base de exposición',
  'base exposición', 'pedestal', 'estante', 'caja de exhibición',
  'protector de polvo', 'antipolvo', 'urna', 'escaparate',
  'soporte para', 'base para', 'expositor para', 'vitrina para',
  'caja para', 'peana', 'soporte de pared', 'soporte mural',
  
  // Italian
  'vetrina', 'teca', 'espositore', 'supporto', 'base espositiva',
  'piedistallo', 'scaffale', 'protezione polvere', 'antipolvere',
  'supporto per', 'base per', 'espositore per', 'teca per',
  'porta ', 'vetrinetta', 'supporto da parete',
  
  // Dutch
  'vitrine', 'displaykast', 'standaard', 'houder', 'stofkap',
  'sokkel', 'displaystandaard', 'wandhouder', 'plankje',
  'standaard voor', 'houder voor', 'kast voor',
  
  // Portuguese
  'vitrine', 'expositor', 'suporte', 'base de exposição',
  'caixa de exibição', 'pedestal', 'prateleira',
  'suporte para', 'base para', 'caixa para',
  
  // Polish
  'gablota', 'witryna', 'stojak', 'podstawka', 'osłona',
  'stojak na', 'podstawka pod', 'gablotka',
  
  // ============================================
  // FURNITURE / TABLES (all languages)
  // ============================================
  // English
  'coffee table', 'display table', 'play table', 'lego table',
  'building table', 'activity table', 'game table', 'furniture',
  'table for', 'desk for',
  
  // German
  'couchtisch', 'spieltisch', 'bautisch', 'tisch für',
  'tisch fur', 'möbel', 'mobel', 'schreibtisch',
  
  // French
  'table basse', 'table de jeu', 'table pour', 'meuble',
  'bureau pour',
  
  // Spanish
  'mesa de centro', 'mesa de juego', 'mesa para', 'mueble',
  'mesa auxiliar', 'escritorio para',
  
  // Italian
  'tavolino', 'tavolo da gioco', 'tavolo per', 'mobile',
  
  // Dutch
  'salontafel', 'speeltafel', 'tafel voor', 'meubel',
  
  // ============================================
  // UPGRADE / MOD KITS (all languages)
  // ============================================
  // English
  'upgrade kit', 'upgrade-kit', 'upgrade pack', 'enhancement kit',
  'mod kit', 'modification kit', 'custom kit', 'improvement kit',
  'aftermarket', 'third party', '3rd party', 'custom parts',
  'printed parts', 'printed pieces', 'sticker set', 'sticker kit',
  'decal set', 'decal kit', 'add-on kit', 'addon kit',
  
  // German
  'verbesserungskit', 'erweiterungskit', 'modifikationskit',
  'upgrade-set', 'aufwertungsset', 'custom teile', 'eigene teile',
  'gedruckte teile', 'aufkleberset', 'erweiterung für',
  
  // French
  'kit amélioration', 'kit amelioration', 'kit modification',
  "kit d'amélioration", 'pièces personnalisées', 'pièces imprimées',
  'autocollants pour', 'décalcomanies',
  
  // Spanish
  'kit de actualización', 'kit actualización', 'kit de mejora',
  'kit modificación', 'piezas personalizadas', 'piezas impresas',
  'pegatinas para', 'calcomanías',
  
  // Italian
  'kit di aggiornamento', 'kit miglioramento', 'kit modifica',
  'parti personalizzate', 'parti stampate', 'adesivi per',
  
  // ============================================
  // BOOKS / MEDIA (all languages)
  // ============================================
  // English
  'lego book', 'book lego', 'art book', 'art of', 'making of',
  'encyclopedia', 'catalogue', 'catalog', 'magazine', 'poster',
  'artbook', 'guide book', 'instruction book', 'idea book',
  
  // German
  'lego buch', 'buch lego', 'kunstbuch', 'sachbuch',
  'enzyklopädie', 'katalog', 'magazin', 'zeitschrift',
  
  // French
  'lego livre', 'livre lego', "livre d'art", 'encyclopédie',
  'catalogue', 'magazine', 'revue',
  
  // Spanish
  'lego libro', 'libro lego', 'libro de arte', 'enciclopedia',
  'catálogo', 'revista',
  
  // Italian
  'lego libro', 'libro lego', "libro d'arte", 'enciclopedia',
  'catalogo', 'rivista',
  
  // ============================================
  // KEYCHAINS / MAGNETS / SMALL PROMOS (all languages)
  // ============================================
  // English
  'keychain', 'key chain', 'keyring', 'key ring', 'key fob',
  'magnet', 'fridge magnet', 'refrigerator magnet', 'pen', 'pencil',
  'eraser', 'rubber', 'badge', 'pin', 'button',
  
  // German
  'schlüsselanhänger', 'schlusselanhanger', 'schlüsselring',
  'magnet', 'kühlschrankmagnet', 'kuhlschrankmagnet',
  'kugelschreiber', 'bleistift', 'radiergummi', 'anstecker',
  
  // French
  'porte-clés', 'porte-cles', 'porte clés', 'porte cles',
  'aimant', 'magnet', 'stylo', 'crayon', 'gomme', 'badge',
  
  // Spanish
  'llavero', 'imán', 'iman', 'imán de nevera', 'iman de nevera',
  'bolígrafo', 'boligrafo', 'lápiz', 'lapiz', 'goma', 'pin',
  
  // Italian
  'portachiavi', 'calamita', 'magnete', 'penna', 'matita',
  'gomma', 'spilla',
  
  // Dutch
  'sleutelhanger', 'magneet', 'koelkastmagneet', 'pen', 'potlood',
  'gum', 'speldje',
  
  // Portuguese
  'chaveiro', 'íman', 'ima', 'caneta', 'lápis', 'borracha',
  
  // Polish
  'brelok', 'breloczek', 'magnes', 'długopis', 'ołówek', 'gumka',
  
  // ============================================
  // SMALL ACCESSORIES / PROMOTIONAL ITEMS
  // ============================================
  'polybag', 'poly bag', 'foil pack', 'foilpack', 'foil bag',
  'promo ', 'promo-', 'promotional', 'gwp ', 'gift with purchase',
  'exclusive ', 'limited ', 'vip ',
  '& accessories', '+ accessories', 'with accessories',
  'und zubehör', 'und zubehor', 'con accesorios', 'avec accessoires',
  'e accessori', 'met accessoires',
  
  // Specific small items that are NOT sets
  'lego tec', 'lego® tec', 'lego wear', 'legowear',
  // Clothing keywords
  'traje', 'esqui', 'esquí', 'nieve', 'ropa', 'talla ', 'jacket', 'pants', 'suit',
  'snowsuit', 'ski suit', 'overall', 'clothing', 'apparel', 'kleidung', 'anzug',
  'hoverboard', 'skateboard', 'surfboard', 'snowboard',
  'speeder', 'jetpack', 'backpack', 'parachute',
];

// ============================================
// PART TYPE KEYWORDS (for detecting parts listings)
// ALL LANGUAGES - comprehensive coverage
// ============================================
const PART_KEYWORDS = [
  // Basic parts - English
  'brick', 'plate', 'tile', 'slope', 'wedge', 'panel', 'arch',
  'cylinder', 'cone', 'round', 'modified', 'inverted',
  
  // Technic parts
  'beam', 'axle', 'pin', 'connector', 'gear', 'bush', 'bushing',
  'liftarm', 'link', 'cross', 'hole',
  
  // Special parts
  'hinge', 'clip', 'bar', 'handle', 'antenna', 'flag', 'lever',
  'door', 'window', 'fence', 'wheel', 'tyre', 'tire',
  
  // Minifig parts (when sold separately)
  'torso', 'legs', 'head', 'hair', 'helmet', 'hat', 'cape',
  'arm', 'hand', 'weapon', 'accessory', 'tool',
  
  // German
  'stein', 'platte', 'fliese', 'dachstein', 'keil',
  'balken', 'achse', 'stift', 'zahnrad', 'buchse',
  'scharnier', 'klammer', 'stange', 'griff', 'antenne',
  'tür', 'tur', 'fenster', 'zaun', 'rad', 'reifen',
  'torso', 'beine', 'kopf', 'haare', 'helm', 'umhang',
  
  // French
  'brique', 'plaque', 'tuile', 'pente', 'coin',
  'poutre', 'axe', 'goupille', 'engrenage',
  'charnière', 'charniere', 'pince', 'barre', 'poignée', 'poignee',
  'porte', 'fenêtre', 'fenetre', 'barrière', 'barriere', 'roue', 'pneu',
  
  // SPANISH (was missing!)
  'placa',          // Plate
  'ladrillo',       // Brick
  'baldosa',        // Tile
  'pendiente',      // Slope
  'cuña', 'cuna',   // Wedge
  'panel',          // Panel
  'arco',           // Arch
  'cilindro',       // Cylinder
  'cono',           // Cone
  'bisagra',        // Hinge
  'rueda',          // Wheel
  'neumático', 'neumatico', // Tire
  'puerta',         // Door
  'ventana',        // Window
  'valla',          // Fence
  'piernas',        // Legs
  'cabeza',         // Head
  'pelo',           // Hair
  'casco',          // Helmet
  'capa',           // Cape
  'brazo',          // Arm
  'mano',           // Hand
  'arma',           // Weapon
  
  // Italian
  'mattoncino',     // Brick
  'piastra',        // Plate
  'piastrella',     // Tile
  'pendenza',       // Slope
  'cuneo',          // Wedge
  'pannello',       // Panel
  'cerniera',       // Hinge
  'ruota',          // Wheel
  'pneumatico',     // Tire
  'porta',          // Door
  'finestra',       // Window
  'gambe',          // Legs
  'testa',          // Head
  'capelli',        // Hair
  'elmetto',        // Helmet
  'mantello',       // Cape
  
  // Dutch
  'steen',          // Brick
  'plaat',          // Plate
  'tegel',          // Tile
  'helling',        // Slope
  'scharnier',      // Hinge
  'wiel',           // Wheel
  'band',           // Tire
  'deur',           // Door
  'raam',           // Window
  'benen',          // Legs
  'hoofd',          // Head
  'haar',           // Hair
  'helm',           // Helmet
  
  // Portuguese
  'tijolo',         // Brick
  'placa',          // Plate
  'azulejo',        // Tile
  'roda',           // Wheel
  'pneu',           // Tire
  'porta',          // Door
  'janela',         // Window
  'pernas',         // Legs
  'cabeça', 'cabeca', // Head
  'cabelo',         // Hair
  'capacete',       // Helmet
  'torse', 'jambes', 'tête', 'tete', 'cheveux', 'casque', 'cape',
  
  // Spanish
  'ladrillo', 'placa', 'baldosa', 'pendiente', 'cuña', 'cuna',
  'viga', 'eje', 'pasador', 'engranaje',
  'bisagra', 'pinza', 'barra', 'asa', 'antena',
  'puerta', 'ventana', 'valla', 'rueda', 'neumático', 'neumatico',
  'torso', 'piernas', 'cabeza', 'pelo', 'casco', 'capa',
  
  // Italian
  'mattoncino', 'piastra', 'piastrella', 'pendenza', 'cuneo',
  'trave', 'asse', 'perno', 'ingranaggio',
  'cerniera', 'clip', 'barra', 'maniglia',
  'porta', 'finestra', 'recinzione', 'ruota', 'pneumatico',
  'busto', 'gambe', 'testa', 'capelli', 'casco', 'mantello',
];

// ============================================
// NEGATIVE KEYWORDS
// ============================================
const NEGATIVE_KEYWORDS = [
  // Parts only (multilingual)
  'einzelteil', 'einzelteile', 'ersatzteil', 'ersatzteile', 'spare part', 'spare parts',
  'pièce détachée', 'piece detachee', 'pieza suelta', 'pezzo di ricambio',
  'nur körper', 'only body', 'nur kopf', 'only head', 'nur beine', 'only legs',
  'steine aus', 'bricks from', 'teile aus', 'parts from', 'pièces de', 'piezas de',
  'tür aus', 'door from', 'tor aus', 'gate from', 'teil aus', 'part from',
  
  // Minifigures (multilingual)
  'minifigur', 'minifigure', 'minifig ', 'mini fig ', 'mini-fig',
  'figurine', 'figura', 'figuur', 'figurka',
  'figur aus', 'figure from', 'figurine du', 'figura de', 'figura dal',
  // "FROM SET" patterns - all languages (indicates part/minifig from set)
  'aus set ', 'from set ', 'du set ', 'dal set ', 'del set ', 'de set ', 'van set ', 'uit set ', 'do set ',
  '1x lego', '2x lego', '3x lego', '4x lego', '5x lego', '6x lego',
  '7x lego', '8x lego', '9x lego', '10x lego', '1 x lego', '2 x lego',
  'konvolut figur', 'bundle figure', 'lot figur', 'lot de figurines',
  'nur figur', 'only figure', 'just figure', 'solo figura', 'seul figurine',
  'sammelfigur', 'figurine de collection',
  
  // Instructions only
  'instructions', 'building instructions', 'instructions', 'instrucciones', 'istruzioni', 'handleiding', 'anleitung', 'bauanleitung', 'nur anleitung', 'only instructions', 'instructions only', 'instructions seules',
  'solo instrucciones', 'solo istruzioni', 'alleen handleiding',
  'bauanleitung nur', 'manual only', 'ohne steine', 'without bricks', 'no bricks',
  'sans briques', 'sin ladrillos', 'senza mattoni',
  
  // Incomplete
  'ohne figuren', 'without figures', 'without minifigures', 'sans figurines',
  'ohne minifiguren', 'sin figuras', 'senza minifigure', 'zonder figuren',
  'ohne box', 'without box', 'no box', 'sans boite', 'ohne ovp',
  'sin caja', 'senza scatola', 'zonder doos',
  'unvollständig', 'incomplete', 'incompleto', 'incomplet', 'onvolledig',
  'nicht komplett', 'not complete', 'pas complet', 'no completo',
  'teile fehlen', 'parts missing', 'missing parts', 'pièces manquantes',
  'faltan piezas', 'pezzi mancanti', 'onderdelen ontbreken',
  'defekt', 'defect', 'broken', 'kaputt', 'beschädigt', 'damaged', 'endommagé',
  'dañado', 'danneggiato', 'kapot', 'beschadigd',
  
  // Box only
  'nur box', 'nur karton', 'nur verpackung', 'only box', 'box only',
  'empty box', 'leere box', 'boite vide', 'caja vacía', 'caja vacia',
  'scatola vuota', 'lege doos', 'seule boîte', 'seule boite',
  
  // Stickers
  'aufkleber nur', 'stickerbogen', 'sticker sheet', 'decal sheet',
  'only stickers', 'stickers only', 'solo pegatinas', 'solo adesivi',
  // Plain sticker (V15) - catches all sticker-related BrickOwl items
  'sticker ',  // "LEGO Sticker Sheet 1 for Set 75978"
  
  // "FOR SET" patterns (V15) - indicates part/accessory for a set, not the set itself
  // "Sticker Sheet 1 for Set 75978", "LEGO Saddle for Set 75181"
  'for set ',      // English
  'für set ',      // German
  'fuer set ',     // German (no umlaut)
  'pour set ',     // French
  'para set ',     // Spanish
  'per set ',      // Italian
  'voor set ',     // Dutch
  
  // Custom / MOC
  'moc ', ' moc', '-moc', 'moc-', 'custom build', 'eigenbau', 'selbstgebaut',
  'construction personnalisée', 'construcción personalizada',
  
  // Wanted / Looking for
  'suche', 'looking for', 'recherche', 'cerco', 'busco', 'gezocht',
  'wanted', 'wtb', 'want to buy', 'cherche', 'zoek',
  
  // Big figure parts (sold separately)
  'rancor figur', 'rancor figure', 'figura rancor', 'nur rancor', 'only rancor',
  'rancor monster', 'rancor tier', 'rancor sammelfigur', 'rancor only',
  'wampa only', 'dewback only', 'tauntaun only',
];

// ============================================
// STRONG POSITIVE KEYWORDS
// ============================================
const STRONG_POSITIVE_KEYWORDS = [
  // Complete set indicators (multilingual)
  'komplett set', 'complete set', 'set completo', 'set complet', 'kompleet set',
  'komplettset', 'vollständig', 'vollstandig', 'volledig',
  
  // Sealed indicators (multilingual)
  'neu ovp', 'new sealed', 'neuf scellé', 'neuf scelle', 'nuevo sellado',
  'nuovo sigillato', 'nieuw verzegeld', 'nowy zapieczętowany',
  'misb', 'nisb', 'bnisb', 'bnib',
  'originalverpackt', 'factory sealed', 'scellé usine', 'sellado de fábrica',
  'sigillato in fabbrica',
  
  // With all minifigs
  'mit allen figuren', 'with all figures', 'all minifigures included',
  'avec toutes les figurines', 'con todas las figuras', 'con tutte le minifigure',
  'met alle figuren', 'alle figuren dabei', 'toutes figurines incluses',
  
  // French specific (good indicators)
  'boite scellée', 'boite scellee', 'boîte scellée', 'boite neuve',
  'neuf sous blister', 'sous blister', 'jamais ouvert', 'never opened',
];

// ============================================
// SET NAME KEYWORDS FOR VALIDATION
// ============================================
const SET_NAME_KEYWORDS: Record<string, string[]> = {
  '75005': ['rancor', 'pit'],
  '9516': ['jabba', 'palace'],
  '10497': ['galaxy', 'explorer'],
  '21309': ['saturn', 'apollo', 'nasa', 'rocket'],
  '4842': ['hogwarts', 'castle', 'harry', 'potter'],
  '10273': ['haunted', 'house'],
  // User's watched sets
  '10248': ['ferrari', 'f40'],
  '10316': ['rivendell'],
  '10333': ['barad', 'dûr', 'dur'],
  '10354': ['shire', 'hobbit'],
  '11370': ['creel', 'house', 'stranger'],
  '21322': ['barracuda', 'bay', 'pirates'],
  '40750': ['wednesday', 'enid'],
  '40755': ['dropship', 'imperial'],
  '40761': ['sméagol', 'smeagol', 'déagol', 'deagol', 'gollum'],
  '42143': ['ferrari', 'daytona'],
  '42691': ['restaurant', 'garden'],
  '60499': ['airport', 'fire', 'truck'],
  '75059': ['sandcrawler'],
  '75181': ['y-wing', 'ywing', 'starfighter'],
  '75192': ['millennium', 'falcon'],
  '75197': ['first order', 'battle pack', 'specialists'],
  '75198': ['tatooine', 'battle pack'],
  '75220': ['sandcrawler'],
  '75244': ['tantive'],
  '75290': ['mos eisley', 'cantina'],
  '75313': ['at-at', 'atat'],
  '75331': ['razor', 'crest'],
  '75423': ['x-wing', 'xwing', 'red five'],
  '75582': ['gru', 'minions'],
  '75810': ['upside', 'down', 'stranger'],
  '76261': ['spider-man', 'spiderman', 'final battle'],
  '76269': ['avengers', 'tower'],
  '77254': ['ferrari', 'sf90'],
  '77256': ['time machine', 'back to the future', 'delorean'],
  '7754': ['home one', 'mon calamari', 'cruiser'],
  // Added in V15
  '21348': ['dungeons', 'dragons', "dragon's tale", 'red dragon'],
  '10190': ['market', 'street'],
};

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Check if set number is in title (not as part code)
 */
function titleContainsSetNumber(title: string, setNumber: string): boolean {
  const regex = new RegExp(`\\b${setNumber}\\b(?![a-z]|pb|c\\d)`, 'i');
  return regex.test(title);
}

/**
 * Check if title contains LEGO brand
 */
function titleContainsLegoBrand(title: string): boolean {
  return /\blego\b/i.test(title) || /\blégo\b/i.test(title);
}

/**
 * Check if listing is from a competitor brand
 */
function isCompetitorBrand(title: string): boolean {
  const titleLower = title.toLowerCase();
  
  // Special handling - allow "clone trooper", "clone wars"
  for (const brand of COMPETITOR_BRANDS) {
    if (brand === 'clon ' || brand === 'klon ') {
      // Skip generic clone check if it's clone trooper/wars
      if (titleLower.includes('clone trooper') || titleLower.includes('clone wars')) {
        continue;
      }
    }
    if (titleLower.includes(brand.toLowerCase())) {
      return true;
    }
  }
  return false;
}

/**
 * Check if listing is a non-LEGO product
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
  if (!keywords) return true;
  return keywords.some(kw => titleLower.includes(kw));
}

/**
 * Check for "New: Other" condition
 */
function isNewOtherCondition(condition: string | null | undefined): boolean {
  if (!condition) return false;
  const conditionLower = condition.toLowerCase();
  
  const newOtherPatterns = [
    'sonstige', 'other', 'autre', 'otro', 'altro', 'anders',
    'see details', 'siehe artikel', 'voir détails', 'ver detalles', 'vedi dettagli',
  ];
  
  const hasNewKeyword = /\b(new|neu|neuf|nuevo|nuovo|nieuw|nowy)\b/i.test(conditionLower);
  const hasOtherKeyword = newOtherPatterns.some(p => conditionLower.includes(p));
  
  return hasNewKeyword && hasOtherKeyword;
}

/**
 * Check for "incomplete" condition
 */
function isIncompleteCondition(condition: string | null | undefined): boolean {
  if (!condition) return false;
  const conditionLower = condition.toLowerCase();
  
  const incompletePatterns = [
    'incomplete', 'incompleto', 'incomplet', 'onvolledig',
    'unvollständig', 'unvollstandig', 'nicht komplett', 'not complete',
    'parts missing', 'missing parts', 'pièces manquantes',
    'without minifig', 'without figure', 'ohne figur', 'sans figurine', 'sin figura',
  ];
  
  return incompletePatterns.some(p => conditionLower.includes(p));
}

/**
 * Normalize condition and check if it matches user's filter
 */
export function conditionMatchesFilter(
  condition: string | null | undefined,
  userWantsCondition: 'new' | 'used' | 'any'
): boolean {
  if (userWantsCondition === 'any') return true;
  if (!condition) return true;
  
  const conditionLower = condition.toLowerCase();
  
  if (userWantsCondition === 'new') {
    if (isNewOtherCondition(condition)) return false;
    if (isIncompleteCondition(condition)) return false;
    
    const newKeywords = ['new', 'neu', 'neuf', 'nuevo', 'nuovo', 'nieuw', 'nowy', 'sealed', 'misb', 'nisb', 'bnib'];
    const isNew = newKeywords.some(kw => conditionLower.includes(kw));
    
    const usedKeywords = ['used', 'gebraucht', 'occasion', 'usado', 'usato', 'gebruikt', 'używany', 'pre-owned'];
    const isUsed = usedKeywords.some(kw => conditionLower.includes(kw));
    
    if (isUsed) return false;
    return isNew;
  }
  
  if (userWantsCondition === 'used') {
    const newKeywords = ['new', 'neu', 'neuf', 'nuevo', 'nuovo', 'nieuw', 'nowy', 'sealed', 'misb', 'nisb', 'bnib'];
    const isNew = newKeywords.some(kw => conditionLower.includes(kw));
    
    if (isNewOtherCondition(condition)) return true;
    if (isIncompleteCondition(condition)) return true;
    
    return !isNew;
  }
  
  return true;
}

/**
 * CRITICAL: Detect if this is a CHARACTER FIGURE listing
 */
function isCharacterFigureListing(title: string): boolean {
  const titleLower = title.toLowerCase();
  
  const hasFigurSingular = /\bfigur\b|\bfigure\b|\bfigura\b|\bfigurine\b|\bfiguur\b/i.test(titleLower);
  if (!hasFigurSingular) return false;
  
  // Allow "mit figuren" / "with figures" patterns
  if (/mit\s+figur|with\s+figure|inkl\.?\s*figur|incl\.?\s*figur|avec\s+figurine|con\s+figura|met\s+figur/i.test(titleLower)) {
    return false;
  }
  
  const figurPosition = titleLower.search(/\bfigur|\bfigure|\bfigura|\bfigurine|\bfiguur/);
  
  for (const character of CHARACTER_NAMES) {
    const charPosition = titleLower.indexOf(character);
    if (charPosition !== -1 && charPosition < figurPosition) {
      return true;
    }
  }
  
  return false;
}

/**
 * COMPREHENSIVE: Detect minifig listings by BrickLink code patterns
 * 
 * This matches ALL known BrickLink minifig code prefixes (50+)
 */
function containsMinifigCode(title: string): boolean {
  const titleLower = title.toLowerCase();
  
  // Build regex pattern from all prefixes
  // Pattern: prefix + 1-4 digits + optional letter suffix
  for (const prefix of MINIFIG_CODE_PREFIXES) {
    const pattern = new RegExp(`\\b${prefix}\\d{1,4}[a-z]?\\b`, 'i');
    if (pattern.test(titleLower)) {
      return true;
    }
  }
  
  // Also check for Rebrickable format: fig-XXXXXX
  if (/\bfig[-\s]?\d{5,6}\b/i.test(titleLower)) {
    return true;
  }
  
  return false;
}

/**
 * COMPREHENSIVE: Detect if title is likely for a minifigure
 */
function isLikelyMinifigure(title: string, price: number): boolean {
  const titleLower = title.toLowerCase();
  
  // Check for ANY minifig code pattern (50+ prefixes!)
  if (containsMinifigCode(title)) {
    return true;
  }
  
  // Multi-item patterns: "3x LEGO", "5 x Lego", "LEGO 3x", etc.
  if (/\b\d+\s*x\s*lego/i.test(titleLower)) return true;
  if (/lego\s*\d+\s*x\b/i.test(titleLower)) return true;
  if (/\b\d+\s*x\s*(minifig|figure|figur)/i.test(titleLower)) return true;
  
  // ============================================
  // "FROM SET" PATTERNS - HIGHEST PRIORITY
  // These ALWAYS indicate a part/minifig from a set, not the set itself
  // Must be checked before any other logic
  // ============================================
  // German
  if (/aus\s+set\s+\d{4,5}/i.test(titleLower)) return true;
  if (/aus\s+set\s*#?\s*\d{4,5}/i.test(titleLower)) return true;
  // English
  if (/from\s+set\s+\d{4,5}/i.test(titleLower)) return true;
  if (/from\s+set\s*#?\s*\d{4,5}/i.test(titleLower)) return true;
  // French
  if (/du\s+set\s+\d{4,5}/i.test(titleLower)) return true;
  if (/du\s+set\s*#?\s*\d{4,5}/i.test(titleLower)) return true;
  // Spanish
  if (/de\s+set\s+\d{4,5}/i.test(titleLower)) return true;
  if (/del\s+set\s+\d{4,5}/i.test(titleLower)) return true;
  // Italian
  if (/dal\s+set\s+\d{4,5}/i.test(titleLower)) return true;
  // Dutch
  if (/van\s+set\s+\d{4,5}/i.test(titleLower)) return true;
  if (/uit\s+set\s+\d{4,5}/i.test(titleLower)) return true;
  // Portuguese
  if (/do\s+set\s+\d{4,5}/i.test(titleLower)) return true;
  
  // ============================================
  // ROLE TITLES: "CREW MEMBER", "PILOT", etc.
  // If title is just [ROLE] - [set info], it's a minifig
  // ============================================
  for (const role of ROLE_TITLES) {
    if (titleLower.includes(role.toLowerCase())) {
      // Check if this looks like a minifig listing pattern
      // Pattern: "ROLE - Lego Set Number" or "ROLE Lego Set"
      const rolePattern = new RegExp(`${role.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}.*lego.*\\d{4,5}`, 'i');
      if (rolePattern.test(titleLower)) {
        return true;
      }
      // Pattern: "Lego [Theme] ROLE" with low price
      if (price < 80 && /lego\s+(star wars|marvel|city|ninjago|harry potter)/i.test(titleLower)) {
        return true;
      }
    }
  }
  
  // ============================================
  // "X 1" PATTERN - indicates quantity 1 (minifig or part)
  // Catches: "LEGO 40755 Star Wars Rebelle X 1"
  // ============================================
  if (/\bx\s*1\s*$/i.test(title)) return true;  // Ends with "x 1" or "x1"
  if (/\bx\s*1\b/i.test(title) && price < 50) return true;  // Has "x 1" at low price
  if (/\b1\s*x\s*$/i.test(title)) return true;  // Ends with "1 x" or "1x"
  
  // ============================================
  // CHARACTER NAMES WITHOUT SET CONTEXT
  // "DIN DJARIN 75331" without "Razor Crest" = minifig
  // "DIN DJARIN ### RAZOR CREST 75331" = minifig (character before set name)
  // Only reject when we KNOW the set's name keywords and character isn't part of it
  // OR when character appears BEFORE set name keywords
  // ============================================
  for (const character of CHARACTER_NAMES) {
    const charLower = character.toLowerCase();
    if (titleLower.includes(charLower)) {
      // Find the set number in the title
      const setNumberMatch = title.match(/\b(\d{4,5})\b/);
      if (setNumberMatch && price < 200) {
        const setNum = setNumberMatch[1];
        const setKeywords = SET_NAME_KEYWORDS[setNum];
        
        // If we KNOW the set's keywords
        if (setKeywords) {
          // Check if any set keyword is in title
          const foundSetKeyword = setKeywords.find(kw => titleLower.includes(kw.toLowerCase()));
          
          if (!foundSetKeyword) {
            // No set keywords found = minifig
            if (!containsStrongPositiveKeywords(title)) {
              return true;
            }
          } else {
            // Set keyword found - but check if character appears BEFORE it
            // "DIN DJARIN ### RAZOR CREST" - DIN DJARIN before RAZOR = minifig
            const charPosition = titleLower.indexOf(charLower);
            const keywordPosition = titleLower.indexOf(foundSetKeyword.toLowerCase());
            
            if (charPosition < keywordPosition && price < 150) {
              // Character name appears before set name = likely minifig listing
              return true;
            }
          }
        }
        // If we don't have keywords for this set, don't reject - be conservative
      }
    }
  }
  
  // ============================================
  // ROLE TITLE + SET NUMBER AT LOW PRICE = MINIFIG
  // BUT only if the role is NOT part of the set name
  // "Rebelle X 1" without set context = minifig
  // "Rebel U-Wing Starfighter" = valid set (rebel is in set name)
  // ============================================
  for (const role of ROLE_TITLES) {
    if (titleLower.includes(role.toLowerCase()) && price < 100) {
      // Find the set number in the title
      const setNumberMatch = title.match(/\b(\d{5})\b/);
      if (setNumberMatch) {
        const setNum = setNumberMatch[1];
        const setKeywords = SET_NAME_KEYWORDS[setNum];
        
        // If we have keywords for this set, check if role is part of set name
        if (setKeywords) {
          const roleIsPartOfSetName = setKeywords.some(kw => 
            kw.toLowerCase().includes(role.toLowerCase()) || 
            role.toLowerCase().includes(kw.toLowerCase())
          );
          
          // Only reject if role is NOT part of set name
          if (!roleIsPartOfSetName && !containsStrongPositiveKeywords(title)) {
            return true;
          }
        } else {
          // No keywords known for this set - be conservative, only reject with "x 1" pattern
          // Don't reject just because of role title when we don't know the set name
        }
      }
    }
  }
  
  // Low price + minifig indicators
  if (price < 50) {
    const minifigIndicators = [
      'minifigur', 'minifigure', 'minifig', 'mini fig', 'mini-fig',
      'figur lego', 'lego figur', 'figure lego', 'lego figure',
      'figurine lego', 'lego figurine', 'figura lego', 'lego figura',
    ];
    if (minifigIndicators.some(ind => titleLower.includes(ind))) {
      return true;
    }
  }
  
  // Very low price without strong positives = suspicious
  if (price < 50 && !containsStrongPositiveKeywords(title)) {
    if (/aus\s+set|from\s+set|du\s+set|dal\s+set|del\s+set|van\s+set/i.test(titleLower)) {
      return true;
    }
  }
  
  // ============================================
  // V15: "ONLY" KEYWORD PATTERNS
  // "Colin the Fighter only" = minifig, not set
  // "minifig only", "figure only", "X only"
  // Pattern: title ending with "only" or variants
  // ============================================
  // English - "only" at end of title
  if (/\bonly\s*$/i.test(title)) return true;
  // English - "only -" or "only –" (followed by dash = extra description)
  // "Colin the Fighter only - Dungeons & Dragons"
  if (/\bonly\s*[-–—]/i.test(title)) return true;
  // English - "X only" patterns (with hyphen variations)
  if (/\bonly\b/i.test(titleLower) && price < 100) {
    // "figure only", "minifig only", "character only"
    if (/figur\w*\s+only|only\s+figur/i.test(titleLower)) return true;
    if (/minifig\w*\s+only|only\s+minifig/i.test(titleLower)) return true;
    // Character/Name + "only" pattern (e.g., "Colin the Fighter only")
    // Look for pattern: [Name] only [separator or end]
    if (/\w+\s+only\s*[-–—]|only\s*$/i.test(title)) return true;
  }
  // German - "nur" at end or followed by dash
  if (/\bnur\s*$/i.test(title) || /\bnur\s*[-–—]/i.test(title)) return true;
  // Spanish/Italian - "solo" at end or with dash (but not "han solo"!)
  if ((/\bsolo\s*$/i.test(title) || /\bsolo\s*[-–—]/i.test(title)) && !/han\s+solo/i.test(titleLower)) return true;
  // French - "seul/seulement" at end or with dash
  if (/\bseul\s*$/i.test(title) || /\bseul\s*[-–—]/i.test(title)) return true;
  if (/\bseulement\s*$/i.test(title) || /\bseulement\s*[-–—]/i.test(title)) return true;
  // Dutch - "alleen" at end or with dash
  if (/\balleen\s*$/i.test(title) || /\balleen\s*[-–—]/i.test(title)) return true;
  // Italian - "soltanto" at end or with dash
  if (/\bsoltanto\s*$/i.test(title) || /\bsoltanto\s*[-–—]/i.test(title)) return true;

  // V15 FIX: Character name + very low price = minifig/creature sale
  for (const character of CHARACTER_NAMES) {
    if (titleLower.includes(character.toLowerCase()) && price < 80) {
      if (!containsStrongPositiveKeywords(title)) {
        return true;
      }
    }
  }
  
  return false;
}

/**
 * COMPREHENSIVE: Detect part listings
 */
function isPartListing(title: string, price: number): boolean {
  const titleLower = title.toLowerCase();
  
  // ============================================
  // V15: BRICKOWL PART NUMBER PATTERN
  // BrickOwl parts have format: "LEGO [Name] (XXXXX / XXXXX)" or "(XXXXX)"
  // Examples:
  //   "LEGO Caballo Saddle 2 x 2 con Stirrups (75181 / 93086)"
  //   "LEGO Sticker Sheet 1 for Set 75978 (69366 / 79287)"
  //   "LEGO Aleta (10190 / 29161)"
  // This is a DEAD GIVEAWAY that it's a BrickOwl part listing
  // ============================================
  // Pattern: (XXXXX / XXXXX) - two part numbers with slash
  if (/\(\d{4,6}\s*\/\s*\d{4,6}\)\s*$/.test(title)) return true;
  // Pattern: (XXXXX) at end - single part number in parens at end
  if (/\(\d{4,6}\)\s*$/.test(title)) return true;
  
  // ============================================
  // EXPLICIT "LEGO PART" PATTERN
  // Catches: "LEGO Part 60478", "LEGO ® Part 60478"
  // ============================================
  if (/lego\s*®?\s*part\s*\d{4,6}/i.test(title)) return true;
  if (/part\s*#?\s*\d{4,6}/i.test(titleLower)) return true;
  if (/pieza\s*#?\s*\d{4,6}/i.test(titleLower)) return true;  // Spanish
  if (/teil\s*#?\s*\d{4,6}/i.test(titleLower)) return true;   // German
  if (/pièce\s*#?\s*\d{4,6}/i.test(titleLower)) return true;  // French
  if (/pezzo\s*#?\s*\d{4,6}/i.test(titleLower)) return true;  // Italian
  
  // Part number patterns with print/variant codes
  if (/\b\d{4,6}pb\d/i.test(title)) return true;      // 60478pb01
  if (/\b\d{4,6}c\d{1,3}pb/i.test(title)) return true; // 970c55pb04
  if (/\b\d{4,6}c\d{1,3}\b/i.test(title) && price < 30) return true; // 970c55
  if (/\b\d{4,6}pr\d/i.test(title)) return true;      // Print pattern
  if (/\b\d{4,6}pat\d/i.test(title)) return true;     // Pattern
  
  // ============================================
  // DIMENSION PATTERNS: "1 x 2", "2x4", "4 x 12"
  // These indicate parts (plates, bricks, tiles)
  // ============================================
  // Pattern with "x": "1 x 2", "1x2", "2 x 4", etc.
  if (/\blego.*\d\s*x\s*\d+\b/i.test(titleLower) && price < 30) {
    return true;
  }
  // Pattern in parentheses: "(1 x 12)", "(2x4)"
  if (/\(\s*\d\s*x\s*\d+\s*\)/i.test(title) && price < 30) {
    return true;
  }
  
  // Very low price + part indicators
  if (price < 25) {
    for (const partWord of PART_KEYWORDS) {
      if (titleLower.includes(partWord.toLowerCase())) {
        return true;
      }
    }
  }
  
  // "LEGO [number] [color]" pattern at low price
  if (price < 20) {
    if (/lego\s+\d{4,6}\s+(red|blue|yellow|green|black|white|gray|grey|tan|brown|orange|dark|light|trans)/i.test(title)) {
      return true;
    }
  }
  
  // Part dimension patterns at very low prices: "1 x 2", "2x4"
  if (price < 15) {
    if (/\blego.*\d\s*x\s*\d+\b/i.test(titleLower)) {
      return true;
    }
  }
  
  return false;
}

/**
 * CRITICAL: Check if set number is primary (not SEO stuffing)
 * 
 * RULES:
 * 1. 3+ unique set numbers = SEO spam, always reject
 * 2. Our set number must appear first - if another set appears before ours, REJECT
 * 3. Complementary keywords are just additional signals for rejection
 */
function isSetNumberPrimary(title: string, setNumber: string): boolean {
  const titleLower = title.toLowerCase();
  
  // Find all 4-5 digit numbers (potential set numbers)
  const allNumbers = title.match(/\b\d{4,5}\b/g) || [];
  
  // Filter out years (1990-2030)
  const setNumbers = allNumbers.filter(num => {
    const n = parseInt(num);
    return !(n >= 1990 && n <= 2030);
  });
  
  const uniqueSetNumbers = [...new Set(setNumbers)];
  
  // RULE 1: 3+ unique set numbers = SEO spam (ALWAYS REJECT)
  if (uniqueSetNumbers.length >= 3) {
    return false;
  }
  
  // Only one set number - it's primary
  if (uniqueSetNumbers.length <= 1) {
    return true;
  }
  
  // RULE 2: Two set numbers - ours MUST be first, otherwise REJECT
  const ourPosition = title.indexOf(setNumber);
  
  for (const otherNum of uniqueSetNumbers) {
    if (otherNum === setNumber) continue;
    
    const otherPosition = title.indexOf(otherNum);
    
    // If another set number appears BEFORE ours, REJECT
    // This catches: "LEGO 75060 Slave I... 75059" when searching for 75059
    // This catches: "WGP Lego 40693 Fell Beast... 10333" when searching for 10333
    if (otherPosition !== -1 && otherPosition < ourPosition) {
      return false;  // REJECT - our set number is not primary
    }
  }
  
  // Our set number appears first - but check for complementary keywords
  // that indicate this is an accessory listing
  const complementaryKeywords = [
    // English
    'complementary', 'goes with', 'compatible with', 'for set', 'with set',
    'fits with', 'matches', 'addon for', 'add-on for', 'expansion for',
    'gwp', 'gift with purchase', 'promo for', 'promotional',
    // German
    'ergänzend', 'erganzend', 'passend zu', 'passend für', 'passend fur',
    'kompatibel mit', 'für set', 'fur set', 'zu set', 'erweiterung für',
    // French
    'complémentaire', 'complementaire', 'compatible avec', 'pour set',
    'va avec', 'extension pour',
    // Spanish
    'complementario', 'compatible con', 'para set', 'va con',
    'expansión para', 'expansion para',
    // Italian
    'complementare', 'compatibile con', 'per set', 'va con',
  ];
  
  for (const keyword of complementaryKeywords) {
    if (titleLower.includes(keyword)) {
      return false;  // Reject - it's an accessory/complementary listing
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
  
  // Hard fails
  if (!titleContainsSetNumber(title, setNumber)) return 0;
  if (!titleContainsLegoBrand(title)) return 5;
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
  else if (price >= 50) score += 0;
  else if (price >= 20) score -= 5;
  else if (price < 20) score -= 15;
  
  return Math.max(0, Math.min(100, score));
}

// ============================================
// MAIN FILTER FUNCTION
// ============================================

export interface FilterResult {
  passed: boolean;
  reason?: string;
  qualityScore: number;
}

export function filterListing(
  title: string,
  setNumber: string,
  setName: string | null,
  price: number,
  minQualityScore: number = 50,
  condition?: string | null,
  userWantsCondition: 'new' | 'used' | 'any' = 'any'
): FilterResult {
  // Step 0: Check for competitor brands and non-LEGO products
  if (isCompetitorBrand(title)) {
    return { passed: false, reason: 'Competitor brand (COBI, Mega Bloks, knockoff, etc.)', qualityScore: 5 };
  }
  
  if (isNonLegoProduct(title)) {
    return { passed: false, reason: 'Non-LEGO product (LED kit, stand, display, table, upgrade kit, book, keychain, etc.)', qualityScore: 5 };
  }
  
  // Step 1: Set number must be in title
  if (!titleContainsSetNumber(title, setNumber)) {
    return { passed: false, reason: 'Set number not found in title', qualityScore: 0 };
  }
  
  // Step 2: Must contain "LEGO" in title
  if (!titleContainsLegoBrand(title)) {
    return { passed: false, reason: 'Title does not contain LEGO brand', qualityScore: 5 };
  }
  
  // Step 3: Check condition matches user filter
  if (!conditionMatchesFilter(condition, userWantsCondition)) {
    return { passed: false, reason: `Condition "${condition}" does not match filter "${userWantsCondition}"`, qualityScore: 30 };
  }
  
  // Step 4: Reject character figure listings
  if (isCharacterFigureListing(title)) {
    return { passed: false, reason: 'Character figure listing (e.g., "Luke Skywalker Figur")', qualityScore: 10 };
  }
  
  // Step 5: Reject likely minifigures (ALL 50+ code patterns!)
  if (isLikelyMinifigure(title, price)) {
    return { passed: false, reason: 'Likely minifigure listing (code pattern or indicators detected)', qualityScore: 15 };
  }
  
  // Step 6: Reject parts
  if (isPartListing(title, price)) {
    return { passed: false, reason: 'Likely part listing (part number or indicators detected)', qualityScore: 15 };
  }
  
  // Step 7: Reject negative keywords
  if (containsNegativeKeywords(title)) {
    return { passed: false, reason: 'Contains negative keywords (incomplete, parts only, etc.)', qualityScore: 20 };
  }
  
  // Step 8: Check if set number is primary (3+ = spam, position matters)
  if (!isSetNumberPrimary(title, setNumber)) {
    return { passed: false, reason: 'Set number not primary (SEO stuffing, multi-set listing, or accessory)', qualityScore: 25 };
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
    'instructions', 'building instructions', 'instructions', 'instrucciones', 'istruzioni', 'handleiding', 'anleitung', 'bauanleitung', 'nur anleitung', 'instructions only', 'ohne figuren', 
    'without figures', 'unvollständig', 'incomplete',
    'minifigur', 'minifigure', 'led kit', 'lighting kit',
  ];
}
