import { describe, it, expect } from 'vitest';
import { getSchoolMinEntryCefr, isLevelTooLow, type ProgramForLevel } from './english-level-fit';

const programs: ProgramForLevel[] = [
  { school_id: 'A', entry_level: 'Beginner (A1)' },
  { school_id: 'A', entry_level: 'Pre-Intermediate (A2)' },
  { school_id: 'B', entry_level: 'Upper-Intermediate (B2)' },
  { school_id: 'B', entry_level: 'Advanced (C1)' },
  { school_id: 'C', entry_level: null },
  { school_id: 'D', entry_level: 'IELTS 6.0' }, // 無 CEFR token
];

describe('getSchoolMinEntryCefr', () => {
  it('A 校最低 A1(取最低)', () => {
    expect(getSchoolMinEntryCefr('A', programs)).toBe('A1');
  });
  it('B 校最低 B2(取最低,不是 C1)', () => {
    expect(getSchoolMinEntryCefr('B', programs)).toBe('B2');
  });
  it('C 校全 null → null', () => {
    expect(getSchoolMinEntryCefr('C', programs)).toBe(null);
  });
  it('D 校 entry_level 無 CEFR token → null', () => {
    expect(getSchoolMinEntryCefr('D', programs)).toBe(null);
  });
});

describe('isLevelTooLow', () => {
  it('學生 A1 vs B 校最低 B2 → true(太低)', () => {
    expect(isLevelTooLow('A1', 'B', programs)).toBe(true);
  });
  it('學生 C1 vs B 校最低 B2 → false(達標)', () => {
    expect(isLevelTooLow('C1', 'B', programs)).toBe(false);
  });
  it('學生 A1 vs A 校最低 A1 → false(剛好)', () => {
    expect(isLevelTooLow('A1', 'A', programs)).toBe(false);
  });
  it('學生未測 → false', () => {
    expect(isLevelTooLow(null, 'B', programs)).toBe(false);
  });
  it('C 校無 CEFR 門檻 → false', () => {
    expect(isLevelTooLow('A1', 'C', programs)).toBe(false);
  });
});
