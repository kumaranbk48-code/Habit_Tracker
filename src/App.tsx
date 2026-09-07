import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Habits from './pages/Habits';
import Goals from './pages/Goals';
import Reminders from './pages/Reminders';
import Reports from './pages/Reports';
import CalendarPage from './pages/CalendarPage';
import Profile from './pages/Profile';
import LearningHubDashboard from './pages/LearningHubDashboard';
import LearningJourneyDetail from './pages/LearningJourneyDetail';
import PWAInstallBanner from './components/PWAInstallBanner';

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={
            <ProtectedRoute><Layout><Dashboard /></Layout></ProtectedRoute>
          } />
          <Route path="/habits" element={
            <ProtectedRoute><Layout><Habits /></Layout></ProtectedRoute>
          } />
          <Route path="/learning" element={
            <ProtectedRoute><Layout><LearningHubDashboard /></Layout></ProtectedRoute>
          } />
          <Route path="/learning/journey/:id" element={
            <ProtectedRoute><Layout><LearningJourneyDetail /></Layout></ProtectedRoute>
          } />
          <Route path="/calendar" element={
            <ProtectedRoute><Layout><CalendarPage /></Layout></ProtectedRoute>
          } />
          <Route path="/goals" element={
            <ProtectedRoute><Layout><Goals /></Layout></ProtectedRoute>
          } />
          <Route path="/reminders" element={
            <ProtectedRoute><Layout><Reminders /></Layout></ProtectedRoute>
          } />
          <Route path="/reports" element={
            <ProtectedRoute><Layout><Reports /></Layout></ProtectedRoute>
          } />
          <Route path="/profile" element={
            <ProtectedRoute><Layout><Profile /></Layout></ProtectedRoute>
          } />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>

        {/* PWA install prompt — floats above all content, only appears when installable */}
        <PWAInstallBanner />
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
