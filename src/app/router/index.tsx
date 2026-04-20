import { Navigate, Route, Routes } from 'react-router-dom';

import { AppLayout } from '../layouts/AppLayout';
import { CalendarPage } from '../../pages/CalendarPage';
import { LoginPage } from '../../pages/LoginPage';
import { NotFoundPage } from '../../pages/NotFoundPage';

function RootRedirect() {
  return <Navigate to="/login" replace />;
}

export function AppRouter() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<RootRedirect />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/calendario" element={<CalendarPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
