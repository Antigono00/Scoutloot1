import { query } from '../db/index.js';

export interface Set {
  set_number: string;
  set_number_base: string | null;
  name: string | null;
  theme: string | null;
  year: number | null;
  pieces: number | null;
  msrp_eur: number | null;
  image_url: string | null;
  bricklink_url: string | null;
  rebrickable_url: string | null;
  created_at: Date;
  updated_at: Date;
}

export async function ensureSetExists(setNumber: string): Promise<void> {
  await query(
    `INSERT INTO sets (set_number) 
     VALUES ($1) 
     ON CONFLICT (set_number) DO NOTHING`,
    [setNumber]
  );
}

export async function getSet(setNumber: string): Promise<Set | null> {
  const result = await query<Set>(
    `SELECT * FROM sets WHERE set_number = $1`,
    [setNumber]
  );
  return result.rows[0] ?? null;
}
