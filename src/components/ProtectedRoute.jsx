import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import HabizLoader from './HabizLoader';

export default function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#f7f9fa] dark:bg-[#080d12]">
        <HabizLoader size="fullscreen" text="Loading HabiZ..." />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  return children || <Outlet />;
}
