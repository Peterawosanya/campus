export type SchoolRole =
  | 'platform_admin'
  | 'school_owner'
  | 'school_admin'
  | 'academic_admin'
  | 'bursar'
  | 'teacher'
  | 'parent'
  | 'student';

export type SchoolType = 'primary' | 'secondary' | 'both';

export interface School {
  id: string;
  name: string;
  short_name: string | null;
  type: SchoolType;
  country: string;
  currency: string;
  timezone: string;
  phone_country_code: string;
  address: string | null;
  logo_url: string | null;
  is_active: boolean;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Campus {
  id: string;
  school_id: string;
  name: string;
  address: string | null;
  is_active: boolean;
  created_at: string;
}

export interface UserProfile {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  avatar_url: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface SchoolMembership {
  id: string;
  school_id: string;
  user_id: string;
  role: SchoolRole;
  is_active: boolean;
  invited_by: string | null;
  joined_at: string;
  created_at: string;
}

export interface StaffProfile {
  id: string;
  school_id: string;
  user_id: string;
  employee_id: string | null;
  designation: string | null;
  department: string | null;
  employment_type: string | null;
  joined_on: string | null;
  is_active: boolean;
  created_at: string;
}

export interface SchoolSettings {
  school_id: string;
  settings: Record<string, unknown>;
  updated_at: string;
}

export interface AuditLog {
  id: string;
  school_id: string | null;
  actor_user_id: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  details: Record<string, unknown>;
  created_at: string;
}

export interface MembershipWithSchool extends SchoolMembership {
  schools?: School;
}

export const ROLE_LABELS: Record<SchoolRole, string> = {
  platform_admin: 'Platform Administrator',
  school_owner: 'School Owner',
  school_admin: 'School Administrator',
  academic_admin: 'Academic Administrator',
  bursar: 'Bursar / Accountant',
  teacher: 'Teacher',
  parent: 'Parent / Guardian',
  student: 'Student',
};

export const ROLE_SHORT_LABELS: Record<SchoolRole, string> = {
  platform_admin: 'Super Admin',
  school_owner: 'Owner',
  school_admin: 'Admin',
  academic_admin: 'Academic',
  bursar: 'Bursar',
  teacher: 'Teacher',
  parent: 'Parent',
  student: 'Student',
};

export const SCHOOL_TYPE_LABELS: Record<SchoolType, string> = {
  primary: 'Primary School',
  secondary: 'Secondary School',
  both: 'Primary & Secondary',
};
