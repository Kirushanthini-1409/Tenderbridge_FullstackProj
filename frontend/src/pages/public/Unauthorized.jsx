import { Link } from 'react-router-dom';
export default function Unauthorized() { return <section className="panel"><span className="eyebrow">ACCESS REQUIRED</span><h1>Sign in to continue</h1><p>This workspace requires an authenticated account with the appropriate role.</p><Link className="button button-primary" to="/login">Go to sign in</Link></section>; }
