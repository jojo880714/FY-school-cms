/**
 * API — programs / tuition_tiers / housing / city_info(學生過濾用的 metadata)
 *
 * Wizard step 2-3 過濾學校時需要這些表的資料。
 *
 * 注意:目前一次抓全部(因為 CreatePage 也這樣做)。校數變多時可加分頁 / 按需載入。
 */

import { supabase } from '../supabase';

export interface ProgramMetadataRow {
  id: string;
  school_id: string;
  name: string;
  entry_level: string | null;
  min_weeks: number | null;
  // Phase 20 預留(報價系統 SCHOOL_DATA 灌進來後才有)
  hours_per_week?: number | null;
  category?: string | null;
}

export interface TuitionTierMetadataRow {
  id: string;
  program_id: string;
  campus_id: string;
  weeks_min: number;
  weeks_max: number | null;
  price_per_week: number;
  currency: string;
  // Phase 20 預留
  fixed?: number;
  peak?: number;
  unit?: string;
  category?: string;
}

export interface HousingMetadataRow {
  id: string;
  school_id: string;
  city: string;
  type: string;
  subtype: string | null;
  price_per_week: number;
  currency: string;
  includes: string | null;
  commute_to_school: string | null;
}

export interface CityInfoMetadataRow {
  id: string;
  city: string;
  country: string | null;
  climate: string | null;
  population: string | null;
  cost_of_living_monthly: number | null;
  cost_of_living_currency: string | null;
  highlights: string[] | null;
  visa_options: string[] | null;
}

// ─── Load ─────────────────────────────────────────────────────────────────────

export async function listPrograms(): Promise<ProgramMetadataRow[]> {
  const { data, error } = await supabase
    .from('programs')
    .select('id, school_id, name, entry_level, min_weeks, hours_per_week');
  if (error) throw new Error(`listPrograms 失敗: ${error.message}`);
  return (data ?? []) as ProgramMetadataRow[];
}

export async function listTuitionTiers(): Promise<TuitionTierMetadataRow[]> {
  const { data, error } = await supabase.from('tuition_tiers').select('*');
  if (error) throw new Error(`listTuitionTiers 失敗: ${error.message}`);
  return (data ?? []) as TuitionTierMetadataRow[];
}

export async function listHousing(): Promise<HousingMetadataRow[]> {
  const { data, error } = await supabase.from('housing').select('*');
  if (error) throw new Error(`listHousing 失敗: ${error.message}`);
  return (data ?? []) as HousingMetadataRow[];
}

export async function listCityInfo(): Promise<CityInfoMetadataRow[]> {
  const { data, error } = await supabase.from('city_info').select('*');
  if (error) throw new Error(`listCityInfo 失敗: ${error.message}`);
  return (data ?? []) as CityInfoMetadataRow[];
}

// ─── Combined load(給 wizard 一次抓全部過濾 metadata)────────────────────────

export interface StudentFilterMetadata {
  programs: ProgramMetadataRow[];
  tuitionTiers: TuitionTierMetadataRow[];
  housing: HousingMetadataRow[];
  cityInfo: CityInfoMetadataRow[];
}

export async function loadStudentFilterMetadata(): Promise<StudentFilterMetadata> {
  const [programs, tuitionTiers, housing, cityInfo] = await Promise.all([
    listPrograms(),
    listTuitionTiers(),
    listHousing(),
    listCityInfo(),
  ]);
  return { programs, tuitionTiers, housing, cityInfo };
}
