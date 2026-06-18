/**
 * Hooks layer — 公開入口
 *
 * 所有 hooks 用 api/(`src/lib/api/`)做 data fetch,
 * 包成 React state(loading / error / data)。
 *
 * Pages / wizards 用 hooks,**不直接 call api**(api 的錯誤處理在 hook 內)。
 */

export { useAuth } from './useAuth';
export { useGeneratedPages } from './useGeneratedPages';
export type { UseGeneratedPagesOptions, UseGeneratedPagesResult } from './useGeneratedPages';

export { useSchoolsWithCampuses } from './useSchoolsWithCampuses';
export type { UseSchoolsWithCampusesResult } from './useSchoolsWithCampuses';

export { useStudentFilterMetadata } from './useStudentFilterMetadata';
export type { UseStudentFilterMetadataResult } from './useStudentFilterMetadata';
