import { createMemoryRouter, Navigate } from 'react-router-dom';
import App from './App';
import { Login } from '@/components/Login';
import { DebugPage } from '@/components/DebugPage';
import Benchmark from './Benchmark';
import ProtectedRoute from '@/components/ProtectedRoute';
import PublicRoute from '@/components/PublicRoute';

export const router = createMemoryRouter([
  {
    path: '/',
    element: <Navigate to="/dashboard" replace />,
  },
  {
    path: '/login',
    element: <PublicRoute><Login /></PublicRoute>,
  },
  {
    path: '/dashboard',
    element: <ProtectedRoute><App /></ProtectedRoute>,
  },
  {
    path: '/debug',
    element: <ProtectedRoute><DebugPage /></ProtectedRoute>,
  },
  {
    path: '/benchmark',
    element: <ProtectedRoute><Benchmark /></ProtectedRoute>,
  },
], {
  initialEntries: ['/dashboard']
});