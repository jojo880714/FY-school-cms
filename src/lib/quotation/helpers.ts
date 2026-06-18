/**
 * 報價計算引擎 — Helper functions
 *
 * 從 app.js 268-290 行抽出。
 */

import type { Currency, PricingTier } from './types';

/** 幣別符號表 */
const CURRENCY_SYMBOLS: Record<Currency, string> = {
  AUD: 'A$',
  GBP: '£',
  EUR: '€',
  USD: 'US$',
  CAD: 'C$',
  NZD: 'NZ$',
  TWD: 'NT$',
};

/** parseFloat 安全版 — 拒絕 NaN(回 0)*/
export function sf(v: unknown): number {
  if (v == null || v === '') return 0;
  const f = parseFloat(String(v));
  return Number.isFinite(f) ? f : 0;
}

/** 金額格式化(原幣)— 例 fmt(5640, 'AUD') → "A$5,640" */
export function fmt(v: number, cur: Currency): string {
  const sym = CURRENCY_SYMBOLS[cur] ?? cur;
  return sym + Math.round(v).toLocaleString();
}

/** TWD 換算(四捨五入到整數)*/
export function twd(v: number, cur: Currency, rates: Record<Currency, number>): number {
  return Math.round(v * (rates[cur] ?? 1));
}

/** 從週數階梯抓對應的 tier */
export function getTier(tiers: PricingTier[], weeks: number): PricingTier {
  for (const t of tiers) {
    const wf = t.wf ?? 1;
    const wt = t.wt ?? 99;
    if (weeks >= wf && weeks <= wt) return t;
  }
  return tiers[tiers.length - 1];
}

/**
 * 判斷是否尖峰季節
 *
 * 報價系統現行邏輯:沒有 startDate → false;有日期則檢查月份。
 * **暫時 stub 為 false**(原 app.js 邏輯依 vendor 而異,需要時再從 app.js 抽進來)。
 *
 * @param startDate yyyy-mm-dd
 */
export function isPeak(startDate?: string): boolean {
  if (!startDate) return false;
  // TODO: 對齊 app.js 271-277 行的真實邏輯(依 vendor / 月份規則)
  // 暫時保守回 false,匯入廠商真實 peak 規則後再實作
  return false;
}
