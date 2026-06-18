/**
 * Hook — generated_pages 列表 + 搜尋 + 分頁 + 統計
 *
 * 取代 DashboardPage 內 inline 的 loadPages / loadStats / state management。
 *
 * ## 使用範例
 *
 * ```tsx
 * function Dashboard() {
 *   const { pages, total, stats, loading, error, refetch, search, setSearch, page, setPage } = useGeneratedPages();
 *
 *   return loading ? <Spinner /> : <List pages={pages} total={total} />;
 * }
 * ```
 */

import { useCallback, useEffect, useState } from 'react';
import {
  listGeneratedPages,
  getGeneratedPagesStats,
  type GeneratedPageRow,
  type GeneratedPagesStats,
} from '../lib/api';

export interface UseGeneratedPagesOptions {
  pageSize?: number;
  debounceMs?: number;
  /** 是否同時抓 stats(預設 true)*/
  withStats?: boolean;
}

export interface UseGeneratedPagesResult {
  // 列表 state
  pages: GeneratedPageRow[];
  total: number;
  loading: boolean;
  error: Error | null;

  // 搜尋 + 分頁 控制
  search: string;
  setSearch: (v: string) => void;
  debouncedSearch: string;
  page: number;
  setPage: (n: number) => void;
  pageSize: number;
  pageCount: number;

  // 統計
  stats: GeneratedPagesStats;
  statsLoading: boolean;

  // 手動 refetch(刪除 / 編輯後呼叫)
  refetch: () => void;
}

export function useGeneratedPages(opts: UseGeneratedPagesOptions = {}): UseGeneratedPagesResult {
  const { pageSize = 20, debounceMs = 300, withStats = true } = opts;

  const [pages, setPages] = useState<GeneratedPageRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(0);

  const [stats, setStats] = useState<GeneratedPagesStats>({ total: 0, published: 0, thisMonth: 0 });
  const [statsLoading, setStatsLoading] = useState(true);

  // 搜尋去抖動
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), debounceMs);
    return () => clearTimeout(t);
  }, [search, debounceMs]);

  // 搜尋變更時回到 page 0
  useEffect(() => {
    setPage(0);
  }, [debouncedSearch]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await listGeneratedPages({ search: debouncedSearch, page, pageSize });
      setPages(result.pages);
      setTotal(result.total);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, page, pageSize]);

  const loadStats = useCallback(async () => {
    if (!withStats) return;
    setStatsLoading(true);
    try {
      const s = await getGeneratedPagesStats();
      setStats(s);
    } catch (e) {
      console.error('useGeneratedPages.loadStats error', e);
    } finally {
      setStatsLoading(false);
    }
  }, [withStats]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  const refetch = useCallback(() => {
    load();
    loadStats();
  }, [load, loadStats]);

  return {
    pages,
    total,
    loading,
    error,
    search,
    setSearch,
    debouncedSearch,
    page,
    setPage,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
    stats,
    statsLoading,
    refetch,
  };
}
