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
import AdminHome from './pages/admin/AdminHome';
import AdminNotes from './pages/admin/AdminNotes';
import AdminEmployees from './pages/admin/AdminEmployees';
import AdminChecklists from './pages/admin/AdminChecklists';
import AdminTasks from './pages/admin/AdminTasks';
import AdminWix from './pages/admin/AdminWix';

function Gate() {
  const { user, isManager } = useAuth();
  if (!user) return <Login />;
  if (user.mustChangePin) return <FirstLogin />;
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Today />} />
        <Route path="checklist/:id" element={<ChecklistPage />} />
        <Route path="handbook" element={<HandbookList />} />
        <Route path="handbook/:id" element={<HandbookSectionPage />} />
        <Route path="games" element={<Games />} />
        <Route path="profile" element={<Profile />} />
        {isManager && (
          <>
            <Route path="admin" element={<AdminHome />} />
            <Route path="admin/notes" element={<AdminNotes />} />
            <Route path="admin/employees" element={<AdminEmployees />} />
            <Route path="admin/checklists" element={<AdminChecklists />} />
            <Route path="admin/tasks" element={<AdminTasks />} />
            <Route path="admin/wix" element={<AdminWix />} />
          </>
        )}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <HashRouter>
      <AuthProvider>
        <Gate />
      </AuthProvider>
    </HashRouter>
  );
}
