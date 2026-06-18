/**
 * Budget fit — 學生週預算 vs 該校最低週費
 *
 * 從 CreatePage.tsx 抽出,改為 pure function。
 *
 * Phase 17c 規則(軟提示):
 * - 學生未填預算 → 不過濾
 * - 校區無 tuition_tiers → 不限制
 * - 該校區所有 tier 的 price_per_week 都 > 學生預算 → 軟提示「超出預算」(non-blocking)
 *
 * 注意:跨幣別判斷 — 學生預算幣別跟 tier currency 不同時,**目前不換算**
 * (軟提示用,後端整合 phase 再加 FX 換算)。
 */

export interface TuitionTierForBudget {
  campus_id: string;
  price_per_week: number;
  currency: string;
}

/**
 * 取得該校區的最低週費(用學生指定幣別過濾)
 *
 * @returns 最低週費;若該校區 / 該幣別沒有 tier → null
 */
export function getCampusMinPrice(
  campusId: string,
  currency: string,
  tiers: readonly TuitionTierForBudget[]
): number | null {
  const matching = tiers
    .filter((t) => t.campus_id === campusId && t.currency === currency)
    .map((t) => t.price_per_week);
  if (matching.length === 0) return null;
  return Math.min(...matching);
}

/**
 * 是否超出預算(true = 學生週預算 < 該校區最低週費,軟提示)
 */
export function isOverBudget(
  studentWeeklyBudget: number | null,
  campusId: string,
  currency: string,
  tiers: readonly TuitionTierForBudget[]
): boolean {
  if (studentWeeklyBudget === null) return false;
  const min = getCampusMinPrice(campusId, currency, tiers);
  if (min === null) return false;
  return studentWeeklyBudget < min;
}
