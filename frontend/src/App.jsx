import { useLocation } from 'react-router-dom';
import Navbar from './components/common/Navbar.jsx';
import Footer from './components/common/Footer.jsx';
import AppRoutes from './routes.jsx';

export default function App() {
  const location = useLocation();
  const isStandalonePublicPage =
    location.pathname === '/' ||
    location.pathname.startsWith('/login') ||
    location.pathname.startsWith('/register') ||
    location.pathname.startsWith('/org/login') ||
    location.pathname.startsWith('/org/register') ||
    location.pathname === '/unauthorized';

  if (isStandalonePublicPage) {
    return <AppRoutes />;
  }

  return (
    <div className="app-shell">
      <Navbar />
      <div className="app-main-column">
        <main id="main-content" className="main-content">
          <AppRoutes />
        </main>
        <Footer />
      </div>
    </div>
  );
}
