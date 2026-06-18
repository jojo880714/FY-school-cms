import { describe, it, expect } from 'vitest';
import { isAgeBlocked, isAgeFit } from './age-fit';

describe('isAgeBlocked', () => {
  it('學生未填年齡 → false', () => {
    expect(isAgeBlocked(null, 18)).toBe(false);
  });
  it('學校未設 min_age → false', () => {
    expect(isAgeBlocked(17, null)).toBe(false);
  });
  it('學生 17 < school min 18 → true', () => {
    expect(isAgeBlocked(17, 18)).toBe(true);
  });
  it('學生 18 = school min 18 → false', () => {
    expect(isAgeBlocked(18, 18)).toBe(false);
  });
  it('學生 25 > school min 16 → false', () => {
    expect(isAgeBlocked(25, 16)).toBe(false);
  });
});

describe('isAgeFit', () => {
  it('isAgeFit 是 isAgeBlocked 的反', () => {
    expect(isAgeFit(17, 18)).toBe(false);
    expect(isAgeFit(18, 18)).toBe(true);
  });
});
