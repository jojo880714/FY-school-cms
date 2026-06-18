import { describe, it, expect } from 'vitest';
import { getSchoolMinWeeks, isWeeksMismatch, type ProgramMinWeeks } from './weeks-fit';

const programs: ProgramMinWeeks[] = [
  { school_id: 'A', min_weeks: 4 },
  { school_id: 'A', min_weeks: 8 },
  { school_id: 'B', min_weeks: 12 },
  { school_id: 'C', min_weeks: null },
];

describe('getSchoolMinWeeks', () => {
  it('A 校最低 4 週(取 min)', () => {
    expect(getSchoolMinWeeks('A', programs)).toBe(4);
  });
  it('B 校最低 12 週', () => {
    expect(getSchoolMinWeeks('B', programs)).toBe(12);
  });
  it('C 校 program 都 null → null', () => {
    expect(getSchoolMinWeeks('C', programs)).toBe(null);
  });
  it('未知校 → null', () => {
    expect(getSchoolMinWeeks('Z', programs)).toBe(null);
  });
});

describe('isWeeksMismatch', () => {
  it('學生未填預計週數 → false', () => {
    expect(isWeeksMismatch(null, 'A', programs)).toBe(false);
  });
  it('學生預計 12 週,A 校 min 4 → false(可行)', () => {
    expect(isWeeksMismatch(12, 'A', programs)).toBe(false);
  });
  it('學生預計 6 週,B 校 min 12 → true(軟提示)', () => {
    expect(isWeeksMismatch(6, 'B', programs)).toBe(true);
  });
  it('C 校無門檻 → false', () => {
    expect(isWeeksMismatch(1, 'C', programs)).toBe(false);
  });
});
