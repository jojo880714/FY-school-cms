import { useEffect, useState, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { ALL_FIELD_KEYS, FIELD_GROUPS } from '../types';

interface School {
  id: string;
  name: string;
  full_name: string;
  founded: number | null;
  english_only_policy: boolean;
  accreditation: string[] | null;
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

const DRAFT_KEY = 'cms_draft';
const MAX = 5;

function CampusCard({
  campus,
  selected,
  onToggle,
  disabled,
}: {
  campus: CampusWithSchool;
  selected: boolean;
  onToggle: (campus: CampusWithSchool) => void;
  disabled: boolean;
}) {
  return (
    <div
      onClick={() => !disabled || selected ? onToggle(campus) : null}
      style={{
        border: selected ? '2px solid #C41E3A' : '1px solid #e5e7eb',
        background: selected ? '#fdf0f2' : disabled ? '#f9fafb' : 'white',
        cursor: disabled && !selected ? 'not-allowed' : 'pointer',
        opacity: disabled && !selected ? 0.5 : 1,
        borderRadius: 12,
        padding: '16px',
        transition: 'all 0.15s',
      }}
    >
      <div style={{ fontWeight: 700, fontSize: 16, color: '#111', marginBottom: 4 }}>
        {campus.school.name}
      </div>
      <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 8 }}>
        {campus.city}
      </div>
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
          background: selected ? '#C41E3A' : 'transparent',
          color: selected ? 'white' : '#6b7280',
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
              border: '1px solid #e5e7eb',
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
                background: '#f9fafb',
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
                style={{ accentColor: '#C41E3A' }}
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
                      style={{ accentColor: '#C41E3A' }}
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
              對 <span style={{ color: '#111' }}>{campus.school.name} {campus.city}</span> 的備注{' '}
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
                  border: '1px solid #e5e7eb',
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
      setLoading(false);
    }
    load();
  }, []);

  useEffect(() => {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return;
    try {
      const d = JSON.parse(raw);
      if (d.fields) setFields(d.fields);
      if (d.notes) setNotes(d.notes);
      if (d.title) setTitle(d.title);
    } catch {}
  }, []);

  useEffect(() => {
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
  }, [allCampuses]);

  const saveDraft = useCallback(() => {
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({ selectedIds: selected.map((c) => c.id), fields, notes, title })
    );
    setSavedAt(new Date());
  }, [selected, fields, notes, title]);

  useEffect(() => {
    const t = setInterval(saveDraft, 30000);
    return () => clearInterval(t);
  }, [saveDraft]);

  function toggleCampus(campus: CampusWithSchool) {
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

      const slug = `${selected.map((c) => `${c.school.name.toLowerCase()}-${c.city.toLowerCase()}`).join('-')}-${Date.now().toString().slice(-4)}`;
      const pageTitle = title || selected.map((c) => `${c.school.name} ${c.city}`).join(' vs ') + ' 比較 2026';
      const selectedFieldLabels = Object.entries(fields)
        .filter(([, v]) => v)
        .map(([k]) => k);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      await supabase.from('generated_pages').upsert({
        slug,
        title: pageTitle,
        school_ids: selected.map((c) => c.school_id),
        campus_ids: selected.map((c) => c.id),
        selected_fields: fields,
        advisor_notes: notes,
        status: 'draft',
        created_by: user?.id,
      }, { onConflict: 'slug' });

      const { data: result, error: fnError } = await supabase.functions.invoke(
        'generate-page',
        {
          body: {
            schoolsInfo,
            selectedFields: selectedFieldLabels,
            title: pageTitle,
            slug,
          },
        }
      );
      if (fnError) throw fnError;
      if (!result.success) throw new Error(result.error);

      setResult({ url: result.url });
      localStorage.removeItem(DRAFT_KEY);
    } catch (err) {
      console.error(err);
      alert('產生失敗：' + String(err));
    } finally {
      setGenerating(false);
    }
  }

  if (result)
    return (
      <div
        style={{
          minHeight: '100vh',
          background: '#f9fafb',
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
            頁面產生完成！
          </h2>
          <p
            style={{ fontSize: '14px', color: '#6b7280', marginBottom: '20px' }}
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
              color: '#C41E3A',
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
                border: '1px solid #e5e7eb',
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
                background: '#C41E3A',
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
    <div style={{ minHeight: '100vh', background: '#f9fafb' }}>
      <header
        style={{
          background: 'white',
          borderBottom: '1px solid #e5e7eb',
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
          style={{ fontSize: '13px', color: '#6b7280', textDecoration: 'none' }}
        >
          ← 返回
        </Link>
        <span style={{ fontSize: '14px', fontWeight: '500' }}>
          建立比較頁面
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {savedAt && (
            <span style={{ fontSize: '11px', color: '#9ca3af' }}>
              已儲存{' '}
              {savedAt.toLocaleTimeString('zh-TW', {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          )}
          <button
            onClick={saveDraft}
            style={{
              fontSize: '12px',
              padding: '6px 12px',
              borderRadius: '8px',
              border: '1px solid #e5e7eb',
              background: 'white',
              cursor: 'pointer',
            }}
          >
            儲存草稿
          </button>
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
                color: selected.length >= MAX ? '#92400e' : '#6b7280',
              }}
            >
              {selected.length} / {MAX}
            </span>
          </div>
          {loading ? (
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
              {allCampuses.map((campus) => (
                <div key={campus.id}>
                  <CampusCard
                    campus={campus}
                    selected={!!selected.find((c) => c.id === campus.id)}
                    onToggle={toggleCampus}
                    disabled={selected.length >= MAX}
                  />
                </div>
              ))}
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
                  border: '1.5px dashed #e5e7eb',
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
                      border: '1px solid #e5e7eb',
                      borderRadius: '10px',
                      padding: '10px 12px',
                    }}
                  >
                    <span
                      style={{
                        width: '20px',
                        height: '20px',
                        borderRadius: '50%',
                        background: '#C41E3A',
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
                border: '1px solid #e5e7eb',
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
                  selected.length === 0 || generating ? '#9ca3af' : '#C41E3A',
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
              {generating ? '產生中...' : '產生比較頁面'}
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
