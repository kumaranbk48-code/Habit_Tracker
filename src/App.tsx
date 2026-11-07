import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
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
const PrivacyPolicy = lazy(() => import('./pages/PrivacyPolicy'));
const TermsOfService = lazy(() => import('./pages/TermsOfService'));
const NotFound = lazy(() => import('./pages/NotFound'));

import HabizLoader from './components/HabizLoader';

const PageLoader = () => (
  <div className="flex flex-col items-center justify-center min-h-screen bg-[#f7f9fa] dark:bg-[#080d12]">
    <HabizLoader size="fullscreen" text="Loading HabiZ..." />
  </div>
);

function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <BrowserRouter>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/login" element={<Login />} />

              {/* Authenticated Application Routes sharing persistent Layout & Scheduler */}
              <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
                <Route path="/" element={<Dashboard />} />
                <Route path="/habits" element={<Habits />} />
                <Route path="/learning" element={<LearningHubDashboard />} />
                <Route path="/learning/journey/:id" element={<LearningJourneyDetail />} />
                <Route path="/calendar" element={<CalendarPage />} />
                <Route path="/goals" element={<Goals />} />
                <Route path="/reminders" element={<Reminders />} />
                <Route path="/reports" element={<Reports />} />
                <Route path="/profile" element={<Profile />} />
              </Route>

              {/* Public Legal & Informational Pages */}
              <Route path="/privacy" element={<PrivacyPolicy />} />
              <Route path="/terms" element={<TermsOfService />} />
              {/* 404 Not Found Catch-All */}
              <Route path="/404" element={<NotFound />} />
              <Route path="*" element={<NotFound />} />
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
