/**
 * API — generated_pages 表的查詢 / 寫入
 *
 * 用法:從 hooks 內呼叫,**不要直接在 components 內 inline supabase query**。
 *
 * 所有 function 失敗時 throw Error,呼叫者用 try/catch 接(或交給 hook 包成 error state)。
 */

import { supabase } from '../supabase';

// ─── 型別(覆寫 src/types/index.ts 的 GeneratedPage,加上 Phase 19/20 欄位)───────────

export interface GeneratedPageRow {
  id: string;
  slug: string;
  title: string | null;
  school_ids: string[] | null;
  campus_ids: string[] | null;
  selected_fields: Record<string, boolean>;
  advisor_notes: Record<string, string>;
  html_url: string | null;
  public_url: string | null;
  status: string;
  created_by: string;
  created_at: string;
  updated_at: string | null;
  deleted_at: string | null;
  // Phase 19a/b
  student_name: string | null;
  student_contact: string | null;
  consultation_date: string | null;
  consultation_notes: string | null;
  // Phase 20 預留(實作 phase 才有 case_id)
  case_id?: string | null;
}

export interface ListPagesOptions {
  search?: string;
  page?: number;          // 0-indexed
  pageSize?: number;
  includeDeleted?: boolean;
}

export interface ListPagesResult {
  pages: GeneratedPageRow[];
  total: number;
}

// ─── List + Search + Pagination ───────────────────────────────────────────────

export async function listGeneratedPages(opts: ListPagesOptions = {}): Promise<ListPagesResult> {
  const { search, page = 0, pageSize = 20, includeDeleted = false } = opts;

  let q = supabase
    .from('generated_pages')
    .select('*', { count: 'exact' });

  if (!includeDeleted) {
    q = q.is('deleted_at', null);
  }

  if (search) {
    const term = search.trim();
    if (term) {
      q = q.or(
        `title.ilike.%${term}%,slug.ilike.%${term}%,student_name.ilike.%${term}%,student_contact.ilike.%${term}%`
      );
    }
  }

  const { data, count, error } = await q
    .order('created_at', { ascending: false })
    .range(page * pageSize, page * pageSize + pageSize - 1);

  if (error) throw new Error(`listGeneratedPages 失敗: ${error.message}`);
  return {
    pages: (data ?? []) as GeneratedPageRow[],
    total: count ?? 0,
  };
}

// ─── Stats ────────────────────────────────────────────────────────────────────

export interface GeneratedPagesStats {
  total: number;
  published: number;
  thisMonth: number;
}

export async function getGeneratedPagesStats(): Promise<GeneratedPagesStats> {
  const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();

  const [totalRes, publishedRes, monthRes] = await Promise.all([
    supabase.from('generated_pages').select('id', { count: 'exact', head: true }).is('deleted_at', null),
    supabase.from('generated_pages').select('id', { count: 'exact', head: true }).is('deleted_at', null).eq('status', 'published'),
    supabase.from('generated_pages').select('id', { count: 'exact', head: true }).is('deleted_at', null).gte('created_at', startOfMonth),
  ]);

  for (const r of [totalRes, publishedRes, monthRes]) {
    if (r.error) throw new Error(`getGeneratedPagesStats 失敗: ${r.error.message}`);
  }

  return {
    total: totalRes.count ?? 0,
    published: publishedRes.count ?? 0,
    thisMonth: monthRes.count ?? 0,
  };
}

// ─── Get / Soft delete / Update notes ──────────────────────────────────────────

export async function getGeneratedPageBySlug(slug: string): Promise<GeneratedPageRow | null> {
  const { data, error } = await supabase.from('generated_pages').select('*').eq('slug', slug).single();
  if (error) {
    if (error.code === 'PGRST116') return null; // no rows
    throw new Error(`getGeneratedPageBySlug 失敗: ${error.message}`);
  }
  return data as GeneratedPageRow;
}

export async function softDeleteGeneratedPage(id: string): Promise<void> {
  const { error } = await supabase
    .from('generated_pages')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(`softDeleteGeneratedPage 失敗: ${error.message}`);
}

export async function updateConsultationNotes(slug: string, notes: string | null): Promise<void> {
  const { error } = await supabase
    .from('generated_pages')
    .update({ consultation_notes: notes || null })
    .eq('slug', slug);
  if (error) throw new Error(`updateConsultationNotes 失敗: ${error.message}`);
}

export async function updateStudentInfo(slug: string, info: { student_name?: string | null; student_contact?: string | null }): Promise<void> {
  const { error } = await supabase
    .from('generated_pages')
    .update({
      student_name: info.student_name ?? null,
      student_contact: info.student_contact ?? null,
    })
    .eq('slug', slug);
  if (error) throw new Error(`updateStudentInfo 失敗: ${error.message}`);
}
