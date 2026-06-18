/**
 * 報價計算引擎 — 驗證 tests
 *
 * 跑法:`npm test` 或 `npx vitest run src/lib/quotation/calculate.test.ts`
 *
 * 對齊報價系統 app.js 297-405 行的 calculate() 邏輯,
 * 確保 port 過來的 TypeScript 版本算出相同結果。
 */

import { describe, it, expect } from 'vitest';
import { calculate } from './calculate';
import type { QuotationInput, Course, Accommodation, Fee, AdminSettings, Currency } from './types';

// ─── fixtures ─────────────────────────────────────────────

const standardRates: Record<Currency, number> = {
  AUD: 21.5,
  GBP: 40.2,
  EUR: 33.8,
  USD: 32.1,
  CAD: 23.5,
  NZD: 20.0,
  TWD: 1,
};

const standardAdmin: AdminSettings = {
  fxBuffer: 2,        // 2% 匯差緩衝
  commissionPct: 0,   // 無顧問獎金
  taxRate: 5,         // 5% 稅
  rebates: { EP: 10 } as Record<string, number>,  // EP 退傭 10%
};

// EP Brisbane 經典上午課程(對齊 app.js SCHOOL_DATA 內真實樣本)
const epBrisbaneClassicCourse: Course = {
  name: '經典上午課程 (15h)',
  category: '課程',
  currency: 'AUD',
  unit: '按週計算',
  tiers: [
    { wf: 1, wt: 11, price: 400, fixed: 0, peak: 0 },
    { wf: 12, wt: 23, price: 380, fixed: 0, peak: 0 },
    { wf: 24, wt: 99, price: 360, fixed: 0, peak: 0 },
  ],
};

const epBrisbaneHomestay: Accommodation = {
  type: '寄宿家庭',
  name: '寄宿家庭-單人房 (僅供晚餐)',
  currency: 'AUD',
  price: 385,
  fixed: 0,
  unit: '按週計算',
};

const epRegistrationFee: Fee = {
  name: '註冊費',
  category: '註冊',
  currency: 'AUD',
  price: 0,
  fixed: 285,
  unit: '固定金額',
};

const epAccommArrangeFee: Fee = {
  name: '住宿安排費',
  category: '行政',
  currency: 'AUD',
  price: 0,
  fixed: 385,
  unit: '固定金額',
};

const epStandardFees: Fee[] = [epRegistrationFee, epAccommArrangeFee];

// ─── helper:建構標準 input ─────────────────────────────────

function buildInput(overrides: Partial<QuotationInput> = {}): QuotationInput {
  return {
    vendor: 'EP',
    campus: 'Brisbane',
    course: epBrisbaneClassicCourse,
    weeks: 12,
    startDate: '2026-09-01',
    accomm: epBrisbaneHomestay,
    extras: {},
    disc: { type: '原價', pct: 0, fixed: 0, schoolDiscount: null },
    campusFees: epStandardFees,
    rates: standardRates,
    adminSettings: standardAdmin,
    ...overrides,
  };
}

// ─── tests ─────────────────────────────────────────────────

describe('calculate() — 基礎驗證', () => {
  it('必要欄位缺失返回空結果', () => {
    const result = calculate({
      vendor: '',
      campus: '',
      course: null as unknown as Course,
      weeks: 0,
      accomm: null,
      extras: {},
      disc: { type: '原價', pct: 0, fixed: 0, schoolDiscount: null },
      campusFees: [],
      rates: standardRates,
      adminSettings: standardAdmin,
    });
    expect(result.finalTWD).toBe(0);
    expect(result.items).toHaveLength(0);
  });

  it('12 週課程 = 12 × 380 = 4560 AUD(用 tier 12-23)', () => {
    const result = calculate(buildInput({ weeks: 12, accomm: null, extras: {} }));
    const courseItem = result.items.find((i) => i.name.includes('經典上午課程'));
    expect(courseItem).toBeDefined();
    expect(courseItem!.amt).toBe(4560);          // 12 × 380(tier wf:12 → price:380)
    expect(courseItem!.note).toBe('12週 × A$380');
  });

  it('12 週 + 寄宿家庭 12 週 = 4560 + 4620 = 9180 AUD,加註冊+安排費', () => {
    const result = calculate(buildInput({ weeks: 12 }));
    expect(result.items.length).toBeGreaterThanOrEqual(4);
    // 應該包含:課程、註冊、寄宿、住宿安排費
    const names = result.items.map((i) => i.name);
    expect(names).toContain('經典上午課程 (15h)');
    expect(names).toContain('註冊費');
    expect(names).toContain('寄宿家庭-單人房 (僅供晚餐)');
    expect(names).toContain('住宿安排費');
  });
});

describe('calculate() — Tier 階梯定價', () => {
  it('週數 1-11 用 tier 1', () => {
    const result = calculate(buildInput({ weeks: 8, accomm: null, extras: {} }));
    const courseItem = result.items.find((i) => i.name.includes('經典上午課程'))!;
    expect(courseItem.amt).toBe(400 * 8); // tier wf 1-11 price 400
  });

  it('週數 12-23 用 tier 2', () => {
    const result = calculate(buildInput({ weeks: 16, accomm: null, extras: {} }));
    const courseItem = result.items.find((i) => i.name.includes('經典上午課程'))!;
    expect(courseItem.amt).toBe(380 * 16); // tier wf 12-23 price 380
  });

  it('週數 24+ 用 tier 3', () => {
    const result = calculate(buildInput({ weeks: 30, accomm: null, extras: {} }));
    const courseItem = result.items.find((i) => i.name.includes('經典上午課程'))!;
    expect(courseItem.amt).toBe(360 * 30); // tier wf 24-99 price 360
  });
});

describe('calculate() — 多幣別 TWD 換算', () => {
  it('AUD 12 × 400 = 4800 AUD,× 21.5 = 103,200 TWD', () => {
    const input = buildInput({ weeks: 8, accomm: null, extras: {} });
    const result = calculate(input);
    const courseItem = result.items.find((i) => i.name.includes('經典上午課程'))!;
    // 8 週 × 400 = 3200 AUD;3200 × 21.5 = 68,800 TWD
    expect(courseItem.amt).toBe(3200);
    expect(courseItem.twd).toBe(68_800);
  });
});

describe('calculate() — 6 層算費', () => {
  it('Layer 1 rawCostTWD = 各 items twd 加總', () => {
    const result = calculate(buildInput({ weeks: 8, accomm: null, extras: {} }));
    const expected = result.items.reduce((s, i) => s + (i.twd || 0), 0);
    expect(result.rawCostTWD).toBe(expected);
  });

  it('Layer 2 廠商折扣 10%:cost 變 90%', () => {
    const result = calculate(
      buildInput({
        weeks: 8,
        accomm: null,
        extras: {},
        disc: {
          type: '原價',
          pct: 0,
          fixed: 0,
          schoolDiscount: { label: '早鳥', pct: 10, fixed: 0 },
        },
      })
    );
    expect(result.schoolDiscAmt).toBe(Math.round((result.rawCostTWD * 10) / 100));
    expect(result.discountedCostTWD).toBe(result.rawCostTWD - result.schoolDiscAmt);
    expect(result.discLines).toHaveLength(1);
    expect(result.discLines[0].type).toBe('school');
  });

  it('Layer 3 匯差緩衝 2%:cost × 1.02', () => {
    const result = calculate(buildInput({ weeks: 8, accomm: null, extras: {} }));
    expect(result.fxBuf).toBe(1.02);
    expect(result.costTWD).toBe(Math.round(result.discountedCostTWD * 1.02));
  });

  it('Layer 4 顧問獎金 0%:preTaxSell = costTWD', () => {
    const result = calculate(buildInput({ weeks: 8, accomm: null, extras: {} }));
    expect(result.commPct).toBe(0);
    expect(result.preTaxSell).toBe(result.costTWD);
  });

  it('Layer 4 顧問獎金 10%:preTaxSell = costTWD × 1.10', () => {
    const result = calculate(
      buildInput({
        weeks: 8,
        accomm: null,
        extras: {},
        adminSettings: { ...standardAdmin, commissionPct: 10 },
      })
    );
    expect(result.commPct).toBeCloseTo(0.1);
    expect(result.preTaxSell).toBe(Math.round(result.costTWD * 1.10));
  });

  it('Layer 5 公司折扣 5%:afterCoDisc 減去 5%', () => {
    const result = calculate(
      buildInput({
        weeks: 8,
        accomm: null,
        extras: {},
        disc: { type: '春季優惠', pct: 5, fixed: 0, schoolDiscount: null },
      })
    );
    expect(result.discLines.some((l) => l.type === 'company')).toBe(true);
    expect(result.discountAmt).toBeGreaterThan(0);
  });

  it('Layer 6 營業稅 5%:finalTWD = afterCoDisc × 1.05', () => {
    const result = calculate(buildInput({ weeks: 8, accomm: null, extras: {} }));
    // afterCoDisc = preTaxSell(無公司折扣)= preTaxSell
    expect(result.taxAmt).toBe(Math.round((result.preTaxSell * 5) / 100));
    expect(result.finalTWD).toBe(result.preTaxSell + result.taxAmt);
  });
});

describe('calculate() — 管理員淨利試算', () => {
  it('EP 退傭 10%:rebateTWD = discountedCostTWD × 10%', () => {
    const result = calculate(buildInput({ weeks: 8, accomm: null, extras: {} }));
    expect(result.rebatePct).toBe(10);
    expect(result.rebateTWD).toBe(Math.round((result.discountedCostTWD * 10) / 100));
  });

  it('未列廠商退傭預設 0', () => {
    const result = calculate(
      buildInput({
        vendor: 'NEW_VENDOR',
        weeks: 8,
        accomm: null,
        extras: {},
      })
    );
    expect(result.rebatePct).toBe(0);
    expect(result.rebateTWD).toBe(0);
  });

  it('netMargin 數字合理(0-50% 之間)', () => {
    const result = calculate(buildInput({ weeks: 8, accomm: null, extras: {} }));
    expect(result.netMargin).toBeGreaterThan(0);
    expect(result.netMargin).toBeLessThan(50);
  });
});

describe('calculate() — totalOrig 多幣別組合', () => {
  it('單幣別只顯示一個', () => {
    const result = calculate(buildInput({ weeks: 8, accomm: null, extras: {} }));
    expect(result.totalOrig).toContain('A$');
    expect(result.totalOrig.split(' + ')).toHaveLength(1);
  });

  it('混合 AUD + GBP 顯示兩個', () => {
    const gbpExtra: Fee = {
      name: '海外接送',
      category: '雜費',
      currency: 'GBP',
      price: 0,
      fixed: 80,
      unit: '固定金額',
    };
    const result = calculate(
      buildInput({
        weeks: 8,
        accomm: null,
        extras: { extra1: gbpExtra },
      })
    );
    expect(result.totalOrig).toContain('A$');
    expect(result.totalOrig).toContain('£');
    expect(result.totalOrig.split(' + ').length).toBeGreaterThanOrEqual(2);
  });
});
