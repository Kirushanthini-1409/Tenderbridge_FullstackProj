import { createContext, useContext, useMemo, useState } from 'react';
const TenderContext = createContext(null);
export function TenderProvider({ children }) {
  const [filters, setFilters] = useState({ search: '', category: '', deadlineFrom: '', deadlineTo: '' });
  const value = useMemo(() => ({ filters, setFilters, clearFilters: () => setFilters({ search: '', category: '', deadlineFrom: '', deadlineTo: '' }) }), [filters]);
  return <TenderContext.Provider value={value}>{children}</TenderContext.Provider>;
}
export function useTenderContext() { const value = useContext(TenderContext); if (!value) throw new Error('useTenderContext must be used within TenderProvider'); return value; }
