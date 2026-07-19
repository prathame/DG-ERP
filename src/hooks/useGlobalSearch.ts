import { useEffect, useState } from 'react';
import { api } from '../api';
import { useDebounce } from './useDebounce';
import { emptyGlobalSearchResults, type GlobalSearchResults } from '../lib/globalSearch';

/** Debounced `api.search.global` — same engine as Search / Verify (search only). */
export function useGlobalSearch(query: string, delay = 200) {
  const debounced = useDebounce(query.trim(), delay);
  const [results, setResults] = useState<GlobalSearchResults | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!debounced || debounced.length < 1) {
      setResults(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    api.search
      .global(debounced)
      .then(r => {
        if (cancelled) return;
        setResults({
          products: r.products ?? [],
          customers: r.customers ?? [],
          vendors: r.vendors ?? [],
          barcodes: r.barcodes ?? [],
          challans: (r as GlobalSearchResults).challans ?? [],
          staff: (r as GlobalSearchResults).staff ?? [],
        });
      })
      .catch(() => {
        if (!cancelled) setResults(emptyGlobalSearchResults());
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debounced]);

  return { results, loading, debouncedQuery: debounced };
}
