import { Link } from 'react-router-dom';

export default function Home() {
  return <main className="main-content public-home">
    <header className="page-header"><div className="page-header-copy"><span className="eyebrow">TENDERBRIDGE · PROCUREMENT WORKSPACE</span><h1>Find the right opportunity. Bid with confidence.</h1><p className="page-description">A single workspace for discovering tenders, checking business eligibility, and keeping applications on track.</p></div><div className="button-row"><Link className="button button-primary" to="/business/tenders">Explore tenders</Link><Link className="button button-secondary" to="/register">Create account</Link></div></header>
    <section className="stat-grid"><article className="stat-card"><span className="stat-label">DISCOVER</span><strong className="stat-value">01</strong><span className="stat-detail">Search a central tender catalogue</span></article><article className="stat-card"><span className="stat-label">ASSESS</span><strong className="stat-value">02</strong><span className="stat-detail">Compare requirements with your profile</span></article><article className="stat-card"><span className="stat-label">TRACK</span><strong className="stat-value">03</strong><span className="stat-detail">Keep application progress organized</span></article></section>
  </main>;
}
