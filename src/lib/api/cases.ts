/**
 * API — cases 表(Phase 20 新)
 *
 * **狀態**:cases 表在 `supabase/migrations-drafts/_DRAFT_cases.sql`,
 * 尚未 apply 到 DB。本檔的 query 等 migration 套用後才能跑。
 *
 * 設計輕量,等 CRM 接管後遷移到 CRM。預留 `crm_case_id` 給將來指向。
 */

import { supabase } from '../supabase';
import type { Case, CaseStatus } from '../../types/phase20';

export interface FindOrCreateCaseInput {
  student_name: string;
  student_contact?: string | null;
  advisor_id: string;
}

/**
 * Dedup 找案件:同 advisor + 同學生名 + 同聯絡 → 視為同案件
 * 找不到就建一個(隱性建立,wizard step 1 用)。
 */
export async function findOrCreateCase(input: FindOrCreateCaseInput): Promise<Case> {
  const { student_name, student_contact, advisor_id } = input;

  // 找既有
  let q = supabase
    .from('cases')
    .select('*')
    .eq('advisor_id', advisor_id)
    .eq('student_name', student_name)
    .is('deleted_at', null);

  if (student_contact) {
    q = q.eq('student_contact', student_contact);
  } else {
    q = q.is('student_contact', null);
  }

  const { data: existing, error: findErr } = await q.maybeSingle();
  if (findErr && findErr.code !== 'PGRST116') {
    throw new Error(`findCase 失敗: ${findErr.message}`);
  }
  if (existing) return existing as Case;

  // 建立新的
  const { data: created, error: createErr } = await supabase
    .from('cases')
    .insert({
      student_name,
      student_contact: student_contact ?? null,
      advisor_id,
      status: 'in_consult' satisfies CaseStatus,
    })
    .select()
    .single();
  if (createErr) throw new Error(`createCase 失敗: ${createErr.message}`);
  return created as Case;
}

export async function listCases(opts: { advisorId?: string; statuses?: CaseStatus[] } = {}): Promise<Case[]> {
  let q = supabase.from('cases').select('*').is('deleted_at', null);
  if (opts.advisorId) q = q.eq('advisor_id', opts.advisorId);
  if (opts.statuses && opts.statuses.length) q = q.in('status', opts.statuses);
  const { data, error } = await q.order('updated_at', { ascending: false });
  if (error) throw new Error(`listCases 失敗: ${error.message}`);
  return (data ?? []) as Case[];
}

export async function updateCaseStatus(id: string, status: CaseStatus): Promise<void> {
  const { error } = await supabase
    .from('cases')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(`updateCaseStatus 失敗: ${error.message}`);
}
