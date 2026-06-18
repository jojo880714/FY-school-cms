/**
 * Persona match — 學生 purpose tags vs 學校 persona_match[] 計分
 *
 * 從 CreatePage.tsx line 631-650 抽出,改為 pure function(不依賴 React state)。
 *
 * 紅線:
 * - `PASSTHROUGH_PURPOSES` 4 個 tag 不參與計分(濾掉再算)
 * - exam_prep + lang_school 混選時,exam_prep 仍正常算(lang_school 被濾掉而已)
 * - 全 passthrough → score 0,排序中性,UI badge 不亮
 */

import { PASSTHROUGH_PURPOSES } from './constants';

/**
 * 計分 — 學生選的 purposes 跟學校 persona_match[] 交集數
 *
 * @param selectedPurposes 學生在 wizard 選的 purpose ids(可能含 passthrough)
 * @param schoolPersonaMatch 學校 persona_match TEXT[](master list 7 個有效 tag 之一)
 * @returns 交集數(0..N),0 = 沒命中,N = 命中 N 個
 */
export function getPersonaMatchScore(
  selectedPurposes: readonly string[] | null | undefined,
  schoolPersonaMatch: readonly string[] | null | undefined
): number {
  if (!selectedPurposes || selectedPurposes.length === 0) return 0;

  // 先濾掉 passthrough
  const scoringPurposes = selectedPurposes.filter((p) => !PASSTHROUGH_PURPOSES.includes(p));
  if (scoringPurposes.length === 0) return 0;

  if (!schoolPersonaMatch || schoolPersonaMatch.length === 0) return 0;

  return scoringPurposes.filter((p) => schoolPersonaMatch.includes(p)).length;
}

/** Boolean 版 — score > 0 即為「persona 命中」 */
export function isPersonaMatched(
  selectedPurposes: readonly string[] | null | undefined,
  schoolPersonaMatch: readonly string[] | null | undefined
): boolean {
  return getPersonaMatchScore(selectedPurposes, schoolPersonaMatch) > 0;
}
