/**
 * 🛑 PHASE 20 ENTITY TYPES — PLACEHOLDER,凍住擴張(2026-06-18 校正)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * 這些 type 是 CMS 視角先猜的 placeholder。
 *
 * Phase 20 真實範圍是「三系統合併」(CMS + 報價系統 + TKB 廠商系統 → Nexus 為 SSOT),
 * `Vendor` / `Case` / `LPSchoolConfig` / `Quotation` 的 SSOT 在 **Nexus**,不是 CMS。
 *
 * 三系統 master plan + Nexus / 報價 / TKB schema 對齊版尚未落地,所以:
 *
 *   ❌ 不擴張本檔(不加新 type / 不加欄位)
 *   ❌ 不展開到 components / pages(用了,schema 對齊時會全跟著改)
 *   ❌ 不 apply `supabase/migrations-drafts/` 內 cases / lp_school_config / quotations
 *   ✅ 可被 `src/lib/*` 內 pure modules 暫時引用(只當型別參考,不會炸)
 *
 * **解凍條件**:
 *   1. 三系統 master plan(phase / 時程 / owner / 整合順序)落地
 *   2. Nexus / 報價 / TKB schema 對齊版定稿
 *
 * 詳細政策見 `PROJECT_STATUS.md`「🛑 Phase 20 entity 凍住」區塊。
 *
 * ════════════════════════════════════════════════════════════════════════════
 *
 * (原本檔頭)
 * Phase 20 — 顧問完整工作流新增型別。對應 `supabase/migrations-drafts/_DRAFT_*.sql`。
 *
 * 紅線:
 * - 案件由 CRM 之後接管,所以 Case 結構刻意輕量,預留 `crm_case_id`
 * - 報價邏輯不能變(從 app.js port,見 src/lib/quotation/)
 */

import type { Vendor as QuotationVendor, QuotationResult, QuotationInput } from '../lib/quotation/types';

// ─── 廠商(Phase 20 新)─────────────────────────────────────

export interface Vendor {
  id: string;
  slug: QuotationVendor;            // 'EP' | 'ILSC' | 'EC' | 'Kaplan' | 'SGIC'
  name_zh: string;
  name_en: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// ─── 案件 MVP(等 CRM 接管)──────────────────────────────

export type CaseStatus =
  | 'in_consult'    // 諮詢中
  | 'lp_done'       // LP 完成
  | 'quote_done'    // 已開報價
  | 'signed'        // 已收單
  | 'abandoned';    // 已放棄

export interface Case {
  id: string;
  student_name: string;
  student_contact: string | null;
  consultation_date: string;

  status: CaseStatus;

  advisor_id: string | null;        // auth.users.id

  /** CRM 接管預留 — 等 CRM 上線時指向 CRM 對應案件 */
  crm_case_id: string | null;

  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  notes: string | null;
}

// ─── LP 內每校方案配置(諮詢模式 ⭐ 痛點解)─────────────────

export type StudentReaction =
  | 'first_choice'  // ⭐ 第一推薦
  | 'interested'    // ✓ 有興趣
  | 'neutral'       // ◌ 中立
  | 'rejected';     // ✗ 不喜歡

export interface ExtraFeeItem {
  name: string;
  price: number;
  currency: string;
}

export interface SchoolDiscountConfig {
  type: string;
  pct: number;
  fixed: number;
  schoolDiscount: {
    label: string;
    pct: number;
    fixed: number;
  } | null;
}

export interface LPSchoolConfig {
  id: string;

  lp_id: string;                    // FK generated_pages
  school_id: string;                // FK schools

  // 顧問 demo 中選的方案
  program_id: string | null;
  weeks: number | null;
  start_date: string | null;
  housing_id: string | null;
  extras: ExtraFeeItem[];

  discount: SchoolDiscountConfig;

  // 學生反應(諮詢現場顧問點)
  reaction: StudentReaction | null;

  // 即時備注
  advisor_note: string | null;

  // 即時試算 snapshot
  estimated_total_twd: number | null;
  estimated_currency: string | null;
  estimated_original: number | null;

  // 排序
  position: number;

  created_at: string;
  updated_at: string;
}

// ─── 報價單(從 LP 一鍵帶資料 → 出 PDF)──────────────────────

export type QuotationStatus =
  | 'draft'      // 草稿
  | 'sent'       // 已寄出
  | 'accepted'   // 學生接受
  | 'rejected'   // 學生拒絕
  | 'expired';   // 過期

export interface Quotation {
  id: string;

  quote_number: string | null;     // e.g. 'Q20260618-0001'

  case_id: string | null;
  lp_id: string | null;
  school_id: string | null;

  /** 完整 QuotationInput snapshot,送進 calculate() 的輸入 */
  payload: QuotationInput;

  /** 計算結果 snapshot,calculate() 的輸出(鎖價用)*/
  result: QuotationResult;

  // 從 result 抽出方便 index
  final_twd: number;
  currency_primary: string;
  weeks: number;
  start_date: string | null;

  status: QuotationStatus;
  valid_until: string | null;

  created_by: string | null;
  created_at: string;
  updated_at: string;
  sent_at: string | null;

  pdf_url: string | null;
  notes: string | null;
}

// ─── Re-export 報價引擎相關型別(方便 import)─────────────────

export type {
  Currency,
  PricingUnit,
  PricingTier,
  Course,
  Accommodation,
  Fee,
  CampusData,
  SchoolDataMap,
  Discount,
  SchoolDiscount,
  AdminSettings,
  QuotationInput,
  QuotationItem,
  DiscountLine,
  QuotationResult,
} from '../lib/quotation/types';
