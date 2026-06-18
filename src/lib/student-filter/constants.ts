/**
 * 學生條件過濾 — 共用常數
 *
 * 從 CreatePage.tsx 抽出,讓 wizard / dashboard / 任何其他頁面都能 reuse。
 */

/** CreatePage 給學生選的 11 個出發目的 tag */
export const PURPOSE_TAGS = [
  { id: 'lang_school',     label: '語言進修(語校)' },
  { id: 'exam_prep',       label: '考試衝刺(多益/雅思/托福)' },
  { id: 'working_holiday', label: '打工度假' },
  { id: 'pathway_uni',     label: '銜接升大學' },
  { id: 'pathway_grad',    label: '銜接升研究所' },
  { id: 'career_change',   label: '職涯轉換/充電' },
  { id: 'gap_year',        label: '學測後 Gap year' },
  { id: 'short_tour',      label: '遊學團(套裝行程)' },
  { id: 'custom_tour',     label: '客製化遊學' },
  { id: 'pr_immigration',  label: '移民/PR 規劃' },
  { id: 'undecided',       label: '尚未確定方向' },
] as const;

/**
 * Persona vocabulary 對齊:這 4 個 purpose 不參與 persona 計分。
 *
 * - `lang_school` / `undecided`:永久非 persona(零區辨力 / 學生狀態)
 * - `short_tour` / `custom_tour`:暫時 passthrough,之後升 `schools.has_short_tour` / `has_custom_tour` BOOL
 *
 * 計分邏輯:從 selectedPurposes 濾掉這 4 個,剩下的對 `schools.persona_match[]` 計分。
 */
export const PASSTHROUGH_PURPOSES: readonly string[] = [
  'lang_school',
  'short_tour',
  'custom_tour',
  'undecided',
];

/** CEFR 等級數字化:A1=1 ~ C2=6,方便比較 */
export const CEFR_SCORE: Record<string, number> = {
  A1: 1,
  A2: 2,
  B1: 3,
  B2: 4,
  C1: 5,
  C2: 6,
};

/** TOEIC / IELTS / TOEFL → CEFR 對映用的閾值(對齊 CreatePage line 47-72)*/
export const TOEIC_TO_CEFR_THRESHOLDS: ReadonlyArray<{ min: number; cefr: string }> = [
  { min: 945, cefr: 'C2' },
  { min: 785, cefr: 'C1' },
  { min: 550, cefr: 'B2' },
  { min: 225, cefr: 'B1' },
  { min: 120, cefr: 'A2' },
  { min: 0,   cefr: 'A1' },
];

export const IELTS_TO_CEFR_THRESHOLDS: ReadonlyArray<{ min: number; cefr: string }> = [
  { min: 8.5, cefr: 'C2' },
  { min: 7.0, cefr: 'C1' },
  { min: 5.5, cefr: 'B2' },
  { min: 4.0, cefr: 'B1' },
  { min: 3.0, cefr: 'A2' },
  { min: 0,   cefr: 'A1' },
];

export const TOEFL_TO_CEFR_THRESHOLDS: ReadonlyArray<{ min: number; cefr: string }> = [
  { min: 110, cefr: 'C2' },
  { min: 95,  cefr: 'C1' },
  { min: 72,  cefr: 'B2' },
  { min: 42,  cefr: 'B1' },
  { min: 30,  cefr: 'A2' },
  { min: 0,   cefr: 'A1' },
];

export type ExamType = 'toeic' | 'ielts' | 'toefl' | 'none_basic' | 'none_beginner';
