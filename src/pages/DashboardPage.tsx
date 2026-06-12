import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';

interface GeneratedPage {
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
  // Phase 19b/19a
  student_name: string | null;
  student_contact: string | null;
  consultation_date: string | null;
  consultation_notes: string | null;
}

const PAGE_SIZE = 20;

export function DashboardPage() {
  const { user, signOut } = useAuth();
  const [pages, setPages] = useState<GeneratedPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [pageIdx, setPageIdx] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [stats, setStats] = useState({ total: 0, published: 0, thisMonth: 0 });
  // Phase 19d
  const [expandedSlug, setExpandedSlug] = useState<string | null>(null);
  const [notesMap, setNotesMap] = useState<Record<string, string>>({});

  // 搜尋去抖動（300ms）
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  // 搜尋變更時回到第 0 頁
  useEffect(() => {
    setPageIdx(0);
  }, [debouncedSearch]);

  // 列表載入（依賴搜尋與分頁）
  useEffect(() => {
    loadPages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, pageIdx]);

  // 統計載入（mount 與 delete 後觸發）
  useEffect(() => {
    loadStats();
  }, []);

  async function loadPages() {
    setLoading(true);
    let q = supabase
      .from('generated_pages')
      .select('*', { count: 'exact' })
      .is('deleted_at', null);

    const term = debouncedSearch.trim();
    if (term) {
      q = q.or(`title.ilike.%${term}%,slug.ilike.%${term}%,student_name.ilike.%${term}%,student_contact.ilike.%${term}%`);
    }

    const { data, count } = await q
      .order('created_at', { ascending: false })
      .range(pageIdx * PAGE_SIZE, pageIdx * PAGE_SIZE + PAGE_SIZE - 1);

    if (data) setPages(data as GeneratedPage[]);
    setTotalCount(count ?? 0);
    setLoading(false);
  }

  async function loadStats() {
    const startOfMonth = new Date(
      new Date().getFullYear(),
      new Date().getMonth(),
      1
    ).toISOString();
    const [totalRes, publishedRes, monthRes] = await Promise.all([
      supabase
        .from('generated_pages')
        .select('id', { count: 'exact', head: true })
        .is('deleted_at', null),
      supabase
        .from('generated_pages')
        .select('id', { count: 'exact', head: true })
        .is('deleted_at', null)
        .eq('status', 'published'),
      supabase
        .from('generated_pages')
        .select('id', { count: 'exact', head: true })
        .is('deleted_at', null)
        .gte('created_at', startOfMonth),
    ]);
    setStats({
      total: totalRes.count ?? 0,
      published: publishedRes.count ?? 0,
      thisMonth: monthRes.count ?? 0,
    });
  }

  async function handleDelete(id: string, label: string) {
    const ok = window.confirm(`確定要刪除「${label}」嗎？`);
    if (!ok) return;
    const { error } = await supabase
      .from('generated_pages')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id);
    if (error) {
      alert('刪除失敗：' + error.message);
      return;
    }
    await Promise.all([loadPages(), loadStats()]);
  }

  // Phase 19d — 諮詢備注存檔
  async function saveNotes(slug: string) {
    const notes = notesMap[slug] ?? '';
    await supabase
      .from('generated_pages')
      .update({ consultation_notes: notes || null })
      .eq('slug', slug);
  }

  // Phase 19d — 複製到大表 (Google Sheet 備注欄格式)
  function copyToSheet(page: GeneratedPage) {
    const date = page.consultation_date
      ?? new Date(page.created_at).toLocaleDateString('zh-TW');
    const name = page.student_name ?? '—';
    const contact = page.student_contact ?? '—';
    const url = page.public_url || page.html_url || '—';
    const notes = notesMap[page.slug] ?? page.consultation_notes ?? '';

    const text = [
      `【放洋諮詢紀錄】${date}`,
      `學生：${name}｜${contact}`,
      `LP：${url}`,
      notes ? `備注：${notes}` : null,
    ].filter(Boolean).join('\n');

    navigator.clipboard.writeText(text).then(() => {
      alert('已複製到剪貼簿，請貼進 Google Sheet 備注欄');
    });
  }

  return (
    <div style={{ minHeight: '100vh', background: '#FAF7F2' }}>
      <header
        style={{
          background: 'white',
          borderBottom: '1px solid #EAE5DD',
          padding: '0 24px',
          height: '56px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          position: 'sticky',
          top: 0,
          zIndex: 10,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '20px' }}>🍁</span>
          <span style={{ fontWeight: '600', fontSize: '15px' }}>
            語言學校比較系統
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <span style={{ fontSize: '13px', color: '#6B6B6B' }}>
            {user?.email}
          </span>
          <button
            onClick={signOut}
            style={{
              fontSize: '13px',
              color: '#6B6B6B',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            登出
          </button>
        </div>
      </header>

      <main
        style={{ maxWidth: '800px', margin: '0 auto', padding: '32px 16px' }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3,1fr)',
            gap: '12px',
            marginBottom: '24px',
          }}
        >
          {[
            { label: '總頁面', value: stats.total },
            { label: '已發布', value: stats.published },
            { label: '本月產生', value: stats.thisMonth },
          ].map(({ label, value }) => (
            <div
              key={label}
              style={{
                background: 'white',
                border: '1px solid #EAE5DD',
                borderRadius: '12px',
                padding: '16px',
              }}
            >
              <div
                style={{
                  fontSize: '12px',
                  color: '#6B6B6B',
                  marginBottom: '4px',
                }}
              >
                {label}
              </div>
              <div style={{ fontSize: '28px', fontWeight: '600' }}>{value}</div>
            </div>
          ))}
        </div>

        <Link
          to="/create"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            background: '#E8195A',
            color: 'white',
            borderRadius: '12px',
            padding: '14px',
            fontSize: '15px',
            fontWeight: '500',
            textDecoration: 'none',
            marginBottom: '24px',
          }}
        >
          ＋ 建立新比較頁面
        </Link>

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '12px',
            gap: '12px',
          }}
        >
          <div
            style={{
              fontSize: '13px',
              fontWeight: '600',
              color: '#2C2C2A',
              whiteSpace: 'nowrap',
            }}
          >
            {debouncedSearch
              ? `搜尋「${debouncedSearch}」（${totalCount}）`
              : '最近產生的頁面'}
          </div>
          <input
            type="text"
            placeholder="搜尋學生姓名、聯絡方式、標題..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              flex: 1,
              maxWidth: '280px',
              padding: '6px 10px',
              fontSize: '13px',
              border: '1px solid #EAE5DD',
              borderRadius: '8px',
              outline: 'none',
            }}
          />
        </div>

        {loading ? (
          <div
            style={{ textAlign: 'center', padding: '40px', color: '#9ca3af' }}
          >
            載入中...
          </div>
        ) : pages.length === 0 ? (
          <div
            style={{
              background: 'white',
              border: '1px dashed #d1d5db',
              borderRadius: '12px',
              padding: '48px',
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: '32px', marginBottom: '12px' }}>
              {debouncedSearch ? '🔍' : '📄'}
            </div>
            <p style={{ fontSize: '14px', color: '#6B6B6B', margin: 0 }}>
              {debouncedSearch
                ? `找不到包含「${debouncedSearch}」的頁面`
                : '還沒有任何比較頁面，點上方按鈕建立第一個'}
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {pages.map((page) => {
              const schoolCount = new Set(page.school_ids ?? []).size;
              const campusCount = (page.campus_ids ?? []).length;
              const metaText =
                schoolCount === 0 && campusCount === 0
                  ? '舊資料'
                  : `${schoolCount} 校 / ${campusCount} 校區`;
              const openUrl = page.public_url || page.html_url;
              return (
              <div
                key={page.id}
                style={{
                  background: 'white',
                  border: '1px solid #EAE5DD',
                  borderRadius: '12px',
                  padding: '16px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                }}
              >
                <div>
                  <div
                    style={{
                      fontWeight: '500',
                      fontSize: '14px',
                      marginBottom: '4px',
                    }}
                  >
                    {page.student_name || page.title || page.slug}
                  </div>
                  {/* 副標第一行：學生聯絡 + 日期 */}
                  <div style={{
                    fontSize: '12px',
                    color: '#9CA3AF',
                    marginTop: '3px',
                    display: 'flex',
                    gap: '6px',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                  }}>
                    {page.student_contact && (
                      <span style={{ color: '#6B7280' }}>{page.student_contact}</span>
                    )}
                    {page.student_contact && (
                      <span>·</span>
                    )}
                    <span>
                      {page.consultation_date
                        ? page.consultation_date
                        : new Date(page.created_at).toLocaleDateString('zh-TW')}
                    </span>
                  </div>
                  {/* 副標第二行：學校數量 + 舊資料 fallback */}
                  <div style={{
                    fontSize: '12px',
                    color: '#9CA3AF',
                    marginTop: '2px',
                  }}>
                    {metaText}
                    {page.student_name && page.title && page.title !== page.student_name && (
                      <span style={{ marginLeft: '6px', color: '#D1D5DB' }}>
                        · {page.title}
                      </span>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  {openUrl && (
                    <a
                      href={openUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        fontSize: '12px',
                        color: '#2B4A6B',
                        textDecoration: 'none',
                      }}
                    >
                      開啟 ↗
                    </a>
                  )}
                  <span
                    style={{
                      fontSize: '12px',
                      padding: '3px 10px',
                      borderRadius: '99px',
                      background:
                        page.status === 'published' ? '#d1fae5' : '#f3f4f6',
                      color: page.status === 'published' ? '#065f46' : '#6B6B6B',
                    }}
                  >
                    {page.status === 'published' ? '已發布' : '草稿'}
                  </span>
                  <Link
                    to={`/create?slug=${page.slug}`}
                    title="編輯"
                    aria-label="編輯"
                    style={{
                      fontSize: '14px',
                      color: '#9ca3af',
                      padding: '4px 8px',
                      borderRadius: '6px',
                      lineHeight: 1,
                      textDecoration: 'none',
                    }}
                  >
                    ✏️
                  </Link>
                  <button
                    onClick={() => handleDelete(page.id, page.title || page.slug)}
                    title="刪除"
                    aria-label="刪除"
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: '14px',
                      color: '#9ca3af',
                      padding: '4px 8px',
                      borderRadius: '6px',
                      lineHeight: 1,
                    }}
                  >
                    🗑
                  </button>
                  {/* Phase 19d — 筆記 toggle */}
                  <button
                    onClick={() => {
                      setExpandedSlug(expandedSlug === page.slug ? null : page.slug);
                      if (!notesMap[page.slug] && page.consultation_notes) {
                        setNotesMap(prev => ({
                          ...prev,
                          [page.slug]: page.consultation_notes!,
                        }));
                      }
                    }}
                    style={{
                      fontSize: '12px',
                      padding: '4px 8px',
                      borderRadius: '6px',
                      border: '1px solid #E5E7EB',
                      background: expandedSlug === page.slug ? '#F0F9FF' : 'white',
                      color: '#6B7280',
                      cursor: 'pointer',
                    }}
                  >
                    {page.consultation_notes ? '📝 筆記' : '+ 筆記'}
                  </button>
                </div>
                {/* Phase 19d — 筆記展開面板 */}
                {expandedSlug === page.slug && (
                  <div style={{
                    marginTop: '10px',
                    paddingTop: '10px',
                    borderTop: '1px solid #F3F4F6',
                    width: '100%',
                  }}>
                    <textarea
                      placeholder="諮詢備注：學生偏好、下一步行動、家長意見..."
                      value={notesMap[page.slug] ?? page.consultation_notes ?? ''}
                      onChange={(e) => setNotesMap(prev => ({
                        ...prev,
                        [page.slug]: e.target.value,
                      }))}
                      style={{
                        width: '100%',
                        minHeight: '80px',
                        padding: '8px 10px',
                        fontSize: '13px',
                        border: '1px solid #E5E7EB',
                        borderRadius: '6px',
                        outline: 'none',
                        resize: 'vertical',
                        fontFamily: 'inherit',
                        color: '#374151',
                        boxSizing: 'border-box',
                      }}
                    />
                    <div style={{
                      display: 'flex',
                      gap: '8px',
                      marginTop: '8px',
                      justifyContent: 'flex-end',
                    }}>
                      <button
                        onClick={() => copyToSheet(page)}
                        style={{
                          fontSize: '12px',
                          padding: '5px 12px',
                          borderRadius: '6px',
                          border: '1px solid #E5E7EB',
                          background: 'white',
                          color: '#6B7280',
                          cursor: 'pointer',
                        }}
                      >
                        📋 複製到大表
                      </button>
                      <button
                        onClick={() => saveNotes(page.slug)}
                        style={{
                          fontSize: '12px',
                          padding: '5px 12px',
                          borderRadius: '6px',
                          border: 'none',
                          background: '#2563EB',
                          color: 'white',
                          cursor: 'pointer',
                        }}
                      >
                        儲存備注
                      </button>
                    </div>
                  </div>
                )}
              </div>
              );
            })}
          </div>
        )}

        {totalCount > PAGE_SIZE && (
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginTop: '16px',
              fontSize: '13px',
              color: '#6B6B6B',
            }}
          >
            <span>
              第 {pageIdx + 1} / {Math.ceil(totalCount / PAGE_SIZE)} 頁（共{' '}
              {totalCount} 筆）
            </span>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => setPageIdx((p) => Math.max(0, p - 1))}
                disabled={pageIdx === 0}
                style={{
                  padding: '6px 12px',
                  fontSize: '13px',
                  border: '1px solid #EAE5DD',
                  background: 'white',
                  borderRadius: '8px',
                  cursor: pageIdx === 0 ? 'not-allowed' : 'pointer',
                  opacity: pageIdx === 0 ? 0.5 : 1,
                }}
              >
                ← 上一頁
              </button>
              <button
                onClick={() => setPageIdx((p) => p + 1)}
                disabled={(pageIdx + 1) * PAGE_SIZE >= totalCount}
                style={{
                  padding: '6px 12px',
                  fontSize: '13px',
                  border: '1px solid #EAE5DD',
                  background: 'white',
                  borderRadius: '8px',
                  cursor:
                    (pageIdx + 1) * PAGE_SIZE >= totalCount
                      ? 'not-allowed'
                      : 'pointer',
                  opacity:
                    (pageIdx + 1) * PAGE_SIZE >= totalCount ? 0.5 : 1,
                }}
              >
                下一頁 →
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
