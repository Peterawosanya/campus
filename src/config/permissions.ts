import type { SchoolRole } from '@/types';

export const ROLE_PRIORITY: SchoolRole[] = [
  'platform_admin',
  'school_owner',
  'school_admin',
  'academic_admin',
  'bursar',
  'teacher',
  'parent',
  'student',
];

export const MANAGEMENT_ROLES: SchoolRole[] = [
  'platform_admin',
  'school_owner',
  'school_admin',
];

export const SETTINGS_ROLES: SchoolRole[] = [
  'platform_admin',
  'school_owner',
  'school_admin',
];

export const USERS_ROLES: SchoolRole[] = [
  'platform_admin',
  'school_owner',
  'school_admin',
];

const ROUTE_ROLES: Record<string, SchoolRole[]> = {
  '/dashboard': ROLE_PRIORITY,
  '/users': USERS_ROLES,
  '/settings': SETTINGS_ROLES,
  '/students': ['platform_admin', 'school_owner', 'school_admin', 'academic_admin'],
  '/guardians': ['platform_admin', 'school_owner', 'school_admin', 'academic_admin'],
  '/staff': ['platform_admin', 'school_owner', 'school_admin'],
  '/schools': ['platform_admin', 'school_owner'],
  '/admissions': ['platform_admin', 'school_owner', 'school_admin'],
  '/classes': ['platform_admin', 'school_owner', 'school_admin', 'academic_admin'],
  '/enrollments': ['platform_admin', 'school_owner', 'school_admin', 'academic_admin'],
  '/attendance': ['platform_admin', 'school_owner', 'school_admin', 'academic_admin', 'teacher', 'parent', 'student'],
  '/timetable': ['platform_admin', 'school_owner', 'school_admin', 'academic_admin', 'teacher', 'parent', 'student'],
  '/assessments': ['platform_admin', 'school_owner', 'school_admin', 'academic_admin', 'teacher'],
  '/results': ['platform_admin', 'school_owner', 'school_admin', 'academic_admin', 'teacher', 'parent', 'student'],
  '/report-cards': ['platform_admin', 'school_owner', 'school_admin', 'academic_admin', 'teacher', 'parent', 'student'],
  '/finance': ['platform_admin', 'school_owner', 'school_admin', 'bursar', 'parent'],
  '/announcements': ['platform_admin', 'school_owner', 'school_admin', 'teacher', 'parent', 'student'],
  '/ai': ['platform_admin', 'school_owner', 'school_admin', 'academic_admin', 'teacher'],
};

export function highestRole(roles: SchoolRole[]): SchoolRole | null {
  for (const role of ROLE_PRIORITY) {
    if (roles.includes(role)) return role;
  }
  return null;
}

export function hasAnyRole(userRoles: SchoolRole[], allowed: SchoolRole[]): boolean {
  return userRoles.some((role) => allowed.includes(role));
}

export function canAccessPath(path: string, roles: SchoolRole[]): boolean {
  const allowed = ROUTE_ROLES[path];
  if (!allowed) return roles.length > 0;
  return hasAnyRole(roles, allowed);
}

export function uniqueRoles(roles: SchoolRole[]): SchoolRole[] {
  const set = new Set(roles);
  return ROLE_PRIORITY.filter((role) => set.has(role));
}
