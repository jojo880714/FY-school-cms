import { describe, it, expect } from 'vitest';
import { getCampusMinPrice, isOverBudget, type TuitionTierForBudget } from './budget-fit';

const tiers: TuitionTierForBudget[] = [
  { campus_id: 'X', price_per_week: 400, currency: 'AUD' },
  { campus_id: 'X', price_per_week: 380, currency: 'AUD' },
  { campus_id: 'X', price_per_week: 500, currency: 'GBP' },
  { campus_id: 'Y', price_per_week: 250, currency: 'CAD' },
];

describe('getCampusMinPrice', () => {
  it('X 校區 AUD 最低 380', () => {
    expect(getCampusMinPrice('X', 'AUD', tiers)).toBe(380);
  });
  it('X 校區 GBP 最低 500(單一 tier)', () => {
    expect(getCampusMinPrice('X', 'GBP', tiers)).toBe(500);
  });
  it('Y 校區 USD 無 tier → null', () => {
    expect(getCampusMinPrice('Y', 'USD', tiers)).toBe(null);
  });
  it('未知校區 → null', () => {
    expect(getCampusMinPrice('Z', 'AUD', tiers)).toBe(null);
  });
});

describe('isOverBudget', () => {
  it('學生未填預算 → false', () => {
    expect(isOverBudget(null, 'X', 'AUD', tiers)).toBe(false);
  });
  it('學生 AUD 500/週,X 校最低 380 → false(在預算內)', () => {
    expect(isOverBudget(500, 'X', 'AUD', tiers)).toBe(false);
  });
  it('學生 AUD 300/週,X 校最低 380 → true(超出)', () => {
    expect(isOverBudget(300, 'X', 'AUD', tiers)).toBe(true);
  });
  it('該校區無對應幣別 tier → false(不擋,軟提示性質)', () => {
    expect(isOverBudget(300, 'X', 'USD', tiers)).toBe(false);
  });
});
