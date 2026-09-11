import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { ListChecks } from 'lucide-react';

export default function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#f7f9fa] dark:bg-[#14181c] gap-4">
        <div className="w-14 h-14 bg-[#3d7a75] rounded-2xl flex items-center justify-center shadow-md shadow-[#3d7a75]/20 text-white">
          <ListChecks size={28} />
        </div>
        <div className="flex gap-1.5">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="w-2 h-2 rounded-full bg-[#3d7a75] dark:bg-[#5fae9e] animate-pulse"
              style={{ animationDelay: `${i * 0.2}s` }}
            />
          ))}
        </div>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  return children;
}
