/**
 * API — schools / campuses 表的查詢
 *
 * 這層只負責資料抓取,**不做任何過濾邏輯**(過濾請用 src/lib/student-filter/)。
 */

import { supabase } from '../supabase';

export interface SchoolRow {
  id: string;
  name: string;
  full_name: string;
  country: string | null;
  founded: number | null;
  website: string | null;
  nationality_count: number | null;
  english_only_policy: boolean;
  accreditation: string[] | null;
  min_age: number | null;             // Phase 17a
  persona_match: string[] | null;     // Phase 17b
  // Phase 20 預留(vendor 引入後才有)
  vendor_id?: string | null;
}

export interface CampusRow {
  id: string;
  school_id: string;
  city: string;
  metro_station: string | null;
  walk_minutes: number | null;
  highlight: string | null;
}

export interface SchoolWithCampuses extends SchoolRow {
  campuses: CampusRow[];
}

// ─── List ──────────────────────────────────────────────────────────────────────

export async function listSchools(): Promise<SchoolRow[]> {
  const { data, error } = await supabase.from('schools').select('*');
  if (error) throw new Error(`listSchools 失敗: ${error.message}`);
  return (data ?? []) as SchoolRow[];
}

export async function listCampuses(): Promise<CampusRow[]> {
  const { data, error } = await supabase
    .from('campuses')
    .select('id, school_id, city, metro_station, walk_minutes, highlight');
  if (error) throw new Error(`listCampuses 失敗: ${error.message}`);
  return (data ?? []) as CampusRow[];
}

/**
 * 一次抓 schools + campuses,組合成 SchoolWithCampuses[]。
 * 給 wizard / Dashboard 用。
 */
export async function listSchoolsWithCampuses(): Promise<SchoolWithCampuses[]> {
  const [schools, campuses] = await Promise.all([listSchools(), listCampuses()]);
  return schools.map((s) => ({
    ...s,
    campuses: campuses.filter((c) => c.school_id === s.id),
  }));
}
