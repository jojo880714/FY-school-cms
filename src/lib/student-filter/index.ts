/**
 * Student Filter — 學生條件過濾 pure functions
 *
 * 從 CreatePage.tsx 抽出 Phase 17a-f 的所有過濾邏輯,
 * 讓任何 page / wizard / sub-component 都能 reuse。
 *
 * ## 使用範例
 *
 * ```ts
 * import {
 *   PURPOSE_TAGS,
 *   examToCefr,
 *   getPersonaMatchScore,
 *   isAgeBlocked,
 *   isOverBudget,
 *   isLevelTooLow,
 *   isWeeksMismatch,
 * } from '@/lib/student-filter';
 *
 * const studentCefr = examToCefr('toeic', 700);  // 'B2'
 * const personaScore = getPersonaMatchScore(['exam_prep'], school.persona_match);  // 1
 * const blocked = isAgeBlocked(17, 18);  // true
 * ```
 *
 * ## 紅線
 *
 * - 所有 function 都是 pure(無 side effect,不依賴 React state)
 * - 算分 / boolean 規則跟 CreatePage 現有邏輯 1:1 對齊
 * - persona-match 嚴格守 PASSTHROUGH_PURPOSES 濾除規則
 */

export {
  PURPOSE_TAGS,
  PASSTHROUGH_PURPOSES,
  CEFR_SCORE,
  TOEIC_TO_CEFR_THRESHOLDS,
  IELTS_TO_CEFR_THRESHOLDS,
  TOEFL_TO_CEFR_THRESHOLDS,
} from './constants';
export type { ExamType } from './constants';

export {
  toeicToCefr,
  ieltsToCefr,
  toeflToCefr,
  examToCefr,
  isLevelTooHigh,
} from './cefr';

export {
  getPersonaMatchScore,
  isPersonaMatched,
} from './persona-match';

export {
  isAgeBlocked,
  isAgeFit,
} from './age-fit';

export {
  getSchoolMinWeeks,
  isWeeksMismatch,
} from './weeks-fit';
export type { ProgramMinWeeks } from './weeks-fit';

export {
  getCampusMinPrice,
  isOverBudget,
} from './budget-fit';
export type { TuitionTierForBudget } from './budget-fit';

export {
  getSchoolMinEntryCefr,
  isLevelTooLow,
} from './english-level-fit';
export type { ProgramForLevel } from './english-level-fit';
