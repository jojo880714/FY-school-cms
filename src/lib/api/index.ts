/**
 * API layer — Supabase queries 集中
 *
 * 統一在這層接 supabase,pages / hooks 不應該直接 import supabase。
 *
 * ## 結構
 *
 * ```
 * src/lib/api/
 * ├── generated-pages.ts  — LP / 學生 case 主資料(list / stats / soft-delete / notes)
 * ├── schools.ts          — schools + campuses
 * ├── school-metadata.ts  — programs / tuition_tiers / housing / city_info(過濾用 metadata)
 * ├── cases.ts            — Phase 20 案件 MVP(等 migration apply 才能跑)
 * └── index.ts            — 本檔
 * ```
 *
 * ## 紅線
 *
 * - 所有 function 失敗 throw Error,呼叫者用 try/catch
 * - 不做業務邏輯 / 過濾(那些放 src/lib/student-filter/)
 * - 不做 UI state 管理(那些放 src/hooks/)
 */

// generated-pages
export {
  listGeneratedPages,
  getGeneratedPagesStats,
  getGeneratedPageBySlug,
  softDeleteGeneratedPage,
  updateConsultationNotes,
  updateStudentInfo,
} from './generated-pages';
export type {
  GeneratedPageRow,
  ListPagesOptions,
  ListPagesResult,
  GeneratedPagesStats,
} from './generated-pages';

// schools
export {
  listSchools,
  listCampuses,
  listSchoolsWithCampuses,
} from './schools';
export type {
  SchoolRow,
  CampusRow,
  SchoolWithCampuses,
} from './schools';

// school metadata
export {
  listPrograms,
  listTuitionTiers,
  listHousing,
  listCityInfo,
  loadStudentFilterMetadata,
} from './school-metadata';
export type {
  ProgramMetadataRow,
  TuitionTierMetadataRow,
  HousingMetadataRow,
  CityInfoMetadataRow,
  StudentFilterMetadata,
} from './school-metadata';

// cases (Phase 20 placeholder)
export {
  findOrCreateCase,
  listCases,
  updateCaseStatus,
} from './cases';
export type { FindOrCreateCaseInput } from './cases';
