/**
 * English level fit — 學生 CEFR vs 校區所有 program 的最低入學門檻
 *
 * 從 CreatePage.tsx line 582-595 抽出,改為 pure function。
 *
 * Phase 17d 規則(軟提示):
 * - 學生未測 / 未填 → 不過濾
 * - 校區的 programs 都沒 entry_level → 不限制
 * - 該校所有 programs 的最低 entry_level 都 > 學生 CEFR → 軟提示「程度未達」(non-blocking)
 */

import { CEFR_SCORE } from './constants';

export interface ProgramForLevel {
  school_id: string;
  entry_level: string | null;
}

/** 從 entry_level 字串抓 CEFR token,例 "Upper-Intermediate (B2)" → "B2" */
function extractCefr(entryLevel: string | null): string | null {
  if (!entryLevel) return null;
  const match = entryLevel.match(/\b(A1|A2|B1|B2|C1|C2)\b/);
  return match ? match[1] : null;
}

/**
 * 取得該校所有 programs 中**最低**的入學門檻 CEFR
 *
 * @returns 最低 CEFR e.g. 'B1';若沒有任何 program 含 CEFR token → null
 */
export function getSchoolMinEntryCefr(
  schoolId: string,
  programs: readonly ProgramForLevel[]
): string | null {
  const cefrs = programs
    .filter((p) => p.school_id === schoolId)
    .map((p) => extractCefr(p.entry_level))
    .filter((c): c is string => c !== null);

  if (cefrs.length === 0) return null;

  // 找出 CEFR_SCORE 最小的那個
  return cefrs.reduce((min, cur) => (CEFR_SCORE[cur] < CEFR_SCORE[min] ? cur : min));
}

/**
 * 是否程度太低(true = 學生 CEFR < 該校最低入學門檻,軟提示)
 */
export function isLevelTooLow(
  studentCefr: string | null,
  schoolId: string,
  programs: readonly ProgramForLevel[]
): boolean {
  if (!studentCefr) return false;
  const minSchoolCefr = getSchoolMinEntryCefr(schoolId, programs);
  if (!minSchoolCefr) return false;
  return CEFR_SCORE[studentCefr] < CEFR_SCORE[minSchoolCefr];
}
