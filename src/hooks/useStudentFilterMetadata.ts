/**
 * Hook — 一次抓 programs / tuition_tiers / housing / city_info(給學生過濾用)
 *
 * 對齊 CreatePage line 484-488 + 673-678 內的個別 load,但合併成一個 hook。
 */

import { useEffect, useState } from 'react';
import { loadStudentFilterMetadata, type StudentFilterMetadata } from '../lib/api';

export interface UseStudentFilterMetadataResult {
  metadata: StudentFilterMetadata | null;
  loading: boolean;
  error: Error | null;
  refetch: () => void;
}

const EMPTY: StudentFilterMetadata = {
  programs: [],
  tuitionTiers: [],
  housing: [],
  cityInfo: [],
};

export function useStudentFilterMetadata(): UseStudentFilterMetadataResult {
  const [metadata, setMetadata] = useState<StudentFilterMetadata | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    setLoading(true);
    setError(null);
    loadStudentFilterMetadata()
      .then(setMetadata)
      .catch((e) => {
        setError(e instanceof Error ? e : new Error(String(e)));
        setMetadata(EMPTY);
      })
      .finally(() => setLoading(false));
  }, [tick]);

  return {
    metadata,
    loading,
    error,
    refetch: () => setTick((t) => t + 1),
  };
}
