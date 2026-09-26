import { Routes, Route, Navigate } from 'react-router-dom';
import SearchPage from './pages/SearchPage';
import DashboardPage from './pages/DashboardPage';
import ProductDetailPage from './pages/ProductDetailPage';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="/search" element={<SearchPage />} />
      <Route path="/dashboard" element={<DashboardPage />} />
      <Route path="/product/:id" element={<ProductDetailPage />} />
    </Routes>
  );
}
