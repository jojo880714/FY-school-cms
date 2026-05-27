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
  deleted_at: string | null;
}

export function DashboardPage() {
  const { user, signOut } = useAuth();
  const [pages, setPages] = useState<GeneratedPage[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPages();
  }, []);

  async function loadPages() {
    setLoading(true);
    const { data } = await supabase
      .from('generated_pages')
      .select('*')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(20);
    if (data) setPages(data as GeneratedPage[]);
    setLoading(false);
  }

  async function handleDelete(id: string, label: string) {
    const ok = window.confirm(
      `確定要刪除「${label}」嗎？\n\n` +
        `Dashboard 將不再顯示此頁面（軟刪除，可從 Supabase Studio 救回）。\n` +
        `Worker URL 仍可訪問，如需完全失效請另外處理。`
    );
    if (!ok) return;
    const { error } = await supabase
      .from('generated_pages')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id);
    if (error) {
      alert('刪除失敗：' + error.message);
      return;
    }
    await loadPages();
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f9fafb' }}>
      <header
        style={{
          background: 'white',
          borderBottom: '1px solid #e5e7eb',
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
          <span style={{ fontSize: '13px', color: '#6b7280' }}>
            {user?.email}
          </span>
          <button
            onClick={signOut}
            style={{
              fontSize: '13px',
              color: '#6b7280',
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
            { label: '總頁面', value: pages.length },
            {
              label: '已發布',
              value: pages.filter((p) => p.status === 'published').length,
            },
            {
              label: '本月產生',
              value: pages.filter(
                (p) =>
                  new Date(p.created_at).getMonth() === new Date().getMonth()
              ).length,
            },
          ].map(({ label, value }) => (
            <div
              key={label}
              style={{
                background: 'white',
                border: '1px solid #e5e7eb',
                borderRadius: '12px',
                padding: '16px',
              }}
            >
              <div
                style={{
                  fontSize: '12px',
                  color: '#6b7280',
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
            background: '#C41E3A',
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
            fontSize: '13px',
            fontWeight: '600',
            color: '#374151',
            marginBottom: '12px',
          }}
        >
          最近產生的頁面
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
            <div style={{ fontSize: '32px', marginBottom: '12px' }}>📄</div>
            <p style={{ fontSize: '14px', color: '#6b7280', margin: 0 }}>
              還沒有任何比較頁面，點上方按鈕建立第一個
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
                  border: '1px solid #e5e7eb',
                  borderRadius: '12px',
                  padding: '16px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
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
                    {page.title || page.slug}
                  </div>
                  <div
                    style={{
                      fontSize: '12px',
                      color: '#9ca3af',
                      display: 'flex',
                      gap: '8px',
                      alignItems: 'center',
                    }}
                  >
                    <span>{new Date(page.created_at).toLocaleDateString('zh-TW')}</span>
                    <span>·</span>
                    <span>{metaText}</span>
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
                        color: '#2563eb',
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
                      color: page.status === 'published' ? '#065f46' : '#6b7280',
                    }}
                  >
                    {page.status === 'published' ? '已發布' : '草稿'}
                  </span>
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
                </div>
              </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
