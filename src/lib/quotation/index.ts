/**
 * 報價計算引擎 — 公開 API
 *
 * 從現有報價系統(jojo880714/FY-quotation-system-EP- app.js)抽出。
 * 6 層算費邏輯:Layer 1 rawCost → 2 廠商折扣 → 3 匯差緩衝 → 4 顧問獎金 → 5 公司折扣 → 6 營業稅。
 *
 * ## 使用方式(等 design + 整合 phase 開始時)
 *
 * ```ts
 * import { calculate, defaultAdminSettings } from '@/lib/quotation';
 *
 * const result = calculate({
 *   vendor: 'EP',
 *   campus: 'Brisbane',
 *   course: ...,
 *   weeks: 12,
 *   accomm: ...,
 *   extras: {},
 *   disc: { type: '原價', pct: 0, fixed: 0, schoolDiscount: null },
 *   campusFees: [...],
 *   rates: { AUD: 21.5, GBP: 40.2, ... },
 *   adminSettings: defaultAdminSettings,
 * });
 *
 * console.log(result.finalTWD, result.netMargin);
 * ```
 *
 * ## 紅線
 *
 * - 算費邏輯不能變(從 app.js 照搬)
 * - PIN '991234' 機制不要保留(改為 Nexus role-based)
 * - 廠商真實 SCHOOL_DATA 等實作 phase 灌進 CMS DB(見 Group 2 C ETL 計畫)
 */

export { calculate } from './calculate';
export { sf, fmt, twd, getTier, isPeak } from './helpers';

export type {
  Currency,
  PricingUnit,
  Vendor,
  PricingTier,
  Course,
  Accommodation,
  Fee,
  CampusData,
  SchoolDataMap,
  Discount,
  SchoolDiscount,
  AdminSettings,
  QuotationInput,
  QuotationItem,
  DiscountLine,
  QuotationResult,
} from './types';

/** 預設管理員設定(對齊 app.js 248-264 行的初始值)*/
export const defaultAdminSettings = {
  /** 匯差緩衝 2% */
  fxBuffer: 2,
  /** 顧問獎金 0%(預設不加成)*/
  commissionPct: 0,
  /** 營業稅 5% */
  taxRate: 5,
  /** 各廠商退傭(管理員淨利用,實作 phase 從 DB 載入)*/
  rebates: {} as Record<string, number>,
} as const;

/** 預設匯率(從 app.js 137 行抓,實際應該從匯率 API / Supabase 動態載入)*/
export const defaultRates = {
  AUD: 21.5,
  GBP: 40.2,
  EUR: 33.8,
  USD: 32.1,
  CAD: 23.5,
  NZD: 20.0,
  TWD: 1,
} as const;
