/**
 * 報價計算引擎 — 型別定義
 *
 * 從現有報價系統(`jojo880714/FY-quotation-system-EP-` app.js)抽出
 * 改寫成 TypeScript module,供 CMS 內部使用。
 *
 * **報價邏輯不能變**(從 app.js 照搬)— 5 廠商定價、tier 階梯、按週/堂/固定/天計算、
 * 尖峰加價、6 層算費(廠商折扣 → 匯差緩衝 → 顧問獎金 → 公司折扣 → 營業稅)。
 */

/** ISO 幣別代碼 */
export type Currency = 'AUD' | 'GBP' | 'EUR' | 'USD' | 'CAD' | 'NZD' | 'TWD';

/** 計價單位 */
export type PricingUnit =
  | '按週計算'
  | '每週'        // 同 '按週計算'
  | '按堂計算'
  | '按天計算'
  | '固定金額';

/** 廠商代碼 */
export type Vendor = 'EP' | 'ILSC' | 'EC' | 'Kaplan' | 'SGIC' | string;

/** 週數階梯定價 */
export interface PricingTier {
  /** weeks from(>=) */
  wf: number;
  /** weeks to(<=) */
  wt: number;
  /** 該級價格(主要,按單位計算)*/
  price: number;
  /** 固定金額(替代 price,例:註冊費)*/
  fixed: number;
  /** 尖峰季加價(每單位額外加)*/
  peak: number;
}

/** 課程 */
export interface Course {
  name: string;
  category: string;
  currency: Currency;
  unit: PricingUnit;
  tiers: PricingTier[];
}

/** 住宿選項 */
export interface Accommodation {
  type: string;
  name: string;
  currency: Currency;
  /** 主要單價(若 unit=按週,則為週費)*/
  price: number;
  /** 替代 price 的固定金額 */
  fixed: number;
  unit: PricingUnit;
  note?: string;
}

/** 雜費(註冊費 / 教材費 / 住宿安排費 / 銀行手續費 等)*/
export interface Fee {
  name: string;
  category: '教材' | '註冊' | '銀行' | '行政' | '雜費' | string;
  currency: Currency;
  price: number;
  fixed: number;
  unit: PricingUnit;
  /** 適用週數下限(可選)*/
  wf?: number;
  /** 適用週數上限(可選)*/
  wt?: number;
}

/** 校區資料(廠商 → 校區 → courses + accomm + fees)*/
export interface CampusData {
  courses: Course[];
  accomm: Accommodation[];
  fees?: Fee[];
}

/** 5 廠商完整資料結構 */
export type SchoolDataMap = Record<Vendor, Record<string /* campus name */, CampusData>>;

/** 折扣設定 */
export interface Discount {
  /** 折扣類型標籤 */
  type: string;
  /** 百分比折扣(e.g. 5 → 95 折)*/
  pct: number;
  /** 固定金額折扣(TWD)*/
  fixed: number;
  /** 廠商級折扣(Layer 2,優先於 type/pct/fixed 套用)*/
  schoolDiscount: SchoolDiscount | null;
}

export interface SchoolDiscount {
  label: string;
  pct: number;
  fixed: number;
}

/** 管理員設定(影響 Layer 3-6 + 淨利試算)*/
export interface AdminSettings {
  /** 匯差緩衝 %(預設 2)*/
  fxBuffer: number;
  /** 顧問獎金 %(預設 0)*/
  commissionPct: number;
  /** 營業稅率 %(預設 5)*/
  taxRate: number;
  /** 各廠商退傭 %(管理員淨利試算用)*/
  rebates: Record<Vendor, number>;
}

/** 報價輸入參數(取代原 global state)*/
export interface QuotationInput {
  vendor: Vendor;
  campus: string;
  course: Course;
  /** 上課週數 */
  weeks: number;
  /** 起始日(yyyy-mm-dd,影響 isPeak)*/
  startDate?: string;
  /** 住宿選項;null 或 'none' 表示不選 */
  accomm: Accommodation | 'none' | null;
  /** 雜費 extras(key 任意,通常用 fee.name)*/
  extras: Record<string, Fee>;
  /** 折扣 */
  disc: Discount;
  /** 廠商校區的雜費清單(由 caller 傳入,通常從 SchoolDataMap 抓)*/
  campusFees: Fee[];
  /** 多幣別 → TWD 匯率 */
  rates: Record<Currency, number>;
  /** 管理員設定 */
  adminSettings: AdminSettings;
}

/** 報價單一明細 */
export interface QuotationItem {
  name: string;
  /** 計算說明,例 "12週 × A$420 + 旺季A$50/週" */
  note: string;
  /** 原幣金額 */
  amt: number;
  /** TWD 金額(已換算)*/
  twd: number;
  currency: Currency;
  /** 顯示字串,例 "A$5,640" */
  display: string;
}

/** 折扣明細(顯示在報價單上)*/
export interface DiscountLine {
  label: string;
  amt: number;  // 負數
  type: 'school' | 'company';
}

/** 完整報價結果(6 層算費後的全部數字)*/
export interface QuotationResult {
  /** 各項明細 */
  items: QuotationItem[];

  /** Layer 1:原成本 TWD(各項目 TWD 加總)*/
  rawCostTWD: number;

  /** Layer 2:廠商折扣後成本 */
  discountedCostTWD: number;
  schoolDiscAmt: number;

  /** Layer 3:匯差緩衝倍率 */
  fxBuf: number;
  /** Layer 3 後:成本含緩衝 */
  costTWD: number;

  /** Layer 4:顧問獎金倍率 */
  commPct: number;
  /** Layer 4 後:稅前售價 */
  preTaxSell: number;

  /** Layer 5 折扣明細 */
  discLines: DiscountLine[];
  /** Layer 5 公司折扣金額 */
  discountAmt: number;
  /** Layer 2+5 合計折扣 */
  totalDiscount: number;

  /** Layer 6:營業稅金額 */
  taxAmt: number;
  /** Layer 6 後:最終售價(顧問版顯示金額)*/
  finalTWD: number;

  /** 進位後顯示用(可選)*/
  displayFinal: number;

  /** 各幣別原值組合字串,例 "A$5,640 + A$3,000" */
  totalOrig: string;

  /** ─── 管理員視角:淨利試算 ─── */
  rebatePct: number;
  rebateTWD: number;
  commissionTWD: number;
  netProfit: number;
  /** 淨利率 %(小數一位)*/
  netMargin: number;
}
