import { describe, it, expect } from 'vitest';
import { toeicToCefr, ieltsToCefr, toeflToCefr, examToCefr, isLevelTooHigh } from './cefr';

describe('toeicToCefr', () => {
  it('950+ → C2', () => expect(toeicToCefr(950)).toBe('C2'));
  it('800 → C1', () => expect(toeicToCefr(800)).toBe('C1'));
  it('700 → B2', () => expect(toeicToCefr(700)).toBe('B2'));
  it('400 → B1', () => expect(toeicToCefr(400)).toBe('B1'));
  it('200 → A2', () => expect(toeicToCefr(200)).toBe('A2'));
  it('100 → A1', () => expect(toeicToCefr(100)).toBe('A1'));
  it('0 → A1', () => expect(toeicToCefr(0)).toBe('A1'));
});

describe('ieltsToCefr', () => {
  it('9.0 → C2', () => expect(ieltsToCefr(9.0)).toBe('C2'));
  it('7.5 → C1', () => expect(ieltsToCefr(7.5)).toBe('C1'));
  it('6.0 → B2', () => expect(ieltsToCefr(6.0)).toBe('B2'));
  it('4.5 → B1', () => expect(ieltsToCefr(4.5)).toBe('B1'));
  it('3.0 → A2', () => expect(ieltsToCefr(3.0)).toBe('A2'));
  it('2.0 → A1', () => expect(ieltsToCefr(2.0)).toBe('A1'));
});

describe('toeflToCefr', () => {
  it('115 → C2', () => expect(toeflToCefr(115)).toBe('C2'));
  it('100 → C1', () => expect(toeflToCefr(100)).toBe('C1'));
  it('80 → B2', () => expect(toeflToCefr(80)).toBe('B2'));
  it('50 → B1', () => expect(toeflToCefr(50)).toBe('B1'));
  it('35 → A2', () => expect(toeflToCefr(35)).toBe('A2'));
  it('20 → A1', () => expect(toeflToCefr(20)).toBe('A1'));
});

describe('examToCefr 通用入口', () => {
  it('none_basic → A2', () => expect(examToCefr('none_basic', null)).toBe('A2'));
  it('none_beginner → A1', () => expect(examToCefr('none_beginner', null)).toBe('A1'));
  it('toeic 700 → B2', () => expect(examToCefr('toeic', 700)).toBe('B2'));
  it('ielts 6.0 → B2', () => expect(examToCefr('ielts', 6.0)).toBe('B2'));
  it('toefl 80 → B2', () => expect(examToCefr('toefl', 80)).toBe('B2'));
  it('toeic null score → null', () => expect(examToCefr('toeic', null)).toBe(null));
  it('unknown type → null', () => expect(examToCefr('xxx', 500)).toBe(null));
});

describe('isLevelTooHigh', () => {
  it('學生 B1 vs 入學門檻 B2 → true(學生程度不足)', () => {
    expect(isLevelTooHigh('B1', 'B2')).toBe(true);
  });
  it('學生 B2 vs 入學門檻 B2 → false(剛好符合)', () => {
    expect(isLevelTooHigh('B2', 'B2')).toBe(false);
  });
  it('學生 C1 vs 入學門檻 B2 → false(程度高於門檻)', () => {
    expect(isLevelTooHigh('C1', 'B2')).toBe(false);
  });
  it('學生 A2 vs entry_level "Upper-Intermediate (B2)" → true(從字串抓 CEFR)', () => {
    expect(isLevelTooHigh('A2', 'Upper-Intermediate (B2)')).toBe(true);
  });
  it('學生未測 → false(不過濾)', () => {
    expect(isLevelTooHigh(null, 'B2')).toBe(false);
  });
  it('學校未設 entry_level → false', () => {
    expect(isLevelTooHigh('B2', null)).toBe(false);
  });
  it('entry_level 無 CEFR token → false', () => {
    expect(isLevelTooHigh('B2', 'IELTS 6.0')).toBe(false);
  });
});
