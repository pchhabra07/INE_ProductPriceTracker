import { NavLink } from 'react-router-dom';
import { Search, LayoutDashboard, Sun, Moon, TrendingUp } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useSearch } from '../../context/SearchContext';

// Shared navigation bar used on all pages
export default function Navbar() {
  const { theme, toggleTheme } = useTheme();
  const { openSearch } = useSearch();

  return (
    <nav className="nav">
      <NavLink className="nav-brand" to="/dashboard">
        <TrendingUp size={20} className="nav-brand-icon" />
        <span>PriceTracker</span>
      </NavLink>

      <div className="nav-links">
        <button
          type="button"
          className="nav-link nav-search-trigger"
          onClick={openSearch}
          title="Search products (Ctrl+K)"
        >
          <Search size={15} />
          <span>Search</span>
          <kbd className="nav-kbd-pill">Ctrl+K</kbd>
        </button>

        <NavLink
          to="/dashboard"
          className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
        >
          <LayoutDashboard size={15} />
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
