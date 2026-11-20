import { Navigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { hasAnyRole } from '@/config/permissions';
import type { SchoolRole } from '@/types';

export function RequireRole({
  roles,
  children,
}: {
  roles: SchoolRole[];
  children: React.ReactNode;
}) {
  const { activeRoles, loading } = useAuth();

  if (loading) return null;

  if (!hasAnyRole(activeRoles, roles)) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}
