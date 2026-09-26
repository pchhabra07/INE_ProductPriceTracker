import { NavLink } from 'react-router-dom';

// Shared navigation bar used on all pages
export default function Navbar() {
  return (
    <nav className="nav">
      <a className="nav-brand" href="/search">◈ PriceTracker</a>
      <div className="nav-links">
        <NavLink
          to="/search"
          className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
        >
          🔍 Search
        </NavLink>
        <NavLink
          to="/dashboard"
          className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
        >
          📊 Dashboard
        </NavLink>
      </div>
    </nav>
  );
}
