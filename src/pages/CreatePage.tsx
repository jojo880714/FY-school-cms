import { useEffect, useState, useCallback } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { ALL_FIELD_KEYS, FIELD_GROUPS } from '../types';

interface School {
  id: string;
  name: string;
  full_name: string;
  founded: number | null;
  english_only_policy: boolean;
  accreditation: string[] | null;
  min_age: number | null;  // Phase 17a
}
interface Campus {
  id: string;
  school_id: string;
  city: string;
  metro_station: string | null;
  walk_minutes: number | null;
}
interface CampusWithSchool extends Campus {
  school: School;
}
// Phase 17c
interface TuitionTier {
  id: string;
  program_id: string;
  campus_id: string;
  weeks_min: number;
  weeks_max: number | null;
  price_per_week: number;
  currency: string;
}

// Phase 17d — 英語程度過濾用
interface Program {
  id: string;
  school_id: string;
  entry_level: string | null;
  min_weeks: number | null;  // Phase 17f
}

// CEFR 數字化:A1=1 A2=2 B1=3 B2=4 C1=5 C2=6
const CEFR_SCORE: Record<string, number> = {
  A1: 1, A2: 2, B1: 3, B2: 4, C1: 5, C2: 6,
};
function toeicToCefr(score: number): string {
  if (score >= 945) return 'C2';
  if (score >= 785) return 'C1';
  if (score >= 550) return 'B2';
  if (score >= 385) return 'B1';
  if (score >= 225) return 'A2';
  return 'A1';
}
function ieltsToCefr(score: number): string {
  if (score >= 8.0) return 'C2';
  if (score >= 6.5) return 'C1';
  if (score >= 5.5) return 'B2';
  if (score >= 4.0) return 'B1';
  if (score >= 3.0) return 'A2';
  return 'A1';
}
function toeflToCefr(score: number): string {
  if (score >= 110) return 'C2';
  if (score >= 94)  return 'C1';
  if (score >= 72)  return 'B2';
  if (score >= 42)  return 'B1';
  if (score >= 20)  return 'A2';
  return 'A1';
}
function getStudentCefr(examType: string, score: number): string | null {
  if (examType === 'toeic') return toeicToCefr(score);
  if (examType === 'ielts') return ieltsToCefr(score);
  if (examType === 'toefl') return toeflToCefr(score);
  if (examType === 'none_basic') return 'A2';
  if (examType === 'none_beginner') return 'A1';
  return null;
}

const DRAFT_KEY = 'cms_draft';
const MAX = 5;

// Phase 17e — 出發目的 tag(對齊轉介表諮詢項目)
const PURPOSE_TAGS = [
  { id: 'lang_school',     label: '語言進修(語校)' },
  { id: 'exam_prep',       label: '考試衝刺(多益/雅思/托福)' },
  { id: 'working_holiday', label: '打工度假' },
  { id: 'pathway_uni',     label: '銜接升大學' },
  { id: 'pathway_grad',    label: '銜接升研究所' },
  { id: 'career_change',   label: '職涯轉換/充電' },
  { id: 'short_tour',      label: '遊學團(套裝行程)' },
  { id: 'custom_tour',     label: '客製化遊學' },
  { id: 'pr_immigration',  label: '移民/PR 規劃' },
  { id: 'undecided',       label: '尚未確定方向' },
] as const;

function CampusCard({
  campus,
  selected,
  onToggle,
  disabled,
  ageBlocked,
  minAge,
  overBudget,
  minPrice,
  priceCurrency,
  levelTooHigh,
  minEntryLevel,
  weeksMismatch,
  minWeeks,
}: {
  campus: CampusWithSchool;
  selected: boolean;
  onToggle: (campus: CampusWithSchool) => void;
  disabled: boolean;
  ageBlocked?: boolean;
  minAge?: number | null;
  overBudget?: boolean;
  minPrice?: number | null;
  priceCurrency?: string;
  levelTooHigh?: boolean;
  minEntryLevel?: string | null;
  weeksMismatch?: boolean;
  minWeeks?: number | null;
}) {
  return (
    <div
      onClick={() => !disabled || selected ? onToggle(campus) : null}
      style={{
        border: selected ? '2px solid #E8195A' : '1px solid #EAE5DD',
        background: selected ? '#FCE8EE' : (disabled || ageBlocked) ? '#FAF7F2' : 'white',
        cursor: (disabled || ageBlocked) && !selected ? 'not-allowed' : 'pointer',
        opacity: (disabled || ageBlocked) && !selected ? 0.45 : 1,
        borderRadius: 12,
        padding: '16px',
        transition: 'all 0.15s',
      }}
    >
      <div style={{ fontWeight: 700, fontSize: 16, color: '#2C2C2A', marginBottom: 4 }}>
        {campus.school.name}
      </div>
      <div style={{ fontSize: 13, color: '#6B6B6B', marginBottom: 8 }}>
        {campus.city}
      </div>
      {ageBlocked && minAge && (
        <span style={{
          display: 'inline-block',
          fontSize: '11px',
          color: '#B91C1C',
          background: '#FEE2E2',
          borderRadius: '4px',
          padding: '2px 6px',
          marginBottom: 8,
        }}>
          需滿 {minAge} 歲
        </span>
      )}
      {overBudget && minPrice !== null && minPrice !== undefined && (
        <span style={{
          display: 'inline-block',
          fontSize: '11px',
          color: '#92400E',
          background: '#FEF3C7',
          borderRadius: '4px',
          padding: '2px 6px',
          marginTop: '4px',
          marginBottom: 8,
          marginLeft: ageBlocked ? '6px' : 0,
        }}>
          最低 ${minPrice.toLocaleString()}{priceCurrency ? ` ${priceCurrency}` : ''}/週
        </span>
      )}
      {levelTooHigh && minEntryLevel && (
        <span style={{
          display: 'inline-block',
          fontSize: '11px',
          color: '#92400E',
          background: '#FEF3C7',
          borderRadius: '4px',
          padding: '2px 6px',
          marginTop: '4px',
          marginBottom: 8,
          marginLeft: (ageBlocked || overBudget) ? '6px' : 0,
        }}>
          建議 {minEntryLevel} 以上
        </span>
      )}
      {weeksMismatch && minWeeks && (
        <span style={{
          display: 'inline-block',
          fontSize: '11px',
          color: '#92400E',
          background: '#FEF3C7',
          borderRadius: '4px',
          padding: '2px 6px',
          marginTop: '4px',
          marginBottom: 8,
          marginLeft: (ageBlocked || overBudget || levelTooHigh) ? '6px' : 0,
        }}>
          最短 {minWeeks} 週起
        </span>
      )}
      {campus.metro_station && (
        <div style={{ fontSize: 12, color: '#9ca3af' }}>
          📍 {campus.metro_station}
          {campus.walk_minutes ? `（步行 ${campus.walk_minutes} 分鐘）` : ''}
        </div>
      )}
      <div
        style={{
          marginTop: 10,
          border: selected ? 'none' : '1.5px solid #d1d5db',
          background: selected ? '#E8195A' : 'transparent',
          color: selected ? 'white' : '#6B6B6B',
          borderRadius: 6,
          padding: '4px 10px',
          fontSize: 12,
          display: 'inline-block',
        }}
      >
        {selected ? '✓ 已選' : '+ 選擇'}
      </div>
    </div>
  );
}

function FieldSelector({
  selected,
  onChange,
}: {
  selected: Record<string, boolean>;
  onChange: (key: string, val: boolean) => void;
}) {
  const [open, setOpen] = useState<Record<string, boolean>>({
    費用資訊: true,
    城市與校區: true,
    課程資訊: false,
    學校特色: false,
  });
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      {FIELD_GROUPS.map((group) => {
        const keys = group.fields.map((f) => f.key);
        const allChecked = keys.every((k) => selected[k]);
        const someChecked = keys.some((k) => selected[k]);
        return (
          <div
            key={group.label}
            style={{
              border: '1px solid #EAE5DD',
              borderRadius: '10px',
              overflow: 'hidden',
            }}
          >
            <button
              onClick={() =>
                setOpen((prev) => ({
                  ...prev,
                  [group.label]: !prev[group.label],
                }))
              }
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 14px',
                background: '#FAF7F2',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={allChecked}
                ref={(el) => {
                  if (el) el.indeterminate = !allChecked && someChecked;
                }}
                onChange={(e) => {
                  e.stopPropagation();
                  keys.forEach((k) => onChange(k, e.target.checked));
                }}
                onClick={(e) => e.stopPropagation()}
                style={{ accentColor: '#E8195A' }}
              />
              <span style={{ fontSize: '13px', fontWeight: '500', flex: 1 }}>
                {group.label}
              </span>
              <span style={{ fontSize: '11px', color: '#9ca3af' }}>
                {keys.filter((k) => selected[k]).length}/{keys.length}
              </span>
              <span style={{ color: '#9ca3af', fontSize: '12px' }}>
                {open[group.label] ? '▲' : '▼'}
              </span>
            </button>
            {open[group.label] && (
              <div
                style={{
                  padding: '10px 14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  background: 'white',
                }}
              >
                {group.fields.map((field) => (
                  <label
                    key={field.key}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      cursor: 'pointer',
                      fontSize: '13px',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={!!selected[field.key]}
                      onChange={(e) => onChange(field.key, e.target.checked)}
                      style={{ accentColor: '#E8195A' }}
                    />
                    {field.label}
                  </label>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function AdvisorNotes({
  schools,
  notes,
  onChange,
}: {
  schools: CampusWithSchool[];
  notes: Record<string, string>;
  onChange: (id: string, note: string) => void;
}) {
  if (schools.length === 0) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {schools.map((campus) => {
        const note = notes[campus.id] || '';
        return (
          <div key={campus.id}>
            <label
              style={{
                display: 'block',
                fontSize: '12px',
                fontWeight: '500',
                marginBottom: '6px',
              }}
            >
              對 <span style={{ color: '#2C2C2A' }}>{campus.school.name} {campus.city}</span> 的備注{' '}
              <span style={{ color: '#9ca3af', fontWeight: '400' }}>
                （顯示在頁面上）
              </span>
            </label>
            <div style={{ position: 'relative' }}>
              <textarea
                value={note}
                onChange={(e) =>
                  onChange(campus.id, e.target.value.slice(0, 300))
                }
                rows={3}
                placeholder={`例如：${campus.school.name} ${campus.city} 特別適合想快速進步的學生...`}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: '8px',
                  border: '1px solid #EAE5DD',
                  fontSize: '13px',
                  outline: 'none',
                  resize: 'none',
                  boxSizing: 'border-box',
                  fontFamily: 'inherit',
                }}
              />
              <span
                style={{
                  position: 'absolute',
                  bottom: '8px',
                  right: '10px',
                  fontSize: '11px',
                  color: '#d1d5db',
                }}
              >
                {note.length}/300
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function CreatePage() {
  const navigate = useNavigate();
  const [allCampuses, setAllCampuses] = useState<CampusWithSchool[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<CampusWithSchool[]>([]);
  const [fields, setFields] = useState<Record<string, boolean>>(
    Object.fromEntries(ALL_FIELD_KEYS.map((k) => [k, true]))
  );
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [title, setTitle] = useState('');
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<{ url: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  // Phase 17a — 學生年齡 profile(session-only,不存 DB)
  const [studentAge, setStudentAge] = useState<number | null>(null);
  // Phase 17c — 預算 profile (軟提示,session-only)
  const [weeklyBudget, setWeeklyBudget] = useState<number | null>(null);
  const [budgetCurrency, setBudgetCurrency] = useState<string>('CAD');
  const [allTuitionTiers, setAllTuitionTiers] = useState<TuitionTier[]>([]);
  // Phase 17d — 英語程度 profile
  const [examType, setExamType] = useState<string>('');
  const [examScore, setExamScore] = useState<number | null>(null);
  const [allPrograms, setAllPrograms] = useState<Program[]>([]);
  // Phase 17e — 出發目的(多選)
  const [selectedPurposes, setSelectedPurposes] = useState<string[]>([]);
  // Phase 17f — 預計週數
  const [maxWeeks, setMaxWeeks] = useState<number | null>(null);
  // Q3 opt-in — 是否將學生條件加入公開頁
  const [includeProfileInPage, setIncludeProfileInPage] = useState<boolean>(false);
  const [searchParams] = useSearchParams();
  const editSlug = searchParams.get('slug');
  const [loadingEdit, setLoadingEdit] = useState(!!editSlug);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data: schools } = await supabase
        .from('schools')
        .select('*')
        .order('name');
      const { data: campuses } = await supabase.from('campuses').select('*');
      if (schools && campuses) {
        const schoolMap = Object.fromEntries(schools.map((s) => [s.id, s]));
        setAllCampuses(
          campuses.map((c) => ({
            ...c,
            school: schoolMap[c.school_id],
          }))
        );
      }
      // Phase 17c — 載入所有 tuition_tiers 給預算過濾用
      const { data: tiers } = await supabase.from('tuition_tiers').select('*');
      if (tiers) setAllTuitionTiers(tiers as TuitionTier[]);
      // Phase 17d — 載入所有 programs 給英語程度過濾用
      const { data: programs } = await supabase.from('programs').select('id, school_id, entry_level, min_weeks');
      if (programs) setAllPrograms(programs as Program[]);
      setLoading(false);
    }
    load();
  }, []);

  useEffect(() => {
    if (editSlug) return; // 編輯模式不載入 localStorage 草稿
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return;
    try {
      const d = JSON.parse(raw);
      if (d.fields) setFields(d.fields);
      if (d.notes) setNotes(d.notes);
      if (d.title) setTitle(d.title);
    } catch {}
  }, [editSlug]);

  useEffect(() => {
    if (editSlug) return; // 編輯模式不載入 localStorage 草稿
    if (allCampuses.length === 0) return;
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return;
    try {
      const draft = JSON.parse(raw);
      if (draft.selectedIds) {
        setSelected(
          draft.selectedIds
            .map((id: string) => allCampuses.find((c) => c.id === id))
            .filter(Boolean) as CampusWithSchool[]
        );
      }
    } catch {
      // ignore
    }
  }, [allCampuses, editSlug]);

  // 編輯模式:從 DB 載入該頁原始資料,預填表單
  useEffect(() => {
    if (!editSlug || allCampuses.length === 0) return;
    async function loadEdit() {
      const { data: page } = await supabase
        .from('generated_pages')
        .select('*')
        .eq('slug', editSlug)
        .maybeSingle();
      if (!page) {
        alert(`找不到 slug=${editSlug} 的頁面，回到 Dashboard`);
        navigate('/dashboard');
        return;
      }
      if (page.title) setTitle(page.title);
      if (page.selected_fields) setFields(page.selected_fields);
      if (page.advisor_notes) setNotes(page.advisor_notes);
      if (page.campus_ids && Array.isArray(page.campus_ids)) {
        const idSet = new Set<string>(page.campus_ids);
        setSelected(allCampuses.filter((c) => idSet.has(c.id)));
      }
      setLoadingEdit(false);
    }
    loadEdit();
  }, [editSlug, allCampuses, navigate]);

  const saveDraft = useCallback(() => {
    if (editSlug) return; // 編輯模式不存草稿
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({ selectedIds: selected.map((c) => c.id), fields, notes, title })
    );
    setSavedAt(new Date());
  }, [selected, fields, notes, title, editSlug]);

  useEffect(() => {
    const t = setInterval(saveDraft, 30000);
    return () => clearInterval(t);
  }, [saveDraft]);

  // Phase 17c helpers — 預算過濾(軟提示)
  function getCampusMinPrice(campusId: string, currency: string): number | null {
    const tiers = allTuitionTiers.filter(
      (t) => t.campus_id === campusId && t.currency === currency
    );
    if (tiers.length === 0) return null;
    return Math.min(...tiers.map((t) => t.price_per_week));
  }
  function isCampusOverBudget(campusId: string): boolean {
    if (weeklyBudget === null) return false;
    const minPrice = getCampusMinPrice(campusId, budgetCurrency);
    if (minPrice === null) return false; // 沒有對應 currency 的資料,不標示
    return minPrice > weeklyBudget;
  }

  // Phase 17d — 英語程度過濾(軟提示)
  function isCampusLevelTooHigh(_campusId: string, schoolId: string): boolean {
    if (!examType) return false;
    // 非 none_* 模式需要有 examScore
    if (!examType.startsWith('none') && examScore === null) return false;
    const studentCefr = getStudentCefr(examType, examScore ?? 0);
    if (!studentCefr) return false;
    const programs = allPrograms.filter((p) => p.school_id === schoolId);
    if (programs.length === 0) return false;
    // 只要有任一課程門檻 ≤ 學生等級,就不標示
    return !programs.some((p) => {
      if (!p.entry_level) return true; // 沒填門檻 → 開放所有人
      return (CEFR_SCORE[p.entry_level] ?? 0) <= CEFR_SCORE[studentCefr];
    });
  }
  function getCampusMinEntryLevel(schoolId: string): string | null {
    const programs = allPrograms.filter((p) => p.school_id === schoolId);
    if (programs.length === 0) return null;
    const levels = programs.map((p) => p.entry_level).filter(Boolean) as string[];
    if (levels.length === 0) return null;
    const scores = levels.map((l) => CEFR_SCORE[l] ?? 0);
    const minScore = Math.min(...scores);
    return Object.keys(CEFR_SCORE).find((k) => CEFR_SCORE[k] === minScore) ?? null;
  }

  // Phase 17e — toggle purpose tag
  function togglePurpose(id: string) {
    setSelectedPurposes((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  }

  // Phase 17f — 預計週數過濾(軟提示)
  function isCampusWeeksMismatch(schoolId: string): boolean {
    if (maxWeeks === null) return false;
    const programs = allPrograms.filter((p) => p.school_id === schoolId);
    if (programs.length === 0) return false;
    // 只要有任一課程 min_weeks ≤ 學生可用週數,就不標示
    return !programs.some((p) => {
      if (p.min_weeks === null) return true; // 沒填 min_weeks → 不限制
      return p.min_weeks <= maxWeeks;
    });
  }
  function getCampusMinWeeks(schoolId: string): number | null {
    const programs = allPrograms.filter((p) => p.school_id === schoolId);
    const weeks = programs.map((p) => p.min_weeks).filter((w): w is number => w !== null);
    if (weeks.length === 0) return null;
    return Math.min(...weeks);
  }

  function toggleCampus(campus: CampusWithSchool) {
    // Phase 17a:年齡不符直接擋住(已選的可取消,新選的要符合年齡門檻)
    const isAlreadySelected = selected.some((c) => c.id === campus.id);
    if (
      !isAlreadySelected &&
      studentAge !== null &&
      campus.school.min_age !== null &&
      studentAge < campus.school.min_age
    ) return;
    setSelected((prev) =>
      prev.find((c) => c.id === campus.id)
        ? prev.filter((c) => c.id !== campus.id)
        : prev.length >= MAX
        ? prev
        : [...prev, campus]
    );
  }

  async function handleGenerate() {
    if (selected.length === 0) return;
    setGenerating(true);
    let draftCreatedSlug: string | null = null;
    try {
      const { data: programData } = await supabase.from('programs').select('*');
      const { data: tuitionData } = await supabase
        .from('tuition_tiers')
        .select('*');
      const { data: housingData } = await supabase.from('housing').select('*');
      const { data: cityData } = await supabase.from('city_info').select('*');

      const schoolsInfo = selected.map((campus) => ({
        school: campus.school,
        campuses: [campus],
        programs: (programData || []).filter((p) => p.school_id === campus.school_id),
        tiers: (tuitionData || []).filter((t) =>
          (programData || [])
            .filter((p) => p.school_id === campus.school_id)
            .some((p) => p.id === t.program_id)
        ),
        housing: (housingData || []).filter((h) => h.school_id === campus.school_id),
        note: notes[campus.id] || '',
        cityInfo: (cityData || []).filter((ci) => ci.city === campus.city),
      }));

      // 編輯模式:沿用既有 slug;建立模式:生新 slug
      // 隨機後綴:6 碼 base36（約 2B 組合，雙 Math.random 串接避免短字串）
      const slug =
        editSlug ||
        `${selected.map((c) => `${c.school.name.toLowerCase()}-${c.city.toLowerCase()}`).join('-')}-${(Math.random().toString(36) + Math.random().toString(36)).slice(2, 8)}`;
      const pageTitle = title || selected.map((c) => `${c.school.name} ${c.city}`).join(' vs ') + ' 比較 2026';
      const selectedFieldLabels = Object.entries(fields)
        .filter(([, v]) => v)
        .map(([k]) => k);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        alert('登入狀態異常，請重新登入');
        return;
      }

      if (editSlug) {
        // 編輯模式:UPDATE 既有 row,保留 created_by/status,推進 updated_at
        const { error: updErr } = await supabase
          .from('generated_pages')
          .update({
            title: pageTitle,
            school_ids: selected.map((c) => c.school_id),
            campus_ids: selected.map((c) => c.id),
            selected_fields: fields,
            advisor_notes: notes,
            updated_at: new Date().toISOString(),
          })
          .eq('slug', editSlug);
        if (updErr) throw updErr;
        // 編輯模式不追蹤 draft（既有頁本來就 published）
      } else {
        // 建立模式:INSERT,status=draft,Edge Function 後續 update 成 published
        // 用 INSERT 而非 UPSERT,讓 slug 碰撞時拋明確錯誤(23505)而非靜默覆蓋
        const { error: insertErr } = await supabase
          .from('generated_pages')
          .insert({
            slug,
            title: pageTitle,
            school_ids: selected.map((c) => c.school_id),
            campus_ids: selected.map((c) => c.id),
            selected_fields: fields,
            advisor_notes: notes,
            status: 'draft',
            created_by: user.id,
          });
        if (insertErr) {
          if (insertErr.code === '23505') {
            throw new Error('slug 碰撞（極罕見），請重新嘗試');
          }
          throw insertErr;
        }
        draftCreatedSlug = slug;
      }

      const { data: result, error: fnError } = await supabase.functions.invoke(
        'generate-page',
        {
          body: {
            schoolsInfo,
            selectedFields: selectedFieldLabels,
            title: pageTitle,
            slug,
            studentProfile: includeProfileInPage ? {
              age: studentAge,
              budgetWeekly: weeklyBudget,
              budgetCurrency: budgetCurrency || null,
              examType: examType || null,
              examScore: examScore,
              examCefr: examType ? getStudentCefr(examType, examScore ?? 0) : null,
              selectedPurposes: selectedPurposes,
              maxWeeks: maxWeeks,
            } : null,
          },
        }
      );
      if (fnError) throw fnError;
      if (!result.success) throw new Error(result.error);

      setResult({ url: result.url });
      if (!editSlug) localStorage.removeItem(DRAFT_KEY);
    } catch (err) {
      if (draftCreatedSlug) {
        try {
          await supabase
            .from('generated_pages')
            .delete()
            .eq('slug', draftCreatedSlug)
            .eq('status', 'draft');
        } catch (cleanupErr) {
          console.warn('清理 draft 失敗（不影響主要錯誤回報）:', cleanupErr);
        }
      }
      console.error(err);
      alert((editSlug ? '更新失敗：' : '產生失敗：') + String(err));
    } finally {
      setGenerating(false);
    }
  }

  if (result)
    return (
      <div
        style={{
          minHeight: '100vh',
          background: '#FAF7F2',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div
          style={{ textAlign: 'center', maxWidth: '400px', padding: '24px' }}
        >
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>✅</div>
          <h2 style={{ fontSize: '20px', marginBottom: '8px' }}>
            {editSlug ? '頁面更新完成！' : '頁面產生完成！'}
          </h2>
          <p
            style={{ fontSize: '14px', color: '#6B6B6B', marginBottom: '20px' }}
          >
            可以直接複製連結傳給學生
          </p>
          <div
            style={{
              background: '#f3f4f6',
              borderRadius: '10px',
              padding: '12px 16px',
              marginBottom: '16px',
              wordBreak: 'break-all',
              fontSize: '13px',
              color: '#E8195A',
              textAlign: 'left',
            }}
          >
            {result.url}
          </div>
          <div
            style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}
          >
            <button
              onClick={() => {
                navigator.clipboard.writeText(result.url);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
              style={{
                padding: '10px 20px',
                borderRadius: '10px',
                border: '1px solid #EAE5DD',
                background: 'white',
                fontSize: '14px',
                cursor: 'pointer',
              }}
            >
              {copied ? '已複製！' : '複製連結'}
            </button>
            <button
              onClick={() => navigate('/dashboard')}
              style={{
                padding: '10px 20px',
                borderRadius: '10px',
                border: 'none',
                background: '#E8195A',
                color: 'white',
                fontSize: '14px',
                cursor: 'pointer',
              }}
            >
              回首頁
            </button>
          </div>
        </div>
      </div>
    );

  return (
    <div style={{ minHeight: '100vh', background: '#FAF7F2' }}>
      <header
        style={{
          background: 'white',
          borderBottom: '1px solid #EAE5DD',
          padding: '0 20px',
          height: '52px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          position: 'sticky',
          top: 0,
          zIndex: 10,
        }}
      >
        <Link
          to="/dashboard"
          style={{ fontSize: '13px', color: '#6B6B6B', textDecoration: 'none' }}
        >
          ← 返回
        </Link>
        <span style={{ fontSize: '14px', fontWeight: '500' }}>
          {editSlug ? '編輯比較頁面' : '建立比較頁面'}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {!editSlug && savedAt && (
            <span style={{ fontSize: '11px', color: '#9ca3af' }}>
              已儲存{' '}
              {savedAt.toLocaleTimeString('zh-TW', {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          )}
          {!editSlug && (
            <button
              onClick={saveDraft}
              style={{
                fontSize: '12px',
                padding: '6px 12px',
                borderRadius: '8px',
                border: '1px solid #EAE5DD',
                background: 'white',
                cursor: 'pointer',
              }}
            >
              儲存草稿
            </button>
          )}
        </div>
      </header>

      <div
        style={{
          maxWidth: '1100px',
          margin: '0 auto',
          padding: '20px',
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '20px',
        }}
      >
        <div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '12px',
            }}
          >
            <h2 style={{ fontSize: '14px', fontWeight: '600' }}>選擇學校</h2>
            <span
              style={{
                fontSize: '12px',
                padding: '3px 10px',
                borderRadius: '99px',
                background: selected.length >= MAX ? '#fef3c7' : '#f3f4f6',
                color: selected.length >= MAX ? '#92400e' : '#6B6B6B',
              }}
            >
              {selected.length} / {MAX}
            </span>
          </div>
          {/* ── Phase 17a 學生條件篩選 ── */}
          <div style={{
            background: '#F8F9FA',
            border: '1px solid #EAE5DD',
            borderRadius: '10px',
            padding: '14px 16px',
            marginBottom: '16px',
          }}>
            <div style={{
              fontSize: '12px',
              fontWeight: '600',
              color: '#6B6B6B',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              marginBottom: '10px',
            }}>
              學生條件篩選
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <label style={{ fontSize: '13px', color: '#374151', whiteSpace: 'nowrap' }}>
                學生年齡
              </label>
              <input
                type="number"
                min={1}
                max={99}
                placeholder="歲"
                value={studentAge ?? ''}
                onChange={(e) => {
                  const val = e.target.value;
                  setStudentAge(val === '' ? null : Number(val));
                }}
                style={{
                  width: '70px',
                  padding: '6px 8px',
                  fontSize: '13px',
                  border: '1px solid #D1D5DB',
                  borderRadius: '6px',
                  outline: 'none',
                  textAlign: 'center',
                }}
              />
              {studentAge !== null && (
                <button
                  onClick={() => setStudentAge(null)}
                  style={{
                    fontSize: '12px',
                    color: '#9CA3AF',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '0 4px',
                  }}
                >
                  清除
                </button>
              )}
              {studentAge !== null && (
                <span style={{ fontSize: '12px', color: '#6B6B6B' }}>
                  · 不符年齡門檻的學校會自動標示
                </span>
              )}
            </div>
            {/* Phase 17c — 預算欄位(軟提示,不擋選取) */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '10px', flexWrap: 'wrap' }}>
              <label style={{ fontSize: '13px', color: '#374151', whiteSpace: 'nowrap' }}>
                每週預算
              </label>
              <input
                type="number"
                min={1}
                placeholder="金額"
                value={weeklyBudget ?? ''}
                onChange={(e) => {
                  const val = e.target.value;
                  setWeeklyBudget(val === '' ? null : Number(val));
                }}
                style={{
                  width: '90px',
                  padding: '6px 8px',
                  fontSize: '13px',
                  border: '1px solid #D1D5DB',
                  borderRadius: '6px',
                  outline: 'none',
                  textAlign: 'center',
                }}
              />
              <select
                value={budgetCurrency}
                onChange={(e) => setBudgetCurrency(e.target.value)}
                style={{
                  padding: '6px 8px',
                  fontSize: '13px',
                  border: '1px solid #D1D5DB',
                  borderRadius: '6px',
                  outline: 'none',
                  background: 'white',
                }}
              >
                <option value="CAD">CAD</option>
                <option value="AUD">AUD</option>
                <option value="GBP">GBP</option>
                <option value="USD">USD</option>
              </select>
              {weeklyBudget !== null && (
                <button
                  onClick={() => setWeeklyBudget(null)}
                  style={{
                    fontSize: '12px',
                    color: '#9CA3AF',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '0 4px',
                  }}
                >
                  清除
                </button>
              )}
              {weeklyBudget !== null && (
                <span style={{ fontSize: '12px', color: '#6B6B6B' }}>
                  · 超過預算只是提示,仍可選取
                </span>
              )}
            </div>

            {/* 英語程度欄位 (Phase 17d) */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '10px', flexWrap: 'wrap' }}>
              <label style={{ fontSize: '13px', color: '#374151', whiteSpace: 'nowrap' }}>
                英語程度
              </label>
              <select
                value={examType}
                onChange={(e) => { setExamType(e.target.value); setExamScore(null); }}
                style={{
                  padding: '6px 8px',
                  fontSize: '13px',
                  border: '1px solid #D1D5DB',
                  borderRadius: '6px',
                  outline: 'none',
                  background: 'white',
                }}
              >
                <option value="">— 選填 —</option>
                <option value="toeic">多益 TOEIC</option>
                <option value="ielts">雅思 IELTS</option>
                <option value="toefl">托福 TOEFL iBT</option>
                <option value="none_basic">無檢定(有基礎)</option>
                <option value="none_beginner">無檢定(初學)</option>
              </select>
              {examType && !examType.startsWith('none') && (
                <input
                  type="number"
                  min={0}
                  placeholder="分數"
                  value={examScore ?? ''}
                  onChange={(e) => {
                    const val = e.target.value;
                    setExamScore(val === '' ? null : Number(val));
                  }}
                  style={{
                    width: '70px',
                    padding: '6px 8px',
                    fontSize: '13px',
                    border: '1px solid #D1D5DB',
                    borderRadius: '6px',
                    outline: 'none',
                    textAlign: 'center',
                  }}
                />
              )}
              {examType && (examType.startsWith('none') || examScore !== null) && (() => {
                const cefr = getStudentCefr(examType, examScore ?? 0);
                return cefr ? (
                  <span style={{ fontSize: '11px', color: '#6B7280' }}>
                    ≈ {cefr}
                  </span>
                ) : null;
              })()}
              {examType && (
                <button
                  onClick={() => { setExamType(''); setExamScore(null); }}
                  style={{
                    fontSize: '12px',
                    color: '#9CA3AF',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '0 4px',
                  }}
                >
                  清除
                </button>
              )}
            </div>

            {/* 出發目的 (Phase 17e) */}
            <div style={{ marginTop: '10px' }}>
              <div style={{ fontSize: '12px', color: '#374151', marginBottom: '6px' }}>
                出發目的(可複選)
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {PURPOSE_TAGS.map((tag) => {
                  const isOn = selectedPurposes.includes(tag.id);
                  return (
                    <button
                      key={tag.id}
                      onClick={() => togglePurpose(tag.id)}
                      style={{
                        fontSize: '12px',
                        padding: '4px 10px',
                        borderRadius: '99px',
                        border: `1px solid ${isOn ? '#378ADD' : '#D1D5DB'}`,
                        background: isOn ? '#E6F1FB' : 'white',
                        color: isOn ? '#0C447C' : '#6B7280',
                        cursor: 'pointer',
                        transition: 'all 0.1s',
                      }}
                    >
                      {tag.label}
                    </button>
                  );
                })}
              </div>
              {selectedPurposes.length > 0 && (
                <button
                  onClick={() => setSelectedPurposes([])}
                  style={{
                    fontSize: '11px',
                    color: '#9CA3AF',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    marginTop: '6px',
                  }}
                >
                  清除全部
                </button>
              )}
            </div>

            {/* 預計週數 (Phase 17f) */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '10px', flexWrap: 'wrap' }}>
              <label style={{ fontSize: '13px', color: '#374151', whiteSpace: 'nowrap' }}>
                預計週數
              </label>
              <input
                type="number"
                min={1}
                max={104}
                placeholder="週"
                value={maxWeeks ?? ''}
                onChange={(e) => {
                  const val = e.target.value;
                  setMaxWeeks(val === '' ? null : Number(val));
                }}
                style={{
                  width: '65px',
                  padding: '6px 8px',
                  fontSize: '13px',
                  border: '1px solid #D1D5DB',
                  borderRadius: '6px',
                  outline: 'none',
                  textAlign: 'center',
                }}
              />
              <span style={{ fontSize: '12px', color: '#6B7280' }}>週以內</span>
              {maxWeeks !== null && (
                <button
                  onClick={() => setMaxWeeks(null)}
                  style={{
                    fontSize: '12px',
                    color: '#9CA3AF',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '0 4px',
                  }}
                >
                  清除
                </button>
              )}
            </div>

            {/* Q3 opt-in — 把學生條件加入公開頁 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '12px', paddingTop: '10px', borderTop: '1px solid #E5E7EB' }}>
              <input
                type="checkbox"
                id="include-profile"
                checked={includeProfileInPage}
                onChange={(e) => setIncludeProfileInPage(e.target.checked)}
                style={{ width: '14px', height: '14px', cursor: 'pointer' }}
              />
              <label htmlFor="include-profile" style={{ fontSize: '12px', color: '#6B7280', cursor: 'pointer' }}>
                將學生條件加入比較頁(供諮詢時展示)
              </label>
            </div>
          </div>
          {/* ── Phase 17a / 17c / 17d / 17e / 17f + Q3 結束 ── */}

          {(loading || loadingEdit) ? (
            <div
              style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}
            >
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  style={{
                    height: '90px',
                    background: '#f3f4f6',
                    borderRadius: '12px',
                  }}
                />
              ))}
            </div>
          ) : (
            <div
              style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}
            >
              {allCampuses.map((campus) => {
                const ageBlocked =
                  studentAge !== null &&
                  campus.school.min_age !== null &&
                  studentAge < campus.school.min_age;
                return (
                  <div key={campus.id}>
                    <CampusCard
                      campus={campus}
                      selected={!!selected.find((c) => c.id === campus.id)}
                      onToggle={toggleCampus}
                      disabled={selected.length >= MAX}
                      ageBlocked={ageBlocked}
                      minAge={campus.school.min_age}
                      overBudget={isCampusOverBudget(campus.id)}
                      minPrice={getCampusMinPrice(campus.id, budgetCurrency)}
                      priceCurrency={budgetCurrency}
                      levelTooHigh={isCampusLevelTooHigh(campus.id, campus.school.id)}
                      minEntryLevel={getCampusMinEntryLevel(campus.school.id)}
                      weeksMismatch={isCampusWeeksMismatch(campus.school.id)}
                      minWeeks={getCampusMinWeeks(campus.school.id)}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div>
            <h2
              style={{
                fontSize: '14px',
                fontWeight: '600',
                marginBottom: '10px',
              }}
            >
              已選學校{' '}
              <span
                style={{
                  fontWeight: '400',
                  color: '#9ca3af',
                  fontSize: '12px',
                }}
              >
                （最多 5 個校區）
              </span>
            </h2>
            {selected.length === 0 ? (
              <div
                style={{
                  border: '1.5px dashed #EAE5DD',
                  borderRadius: '12px',
                  padding: '24px',
                  textAlign: 'center',
                }}
              >
                <p style={{ fontSize: '13px', color: '#9ca3af', margin: 0 }}>
                  從左側選擇 1–5 個校區
                </p>
              </div>
            ) : (
              <div
                style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}
              >
                {selected.map((campus, index) => (
                  <div
                    key={campus.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      background: 'white',
                      border: '1px solid #EAE5DD',
                      borderRadius: '10px',
                      padding: '10px 12px',
                    }}
                  >
                    <span
                      style={{
                        width: '20px',
                        height: '20px',
                        borderRadius: '50%',
                        background: '#E8195A',
                        color: 'white',
                        fontSize: '11px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      {index + 1}
                    </span>
                    <span
                      style={{ fontSize: '13px', fontWeight: '500', flex: 1 }}
                    >
                      {campus.school.name} {campus.city}
                    </span>
                    <button
                      onClick={() =>
                        setSelected((prev) =>
                          prev.filter((c) => c.id !== campus.id)
                        )
                      }
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#9ca3af',
                        cursor: 'pointer',
                        fontSize: '18px',
                      }}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <label
              style={{
                display: 'block',
                fontSize: '14px',
                fontWeight: '600',
                marginBottom: '8px',
              }}
            >
              頁面標題{' '}
              <span
                style={{
                  fontWeight: '400',
                  color: '#9ca3af',
                  fontSize: '12px',
                }}
              >
                （選填）
              </span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={
                selected.length > 0
                  ? selected.map((c) => `${c.school.name} ${c.city}`).join(' vs ') + ' 比較'
                  : '例如：ILAC vs ILSC 2026'
              }
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: '8px',
                border: '1px solid #EAE5DD',
                fontSize: '13px',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div>
            <h2
              style={{
                fontSize: '14px',
                fontWeight: '600',
                marginBottom: '10px',
              }}
            >
              顯示欄位
            </h2>
            <FieldSelector
              selected={fields}
              onChange={(key, val) =>
                setFields((prev) => ({ ...prev, [key]: val }))
              }
            />
          </div>

          {selected.length > 0 && (
            <div>
              <h2
                style={{
                  fontSize: '14px',
                  fontWeight: '600',
                  marginBottom: '10px',
                }}
              >
                顧問備注
              </h2>
              <AdvisorNotes
                schools={selected}
                notes={notes}
                onChange={(id, note) =>
                  setNotes((prev) => ({ ...prev, [id]: note }))
                }
              />
            </div>
          )}

          <div style={{ paddingTop: '4px' }}>
            {selected.length === 0 && (
              <p
                style={{
                  fontSize: '12px',
                  color: '#f59e0b',
                  background: '#fef3c7',
                  borderRadius: '8px',
                  padding: '8px 12px',
                  marginBottom: '10px',
                }}
              >
                請先選擇至少一間學校
              </p>
            )}
            <button
              onClick={handleGenerate}
              disabled={selected.length === 0 || generating}
              style={{
                width: '100%',
                background:
                  selected.length === 0 || generating ? '#9ca3af' : '#E8195A',
                color: 'white',
                border: 'none',
                borderRadius: '12px',
                padding: '14px',
                fontSize: '14px',
                fontWeight: '500',
                cursor:
                  selected.length === 0 || generating
                    ? 'not-allowed'
                    : 'pointer',
              }}
            >
              {generating
                ? editSlug
                  ? '更新中...'
                  : '產生中...'
                : editSlug
                ? '更新比較頁面'
                : '產生比較頁面'}
            </button>
            <p
              style={{
                fontSize: '11px',
                textAlign: 'center',
                color: '#9ca3af',
                marginTop: '6px',
              }}
            >
              約需 30–60 秒
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
