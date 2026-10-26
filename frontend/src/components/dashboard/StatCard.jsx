export default function StatCard({ label, value, detail }) {
  return <article className="stat-card"><span className="stat-label">{label}</span><strong className="stat-value">{value}</strong>{detail && <span className="stat-detail">{detail}</span>}</article>;
}
