import { NavLink } from 'react-router-dom';
import { Search, LayoutDashboard, Sun, Moon, TrendingUp } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';

// Shared navigation bar used on all pages
export default function Navbar() {
  const { theme, toggleTheme } = useTheme();

  return (
    <nav className="nav">
      <NavLink className="nav-brand" to="/dashboard">
        <TrendingUp size={20} className="nav-brand-icon" />
        <span>PriceTracker</span>
      </NavLink>

      <div className="nav-links">
        <NavLink
          to="/search"
          className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
        >
          <Search size={16} />
          <span>Search</span>
        </NavLink>
        <NavLink
          to="/dashboard"
          className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
        >
          <LayoutDashboard size={16} />
          <span>Dashboard</span>
        </NavLink>
      </div>

      <div className="nav-actions">
        <button
          type="button"
          className="theme-toggle-btn"
          onClick={toggleTheme}
          aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
        </button>
      </div>
    </nav>
  );
}
