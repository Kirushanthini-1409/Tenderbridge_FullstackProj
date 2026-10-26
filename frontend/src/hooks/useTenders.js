import { useCallback, useEffect, useState } from 'react';
import { tenderService } from '../services/tenderService.js';
import { getRows } from '../utils/formatters.js';
export function useTenders(params = {}) {
  const [items, setItems] = useState([]); const [loading, setLoading] = useState(true); const [error, setError] = useState(null);
  const reload = useCallback(async () => { setLoading(true); setError(null); try { setItems(getRows(await tenderService.list(params))); } catch (e) { setError(e); } finally { setLoading(false); } }, [JSON.stringify(params)]);
  useEffect(() => { reload(); }, [reload]);
  return { items, loading, error, reload };
}
