import { useState } from 'react';
import { tenderService } from '../services/tenderService.js';
export function useEligibility() {
  const [result, setResult] = useState(null); const [loading, setLoading] = useState(false); const [error, setError] = useState(null);
  async function evaluate(criteria, businessProfile) { setLoading(true); setError(null); try { const data = await tenderService.evaluateEligibility(criteria, businessProfile); setResult(data); return data; } catch (e) { setError(e); throw e; } finally { setLoading(false); } }
  return { result, loading, error, evaluate };
}
