import { lazy, Suspense, useEffect } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import PublicPortfolio from './PublicPortfolio.jsx';

const AdminApp = lazy(() => import('./admin/AdminApp.jsx'));
const SignInPage = lazy(() => import('./pages/UserAuth.jsx').then((module) => ({ default: module.SignInPage })));
const RegisterPage = lazy(() => import('./pages/UserAuth.jsx').then((module) => ({ default: module.RegisterPage })));
const ForgotPasswordPage = lazy(() => import('./pages/UserAuth.jsx').then((module) => ({ default: module.ForgotPasswordPage })));
const ResetPasswordPage = lazy(() => import('./pages/UserAuth.jsx').then((module) => ({ default: module.ResetPasswordPage })));
const UserAuthCallback = lazy(() => import('./pages/UserAuth.jsx').then((module) => ({ default: module.UserAuthCallback })));

function AdminLoading() {
  return (
    <div className="adm-loading" aria-live="polite" aria-busy="true">
      <div className="feeder" aria-label="Loading dashboard">
        <div style={{ '--delay': 0 }} />
        <div style={{ '--delay': 0.25 }} />
        <div style={{ '--delay': 0.5 }} />
      </div>
      <span className="adm-loading-text">Loading dashboard</span>
    </div>
  );
}

function AuthLoading() {
  return <main className="user-auth-page" aria-live="polite" aria-busy="true">Loading account page…</main>;
}

export default function App() {
  const location = useLocation();
  useEffect(() => {
    const titles = {
      '/signin': 'Login | Kishan C',
      '/register': 'Create account | Kishan C',
      '/forgot-password': 'Reset password | Kishan C',
      '/reset-password': 'Choose new password | Kishan C',
      '/auth/callback': 'Finishing sign-in | Kishan C',
    };
    document.title = location.pathname.startsWith('/admin')
      ? 'Portfolio CMS | Kishan C'
      : titles[location.pathname] || 'Kishan C | Computer Science Engineer';
  }, [location.pathname]);
  return (
    <Routes>
      <Route path="/admin/*" element={<Suspense fallback={<AdminLoading />}><AdminApp /></Suspense>} />
      <Route path="/signin" element={<Suspense fallback={<AuthLoading />}><SignInPage /></Suspense>} />
      <Route path="/register" element={<Suspense fallback={<AuthLoading />}><RegisterPage /></Suspense>} />
      <Route path="/forgot-password" element={<Suspense fallback={<AuthLoading />}><ForgotPasswordPage /></Suspense>} />
      <Route path="/reset-password" element={<Suspense fallback={<AuthLoading />}><ResetPasswordPage /></Suspense>} />
      <Route path="/auth/callback" element={<Suspense fallback={<AuthLoading />}><UserAuthCallback /></Suspense>} />
      <Route path="/*" element={<PublicPortfolio />} />
    </Routes>
  );
}
