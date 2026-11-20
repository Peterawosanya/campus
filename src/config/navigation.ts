import type { SchoolRole } from '@/types';
import {
  LayoutDashboard,
  Users,
  GraduationCap,
  BookOpen,
  CalendarDays,
  ClipboardCheck,
  DollarSign,
  MessageSquare,
  Sparkles,
  Settings,
  School,
  UserCog,
  FileText,
  UsersRound,
  ArrowRightLeft,
  Award,
  FileCheck2,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  label: string;
  path: string;
  icon: LucideIcon;
  roles: SchoolRole[];
  badge?: string;
}

export interface NavSection {
  label: string;
  items: NavItem[];
}

export const navSections: NavSection[] = [
  {
    label: 'Overview',
    items: [
      {
        label: 'Dashboard',
        path: '/dashboard',
        icon: LayoutDashboard,
        roles: ['platform_admin', 'school_owner', 'school_admin', 'academic_admin', 'bursar', 'teacher', 'parent', 'student'],
      },
    ],
  },
  {
    label: 'Administration',
    items: [
      {
        label: 'Students',
        path: '/students',
        icon: GraduationCap,
        roles: ['platform_admin', 'school_owner', 'school_admin', 'academic_admin'],
      },
      {
        label: 'Guardians',
        path: '/guardians',
        icon: UsersRound,
        roles: ['platform_admin', 'school_owner', 'school_admin', 'academic_admin'],
      },
      {
        label: 'Staff',
        path: '/staff',
        icon: UserCog,
        roles: ['platform_admin', 'school_owner', 'school_admin'],
      },
      {
        label: 'Schools',
        path: '/schools',
        icon: School,
        roles: ['platform_admin', 'school_owner'],
      },
      {
        label: 'Admissions',
        path: '/admissions',
        icon: FileText,
        roles: ['platform_admin', 'school_owner', 'school_admin'],
      },
    ],
  },
  {
    label: 'Academics',
    items: [
      {
        label: 'Classes & Subjects',
        path: '/classes',
        icon: BookOpen,
        roles: ['platform_admin', 'school_owner', 'school_admin', 'academic_admin'],
      },
      {
        label: 'Enrolments',
        path: '/enrollments',
        icon: ArrowRightLeft,
        roles: ['platform_admin', 'school_owner', 'school_admin', 'academic_admin'],
      },
      {
        label: 'Attendance',
        path: '/attendance',
        icon: ClipboardCheck,
        roles: ['platform_admin', 'school_owner', 'school_admin', 'academic_admin', 'teacher', 'parent', 'student'],
      },
      {
        label: 'Timetable',
        path: '/timetable',
        icon: CalendarDays,
        roles: ['platform_admin', 'school_owner', 'school_admin', 'academic_admin', 'teacher', 'parent', 'student'],
      },
      {
        label: 'Assessments',
        path: '/assessments',
        icon: FileText,
        roles: ['platform_admin', 'school_owner', 'school_admin', 'academic_admin', 'teacher'],
      },
      {
        label: 'Results',
        path: '/results',
        icon: Award,
        roles: ['platform_admin', 'school_owner', 'school_admin', 'academic_admin', 'teacher', 'parent', 'student'],
      },
      {
        label: 'Report Cards',
        path: '/report-cards',
        icon: FileCheck2,
        roles: ['platform_admin', 'school_owner', 'school_admin', 'academic_admin', 'teacher', 'parent', 'student'],
      },
    ],
  },
  {
    label: 'Finance',
    items: [
      {
        label: 'Fees & Invoices',
        path: '/finance',
        icon: DollarSign,
        roles: ['platform_admin', 'school_owner', 'school_admin', 'bursar'],
      },
    ],
  },
  {
    label: 'Communication',
    items: [
      {
        label: 'Announcements',
        path: '/announcements',
        icon: MessageSquare,
        roles: ['platform_admin', 'school_owner', 'school_admin', 'teacher', 'parent', 'student'],
      },
    ],
  },
  {
    label: 'Intelligence',
    items: [
      {
        label: 'AI Assistant',
        path: '/ai',
        icon: Sparkles,
        roles: ['platform_admin', 'school_owner', 'school_admin', 'academic_admin', 'teacher'],
        badge: 'New',
      },
    ],
  },
  {
    label: 'System',
    items: [
      {
        label: 'Settings',
        path: '/settings',
        icon: Settings,
        roles: ['platform_admin', 'school_owner', 'school_admin'],
      },
      {
        label: 'Users & Roles',
        path: '/users',
        icon: Users,
        roles: ['platform_admin', 'school_owner', 'school_admin'],
      },
    ],
  },
];

export function getNavItemsForRole(role: SchoolRole | null): NavSection[] {
  return getNavItemsForRoles(role ? [role] : []);
}

/** Union of nav items the user may see across all assigned school roles. */
export function getNavItemsForRoles(roles: SchoolRole[]): NavSection[] {
  if (roles.length === 0) return [];
  return navSections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => roles.some((role) => item.roles.includes(role))),
    }))
    .filter((section) => section.items.length > 0);
}
