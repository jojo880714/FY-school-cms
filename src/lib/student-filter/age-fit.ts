/**
 * Age fit — 學生年齡 vs 學校最低收生年齡(min_age)
 *
 * 從 CreatePage.tsx 抽出,改為 pure function。
 *
 * Phase 17a 規則:
 * - 學生年齡未填 → 不過濾(視為符合)
 * - 學校 min_age 未填 → 不限制
 * - 學生年齡 < school.min_age → 不符合(blocking,wizard 中該校禁選)
 */

/** 是否年齡卡關(true = 不符合,blocking)*/
export function isAgeBlocked(studentAge: number | null, schoolMinAge: number | null): boolean {
  if (studentAge === null) return false;
  if (schoolMinAge === null) return false;
  return studentAge < schoolMinAge;
}

/** 是否年齡符合(true = OK)*/
export function isAgeFit(studentAge: number | null, schoolMinAge: number | null): boolean {
  return !isAgeBlocked(studentAge, schoolMinAge);
}
