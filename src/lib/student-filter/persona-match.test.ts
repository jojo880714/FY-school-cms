import { describe, it, expect } from 'vitest';
import { getPersonaMatchScore, isPersonaMatched } from './persona-match';

describe('getPersonaMatchScore', () => {
  it('學生未選 → score 0', () => {
    expect(getPersonaMatchScore([], ['exam_prep'])).toBe(0);
    expect(getPersonaMatchScore(null, ['exam_prep'])).toBe(0);
  });

  it('學校無 persona_match → score 0', () => {
    expect(getPersonaMatchScore(['exam_prep'], [])).toBe(0);
    expect(getPersonaMatchScore(['exam_prep'], null)).toBe(0);
  });

  it('學生只選 passthrough → score 0(濾掉後集合為空)', () => {
    expect(getPersonaMatchScore(['lang_school'], ['exam_prep'])).toBe(0);
    expect(getPersonaMatchScore(['undecided', 'short_tour'], ['exam_prep'])).toBe(0);
  });

  it('學生 lang_school + exam_prep:exam_prep 仍計分(不被連坐)', () => {
    expect(getPersonaMatchScore(['lang_school', 'exam_prep'], ['exam_prep'])).toBe(1);
  });

  it('多個交集 → score 等於交集數', () => {
    expect(
      getPersonaMatchScore(
        ['exam_prep', 'pathway_uni', 'career_change'],
        ['exam_prep', 'pathway_uni', 'gap_year']
      )
    ).toBe(2);
  });

  it('全 4 個 passthrough → score 0', () => {
    expect(
      getPersonaMatchScore(
        ['lang_school', 'short_tour', 'custom_tour', 'undecided'],
        ['exam_prep', 'pathway_uni']
      )
    ).toBe(0);
  });

  it('pr_immigration 不在 passthrough,正常計分(對齊 7 個有效 tag)', () => {
    expect(getPersonaMatchScore(['pr_immigration'], ['pr_immigration'])).toBe(1);
  });
});

describe('isPersonaMatched', () => {
  it('score > 0 → true', () => {
    expect(isPersonaMatched(['exam_prep'], ['exam_prep'])).toBe(true);
  });
  it('score 0 → false', () => {
    expect(isPersonaMatched(['exam_prep'], ['gap_year'])).toBe(false);
  });
});
