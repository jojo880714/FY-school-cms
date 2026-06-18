/**
 * 報價計算引擎 — 核心 calculate() function
 *
 * 從 app.js 297-405 行改寫成 pure TypeScript function(不依賴 global state)。
 * **6 層算費邏輯不能變**:
 *   Layer 1:rawCostTWD(各項目原幣 → TWD 加總)
 *   Layer 2:廠商級折扣(schoolDiscount)
 *   Layer 3:匯差緩衝(fxBuf 倍率)
 *   Layer 4:顧問獎金(commission %,加成)
 *   Layer 5:公司級折扣(disc.pct or disc.fixed)
 *   Layer 6:營業稅(taxRate %)
 *
 * 同時計算管理員看的淨利試算(rebate / commission / netProfit / netMargin)。
 */

import type {
  QuotationInput,
  QuotationResult,
  QuotationItem,
  DiscountLine,
  PricingUnit,
  Currency,
} from './types';
import { fmt, twd, getTier, isPeak } from './helpers';

/** 「按週計算」單位判斷(同 '每週')*/
function isWeeklyUnit(unit: PricingUnit): boolean {
  return unit === '按週計算' || unit === '每週';
}

/** 空結果(無法計算時返回)*/
function emptyResult(): QuotationResult {
  return {
    items: [],
    rawCostTWD: 0,
    discountedCostTWD: 0,
    schoolDiscAmt: 0,
    fxBuf: 1,
    costTWD: 0,
    commPct: 0,
    preTaxSell: 0,
    discLines: [],
    discountAmt: 0,
    totalDiscount: 0,
    taxAmt: 0,
    finalTWD: 0,
    displayFinal: 0,
    totalOrig: '',
    rebatePct: 0,
    rebateTWD: 0,
    commissionTWD: 0,
    netProfit: 0,
    netMargin: 0,
  };
}

/**
 * 計算單一報價 — 6 層算費 + 管理員淨利試算。
 *
 * @param input QuotationInput(已脫離 global state,純函數)
 * @returns QuotationResult 完整數字
 */
export function calculate(input: QuotationInput): QuotationResult {
  const { vendor, campus, course, weeks, startDate, accomm, extras, disc, campusFees, rates, adminSettings } = input;

  // 前置:必要欄位缺失就返回空結果
  if (!vendor || !campus || !course || !weeks || weeks < 1) {
    return emptyResult();
  }

  const w = weeks;
  const pk = isPeak(startDate);
  const items: QuotationItem[] = [];

  // ─── Course 課程費 ──────────────────────────────────────
  const tier = getTier(course.tiers, w);
  const baseP = tier.price || tier.fixed;
  const cur = course.currency;
  const isWkly = isWeeklyUnit(course.unit);
  const pkAdd = pk ? (tier.peak || 0) : 0;
  const cAmt = isWkly ? (baseP + pkAdd) * w : baseP;
  const cNote = isWkly
    ? `${w}週 × ${fmt(baseP, cur)}${pkAdd > 0 ? ` + 旺季${fmt(pkAdd, cur)}/週` : ''}`
    : '固定費用';
  items.push({
    name: course.name,
    note: cNote,
    amt: cAmt,
    twd: twd(cAmt, cur, rates),
    currency: cur,
    display: fmt(cAmt, cur),
  });

  // ─── Admin(教材 / 註冊 / 銀行 等自動計入)──────────────────
  campusFees
    .filter((f) => ['教材', '註冊', '銀行'].includes(f.category) && w >= (f.wf ?? 1) && w <= (f.wt ?? 99))
    .forEach((f) => {
      const p = f.price || f.fixed;
      if (!p) return;
      const isW = isWeeklyUnit(f.unit);
      const a = isW ? p * w : p;
      items.push({
        name: f.name,
        note: '自動計入',
        amt: a,
        twd: twd(a, f.currency, rates),
        currency: f.currency,
        display: fmt(a, f.currency),
      });
    });

  // ─── Accommodation 住宿 ────────────────────────────────
  if (accomm && accomm !== 'none') {
    const a = accomm;
    const aP = a.price || a.fixed;
    const aC = a.currency;
    const aW = isWeeklyUnit(a.unit);
    const aA = aW ? aP * w : aP;
    items.push({
      name: a.name,
      note: aW ? `${w}週 × ${fmt(aP, aC)}` : '固定費用',
      amt: aA,
      twd: twd(aA, aC, rates),
      currency: aC,
      display: fmt(aA, aC),
    });

    // 住宿行政費(如有)
    const arr = campusFees.find(
      (f) => f.category === '行政' && (f.name.includes('住宿') || f.name.includes('安排'))
    );
    if (arr) {
      const p = arr.price || arr.fixed;
      if (p > 0) {
        items.push({
          name: arr.name,
          note: '住宿行政費',
          amt: p,
          twd: twd(p, arr.currency, rates),
          currency: arr.currency,
          display: fmt(p, arr.currency),
        });
      }
    }
  }

  // ─── Extras 額外雜費 ───────────────────────────────────
  Object.values(extras).forEach((f) => {
    const p = f.price || f.fixed;
    const aC = f.currency;
    const isW = isWeeklyUnit(f.unit);
    const a = isW ? p * w : p;
    items.push({
      name: f.name,
      note: f.category,
      amt: a,
      twd: twd(a, aC, rates),
      currency: aC,
      display: fmt(a, aC),
    });
  });

  // ─── Layer 1:rawCostTWD ──────────────────────────────
  const rawCostTWD = items.reduce((s, i) => s + (i.twd || 0), 0);

  // ─── Layer 2:廠商折扣 ────────────────────────────────
  const discLines: DiscountLine[] = [];
  let schoolDiscAmt = 0;
  let discountedCostTWD = rawCostTWD;

  if (disc.schoolDiscount) {
    const sd = disc.schoolDiscount;
    schoolDiscAmt = sd.pct > 0 ? Math.round((rawCostTWD * sd.pct) / 100) : sd.fixed || 0;
    discountedCostTWD = rawCostTWD - schoolDiscAmt;
    discLines.push({
      label: `${sd.label}(廠商折扣)`,
      amt: -schoolDiscAmt,
      type: 'school',
    });
  }

  // ─── Layer 3:匯差緩衝 ────────────────────────────────
  const fxBuf = 1 + (adminSettings.fxBuffer || 0) / 100;
  const costTWD = Math.round(discountedCostTWD * fxBuf);

  // ─── Layer 4:顧問獎金加成 ──────────────────────────────
  const commPct = (adminSettings.commissionPct || 0) / 100;
  const preTaxSell = Math.round(costTWD * (1 + commPct));

  // ─── Layer 5:公司折扣 ────────────────────────────────
  let afterCoDisc = preTaxSell;
  if (disc.type !== '原價' && disc.type !== '' && disc.type) {
    let coAmt = 0;
    if (disc.pct > 0) coAmt = Math.round((preTaxSell * disc.pct) / 100);
    else if (disc.fixed > 0) coAmt = disc.fixed;
    afterCoDisc = preTaxSell - coAmt;
    if (coAmt > 0) {
      discLines.push({
        label: `${disc.type}(公司折扣)`,
        amt: -coAmt,
        type: 'company',
      });
    }
  }

  // ─── Layer 6:營業稅 ─────────────────────────────────
  const taxAmt = Math.round((afterCoDisc * (adminSettings.taxRate || 5)) / 100);
  const finalTWD = afterCoDisc + taxAmt;

  const discountAmt = preTaxSell - afterCoDisc;
  const totalDiscount = schoolDiscAmt + discountAmt;

  // ─── 原幣加總組合字串 ────────────────────────────────
  const byCur: Record<string, number> = {};
  items.forEach((i) => {
    byCur[i.currency] = (byCur[i.currency] || 0) + i.amt;
  });
  const totalOrig = Object.entries(byCur)
    .map(([cur, v]) => fmt(v, cur as Currency))
    .join(' + ');

  // ─── 管理員淨利試算 ──────────────────────────────────
  const rebatePct = adminSettings.rebates?.[vendor] || 0;
  const rebateTWD = Math.round((discountedCostTWD * rebatePct) / 100);
  const commissionTWD = preTaxSell - costTWD;
  const netProfit = afterCoDisc - costTWD + rebateTWD;
  const netMargin = finalTWD > 0 ? Math.round((netProfit / finalTWD) * 1000) / 10 : 0;

  return {
    items,
    rawCostTWD,
    discountedCostTWD,
    schoolDiscAmt,
    fxBuf,
    costTWD,
    commPct,
    preTaxSell,
    discLines,
    discountAmt,
    totalDiscount,
    taxAmt,
    finalTWD,
    displayFinal: finalTWD,
    totalOrig,
    rebatePct,
    rebateTWD,
    commissionTWD,
    netProfit,
    netMargin,
  };
}
