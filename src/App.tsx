import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './lib/auth';
import { Layout } from './components/Layout';
import Login from './pages/Login';
import FirstLogin from './pages/FirstLogin';
import Today from './pages/Today';
import ChecklistPage from './pages/ChecklistPage';
import { HandbookList, HandbookSectionPage } from './pages/Handbook';
import Games from './pages/Games';
import Profile from './pages/Profile';
import ReservationsPage from './pages/ReservationsPage';
import AdminHome from './pages/admin/AdminHome';
import AdminNotes from './pages/admin/AdminNotes';
import AdminEmployees from './pages/admin/AdminEmployees';
import AdminChecklists from './pages/admin/AdminChecklists';
import AdminTasks from './pages/admin/AdminTasks';
import AdminWix from './pages/admin/AdminWix';
import AdminInventory from './pages/admin/AdminInventory';
import InventoryPage from './pages/InventoryPage';
import SchedulePage from './pages/SchedulePage';
import ScheduleRequestPage from './pages/ScheduleRequestPage';
import AdminSchedule from './pages/admin/AdminSchedule';
import TipsPage from './pages/TipsPage';
import { ErrorBoundary } from './components/ErrorBoundary';
import { LangProvider } from './lib/i18n';

function Gate() {
  const { user, isManager, canEditInventory } = useAuth();
  if (!user) return <Login />;
  if (user.mustChangePin) return <FirstLogin />;
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Today />} />
        <Route path="checklist/:id" element={<ChecklistPage />} />
        <Route path="reservations" element={<ReservationsPage />} />
        <Route path="tips" element={<TipsPage />} />
        <Route path="schedule" element={<SchedulePage />} />
        <Route path="schedule/request" element={<ScheduleRequestPage />} />
        <Route path="inventory" element={<InventoryPage />} />
        <Route path="handbook" element={<HandbookList />} />
        <Route path="handbook/:id" element={<HandbookSectionPage />} />
        <Route path="games" element={<Games />} />
        <Route path="profile" element={<Profile />} />
        {canEditInventory && (
          <>
            <Route path="admin" element={<AdminHome />} />
            <Route path="admin/inventory" element={<AdminInventory />} />
          </>
        )}
        {isManager && (
          <>
            <Route path="admin/notes" element={<AdminNotes />} />
            <Route path="admin/employees" element={<AdminEmployees />} />
            <Route path="admin/checklists" element={<AdminChecklists />} />
            <Route path="admin/tasks" element={<AdminTasks />} />
            <Route path="admin/schedule" element={<AdminSchedule />} />
            <Route path="admin/wix" element={<AdminWix />} />
          </>
        )}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

function LangGate() {
  const { user } = useAuth();
  return (
    <LangProvider userId={user?.id ?? null}>
      <Gate />
    </LangProvider>
  );
}

export default function App() {
  return (
    <ErrorBoundary resetKey="app">
      <HashRouter>
        <AuthProvider>
          <LangGate />
        </AuthProvider>
      </HashRouter>
    </ErrorBoundary>
  );
}
