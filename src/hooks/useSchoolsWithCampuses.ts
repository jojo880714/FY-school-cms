/**
 * Hook — 一次抓 schools + campuses(給 wizard step 3 用)
 */

import { useEffect, useState } from 'react';
import { listSchoolsWithCampuses, type SchoolWithCampuses } from '../lib/api';

export interface UseSchoolsWithCampusesResult {
  schools: SchoolWithCampuses[];
  loading: boolean;
  error: Error | null;
  refetch: () => void;
}

export function useSchoolsWithCampuses(): UseSchoolsWithCampusesResult {
  const [schools, setSchools] = useState<SchoolWithCampuses[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    setLoading(true);
    setError(null);
    listSchoolsWithCampuses()
      .then((data) => setSchools(data))
      .catch((e) => setError(e instanceof Error ? e : new Error(String(e))))
      .finally(() => setLoading(false));
  }, [tick]);

  return {
    schools,
    loading,
    error,
    refetch: () => setTick((t) => t + 1),
  };
}
