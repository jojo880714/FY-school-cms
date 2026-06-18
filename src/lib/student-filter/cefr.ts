/**
 * CEFR(歐洲共同語言參考標準)轉換 — pure functions
 *
 * 從 CreatePage.tsx line 47-72 抽出,讓 wizard / 任何頁面都能 reuse。
 */

import {
  CEFR_SCORE,
  TOEIC_TO_CEFR_THRESHOLDS,
  IELTS_TO_CEFR_THRESHOLDS,
  TOEFL_TO_CEFR_THRESHOLDS,
  type ExamType,
} from './constants';

/** TOEIC 分數 → CEFR(如 700 → 'B2')*/
export function toeicToCefr(score: number): string {
  for (const { min, cefr } of TOEIC_TO_CEFR_THRESHOLDS) {
    if (score >= min) return cefr;
  }
  return 'A1';
}

/** IELTS 分數 → CEFR */
export function ieltsToCefr(score: number): string {
  for (const { min, cefr } of IELTS_TO_CEFR_THRESHOLDS) {
    if (score >= min) return cefr;
  }
  return 'A1';
}

/** TOEFL iBT 分數 → CEFR */
export function toeflToCefr(score: number): string {
  for (const { min, cefr } of TOEFL_TO_CEFR_THRESHOLDS) {
    if (score >= min) return cefr;
  }
  return 'A1';
}

/**
 * 通用 exam → CEFR 入口(對齊 CreatePage line 73-80 getStudentCefr)
 *
 * - 'toeic' / 'ielts' / 'toefl' 用對應公式
 * - 'none_basic'(自評略懂)→ 'A2'
 * - 'none_beginner'(自評零基礎)→ 'A1'
 * - 其他 / score 缺 → null
 */
export function examToCefr(examType: ExamType | string | null, score: number | null): string | null {
  if (examType === 'none_basic') return 'A2';
  if (examType === 'none_beginner') return 'A1';
  if (score == null) return null;
  if (examType === 'toeic') return toeicToCefr(score);
  if (examType === 'ielts') return ieltsToCefr(score);
  if (examType === 'toefl') return toeflToCefr(score);
  return null;
}

/**
 * CEFR 比較 — 學生 cefr 是否達到 program 入學門檻
 *
 * @param studentCefr 'A1' .. 'C2' 或 null(未測)
 * @param entryLevel program 寫的入學門檻字串,e.g. "B2"、"Upper-Intermediate (B2)"
 * @returns true 表示「學生程度 < 門檻」(level too high blocking),false 表示符合或無法判斷
 */
export function isLevelTooHigh(studentCefr: string | null, entryLevel: string | null): boolean {
  if (!studentCefr || !entryLevel) return false;
  const studentScore = CEFR_SCORE[studentCefr];
  if (!studentScore) return false;

  // 從 entryLevel 字串抓 CEFR(可能含字尾 e.g. "Upper-Intermediate (B2)")
  const match = entryLevel.match(/\b(A1|A2|B1|B2|C1|C2)\b/);
  if (!match) return false;
  const programScore = CEFR_SCORE[match[1]];
  return studentScore < programScore;
}
