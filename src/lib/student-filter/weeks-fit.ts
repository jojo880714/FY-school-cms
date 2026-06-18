/**
 * Weeks fit — 學生預計週數 vs 學校 program 最短週數(min_weeks)
 *
 * 從 CreatePage.tsx line 622-634 抽出,改為 pure function。
 *
 * Phase 17f 規則:
 * - 學生未填預計週數 → 不過濾(視為符合)
 * - school 的 programs 都沒 min_weeks → 不限制
 * - 該校所有 programs 的 min_weeks 都 > 學生預計週數 → 軟提示「太短不能報名」(non-blocking)
 *   (寬鬆判斷:只要該校有一個 program min_weeks <= maxWeeks 就視為符合)
 */

export interface ProgramMinWeeks {
  school_id: string;
  min_weeks: number | null;
}

/**
 * 取得該校所有 programs 的最小 min_weeks(也就是該校能接受的最短就讀週數)
 *
 * @returns 最小週數;若沒有任何 program 設 min_weeks → null
 */
export function getSchoolMinWeeks(schoolId: string, programs: readonly ProgramMinWeeks[]): number | null {
  const mins = programs
    .filter((p) => p.school_id === schoolId && p.min_weeks !== null)
    .map((p) => p.min_weeks as number);
  if (mins.length === 0) return null;
  return Math.min(...mins);
}

/**
 * 是否週數不符(true = 學生預計週數 < 學校最短)
 *
 * 軟提示用,不擋選取。
 */
export function isWeeksMismatch(
  studentMaxWeeks: number | null,
  schoolId: string,
  programs: readonly ProgramMinWeeks[]
): boolean {
  if (studentMaxWeeks === null) return false;
  const min = getSchoolMinWeeks(schoolId, programs);
  if (min === null) return false;
  return studentMaxWeeks < min;
}
