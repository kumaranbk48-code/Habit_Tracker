import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import PWAInstallBanner from './components/PWAInstallBanner';

import ErrorBoundary from './components/ErrorBoundary';

const Login = lazy(() => import('./pages/Login'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Habits = lazy(() => import('./pages/Habits'));
const Goals = lazy(() => import('./pages/Goals'));
const Reminders = lazy(() => import('./pages/Reminders'));
const Reports = lazy(() => import('./pages/Reports'));
const CalendarPage = lazy(() => import('./pages/CalendarPage'));
const Profile = lazy(() => import('./pages/Profile'));
const LearningHubDashboard = lazy(() => import('./pages/LearningHubDashboard'));
const LearningJourneyDetail = lazy(() => import('./pages/LearningJourneyDetail'));

import HabizLoader from './components/HabizLoader';

const PageLoader = () => (
  <HabizLoader size="lg" text="Loading HabiZ..." />
);

function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <BrowserRouter>
          <Suspense fallback={<PageLoader />}>
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
          </Suspense>

          {/* PWA install prompt — floats above all content, only appears when installable */}
          <PWAInstallBanner />
        </BrowserRouter>
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default App;
