import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type { UserProfile, SchoolMembership, School, SchoolRole } from '@/types';
import { highestRole, uniqueRoles } from '@/config/permissions';

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  profile: UserProfile | null;
  memberships: (SchoolMembership & { schools?: School })[];
  activeSchool: School | null;
  activeRole: SchoolRole | null;
  activeRoles: SchoolRole[];
  loading: boolean;
  setActiveSchoolId: (schoolId: string) => void;
  setActiveRole: (role: SchoolRole) => void;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string, firstName: string, lastName: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const ACTIVE_SCHOOL_KEY = 'campusos_active_school';
const ACTIVE_ROLE_KEY = 'campusos_active_role';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [memberships, setMemberships] = useState<(SchoolMembership & { schools?: School })[]>([]);
  const [activeSchoolId, setActiveSchoolIdState] = useState<string | null>(null);
  const [activeRoleState, setActiveRoleState] = useState<SchoolRole | null>(null);
  const [loading, setLoading] = useState(true);

  const loadUserData = async (userId: string) => {
    const { data: profileData } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    const { data: membershipData } = await supabase
      .from('school_memberships')
      .select('*, schools(*)')
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('joined_at', { ascending: true });

    const rows = (membershipData as (SchoolMembership & { schools?: School })[]) ?? [];
    setProfile(profileData as UserProfile | null);
    setMemberships(rows);

    const schools = rows.map((m) => m.schools).filter(Boolean) as School[];
    const uniqueSchoolIds = [...new Set(schools.map((s) => s.id))];
    const storedSchool = localStorage.getItem(ACTIVE_SCHOOL_KEY);
    const nextSchoolId =
      storedSchool && uniqueSchoolIds.includes(storedSchool)
        ? storedSchool
        : uniqueSchoolIds[0] ?? null;

    setActiveSchoolIdState(nextSchoolId);

    const rolesForSchool = uniqueRoles(
      rows.filter((m) => m.school_id === nextSchoolId).map((m) => m.role),
    );
    const storedRole = localStorage.getItem(ACTIVE_ROLE_KEY) as SchoolRole | null;
    const nextRole =
      storedRole && rolesForSchool.includes(storedRole)
        ? storedRole
        : highestRole(rolesForSchool);

    setActiveRoleState(nextRole);
  };

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data: { session: s } }) => {
      if (!mounted) return;
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        loadUserData(s.user.id).finally(() => mounted && setLoading(false));
      } else {
        setLoading(false);
      }
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, s) => {
      (async () => {
        setSession(s);
        setUser(s?.user ?? null);
        if (s?.user) {
          await loadUserData(s.user.id);
        } else {
          setProfile(null);
          setMemberships([]);
          setActiveSchoolIdState(null);
          setActiveRoleState(null);
        }
        setLoading(false);
      })();
    });

    return () => {
      mounted = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

  const setActiveSchoolId = (schoolId: string) => {
    localStorage.setItem(ACTIVE_SCHOOL_KEY, schoolId);
    setActiveSchoolIdState(schoolId);
    const rolesForSchool = uniqueRoles(
      memberships.filter((m) => m.school_id === schoolId).map((m) => m.role),
    );
    const nextRole = highestRole(rolesForSchool);
    setActiveRoleState(nextRole);
    if (nextRole) localStorage.setItem(ACTIVE_ROLE_KEY, nextRole);
    else localStorage.removeItem(ACTIVE_ROLE_KEY);
  };

  const setActiveRole = (role: SchoolRole) => {
    localStorage.setItem(ACTIVE_ROLE_KEY, role);
    setActiveRoleState(role);
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  };

  const signUp = async (email: string, password: string, firstName: string, lastName: string) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { first_name: firstName, last_name: lastName } },
    });
    if (error) return { error: error.message };
    if (data.user) {
      await loadUserData(data.user.id);
    }
    return { error: null };
  };

  const signOut = async () => {
    localStorage.removeItem(ACTIVE_SCHOOL_KEY);
    localStorage.removeItem(ACTIVE_ROLE_KEY);
    await supabase.auth.signOut();
    setProfile(null);
    setMemberships([]);
    setActiveSchoolIdState(null);
    setActiveRoleState(null);
  };

  const refresh = async () => {
    if (user) await loadUserData(user.id);
  };

  const activeSchool = memberships.find((m) => m.school_id === activeSchoolId)?.schools ?? null;
  const activeRoles = uniqueRoles(
    memberships.filter((m) => m.school_id === activeSchoolId).map((m) => m.role),
  );
  const activeRole =
    activeRoleState && activeRoles.includes(activeRoleState)
      ? activeRoleState
      : highestRole(activeRoles);

  return (
    <AuthContext.Provider
      value={{
        session,
        user,
        profile,
        memberships,
        activeSchool,
        activeRole,
        activeRoles,
        loading,
        setActiveSchoolId,
        setActiveRole,
        signIn,
        signUp,
        signOut,
        refresh,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
