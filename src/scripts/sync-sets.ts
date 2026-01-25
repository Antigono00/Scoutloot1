import pg from 'pg';

const REBRICKABLE_API_KEY = '05480b178b7ab764c21069f710e1380f';
const DATABASE_URL = 'postgresql://lego_radar:BrickAlpha2026!Prod@localhost:5432/lego_radar';

const { Pool } = pg;
const pool = new Pool({ connectionString: DATABASE_URL });

interface RebrickableSet {
  set_num: string;
  name: string;
  year: number;
  theme_id: number;
  num_parts: number;
  set_img_url: string | null;
  set_url: string;
}

async function fetchSetFromRebrickable(setNumber: string): Promise<RebrickableSet | null> {
  // Rebrickable uses format "75192-1" for set numbers
  const rebrickableSetNum = setNumber.includes('-') ? setNumber : `${setNumber}-1`;
  
  const url = `https://rebrickable.com/api/v3/lego/sets/${rebrickableSetNum}/`;
  
  try {
    const response = await fetch(url, {
      headers: {
        'Authorization': `key ${REBRICKABLE_API_KEY}`,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        console.log(`  Set ${setNumber} not found on Rebrickable`);
        return null;
      }
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json() as RebrickableSet;
    return data;
  } catch (error) {
    console.error(`  Error fetching ${setNumber}:`, error);
    return null;
  }
}

async function updateSetInDatabase(setNumber: string, data: RebrickableSet): Promise<void> {
  await pool.query(
    `UPDATE sets SET 
       name = $1,
       year = $2,
       pieces = $3,
       image_url = $4,
       rebrickable_url = $5,
       updated_at = NOW()
     WHERE set_number = $6`,
    [
      data.name,
      data.year,
      data.num_parts,
      data.set_img_url,
      data.set_url,
      setNumber,
    ]
  );
}

async function syncAllSets(): Promise<void> {
  console.log('🧱 Syncing sets from Rebrickable...\n');

  // Get all sets that need updating (no name yet)
  const result = await pool.query(
    `SELECT set_number FROM sets WHERE name IS NULL OR name = '' ORDER BY set_number`
  );

  const sets = result.rows;
  console.log(`Found ${sets.length} sets to sync\n`);

  let updated = 0;
  let failed = 0;

  for (const row of sets) {
    const setNumber = row.set_number;
    console.log(`Fetching ${setNumber}...`);

    const data = await fetchSetFromRebrickable(setNumber);
    
    if (data) {
      await updateSetInDatabase(setNumber, data);
      console.log(`  ✅ ${data.name} (${data.year})`);
      updated++;
    } else {
      failed++;
    }

    // Rate limit: Rebrickable allows 1 request per second
    await new Promise(resolve => setTimeout(resolve, 1100));
  }

  console.log(`\n✅ Done! Updated: ${updated}, Failed: ${failed}`);
}

async function main(): Promise<void> {
  try {
    await syncAllSets();
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

main();
