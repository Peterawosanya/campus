import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Avatar } from '@/components/ui/Avatar';
import { SkeletonCard, EmptyState } from '@/components/ui/EmptyState';
import { useToast } from '@/components/ui/Toast';
import { supabase } from '@/lib/supabase';
import { formatDate, timeAgo, cn } from '@/lib/utils';
import {
  Users,
  GraduationCap,
  BookOpen,
  DollarSign,
  ClipboardCheck,
  FileText,
  Activity,
  Calendar,
  ArrowUpRight,
  ArrowDownRight,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';

interface DashboardStats {
  totalStudents: number;
  activeTeachers: number;
  classCount: number;
  staffCount: number;
  pendingAdmissions: number;
  auditCount: number;
}

interface ActivityItem {
  id: string;
  action: string;
  entity_type: string | null;
  created_at: string;
  actor_user_id: string | null;
  profiles?: { first_name: string; last_name: string } | null;
}

interface StatCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  trend?: { value: string; up: boolean };
  color: 'primary' | 'success' | 'warning' | 'error' | 'navy';
  loading?: boolean;
}

const colorStyles = {
  primary: 'bg-primary-50 text-primary-600',
  success: 'bg-success-50 text-success-600',
  warning: 'bg-warning-50 text-warning-600',
  error: 'bg-error-50 text-error-600',
  navy: 'bg-navy-50 text-navy-500',
};

function StatCard({ title, value, icon: Icon, trend, color, loading }: StatCardProps) {
  if (loading) return <SkeletonCard />;
  return (
    <Card className="transition-shadow hover:shadow-card-hover">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-slate-500">{title}</p>
          <p className="mt-2 text-3xl font-bold font-display text-navy-500">{value}</p>
          {trend && (
            <div className="mt-2 flex items-center gap-1 text-xs">
              {trend.up ? (
                <ArrowUpRight className="h-3.5 w-3.5 text-success-600" />
              ) : (
                <ArrowDownRight className="h-3.5 w-3.5 text-error-500" />
              )}
              <span className={trend.up ? 'text-success-600' : 'text-error-500'}>{trend.value}</span>
              <span className="text-slate-400">vs last term</span>
            </div>
          )}
        </div>
        <div className={cn('flex h-11 w-11 items-center justify-center rounded-xl', colorStyles[color])}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </Card>
  );
}

export function AdminDashboard() {
  const { activeSchool, profile } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [staffList, setStaffList] = useState<{ id: string; user_id: string | null; full_name: string | null; designation: string | null; created_at: string }[]>([]);

  useEffect(() => {
    if (!activeSchool) return;
    let cancelled = false;

    async function loadDashboard() {
      if (!activeSchool) return;
      setLoading(true);

      const [staffRes, membershipsRes, auditRes, studentRes, classRes, admissionRes] = await Promise.all([
        supabase
          .from('staff_profiles')
          .select('id, user_id, full_name, designation, created_at', { count: 'exact' })
          .eq('school_id', activeSchool.id)
          .eq('status', 'active')
          .order('created_at', { ascending: false })
          .limit(5),
        supabase
          .from('school_memberships')
          .select('role, user_id', { count: 'exact' })
          .eq('school_id', activeSchool.id)
          .eq('is_active', true),
        supabase
          .from('audit_logs')
          .select('id, action, entity_type, created_at, actor_user_id')
          .eq('school_id', activeSchool.id)
          .order('created_at', { ascending: false })
          .limit(8),
        supabase.from('students').select('id', { count: 'exact', head: true }).eq('school_id', activeSchool.id),
        supabase.from('classes').select('id', { count: 'exact', head: true }).eq('school_id', activeSchool.id),
        supabase.from('admissions').select('id', { count: 'exact', head: true }).eq('school_id', activeSchool.id).eq('status', 'pending'),
      ]);

      if (cancelled) return;
      for (const result of [staffRes, membershipsRes, auditRes, studentRes, classRes, admissionRes]) {
        if (result.error) toast(result.error.message, 'error');
      }

      const activeStaffUserIds = new Set((staffRes.data ?? []).map((staff) => staff.user_id).filter((id): id is string => Boolean(id)));
      const teacherCount = (membershipsRes.data ?? []).filter((m) => m.role === 'teacher' && activeStaffUserIds.has(m.user_id)).length;
      const totalMembers = membershipsRes.count ?? 0;

      setStats({
        totalStudents: studentRes.count ?? 0,
        activeTeachers: teacherCount,
        classCount: classRes.count ?? 0,
        staffCount: totalMembers,
        pendingAdmissions: admissionRes.count ?? 0,
        auditCount: auditRes.count ?? 0,
      });

      const activityRows = (auditRes.data ?? []) as Omit<ActivityItem, 'profiles'>[];
      const actorIds = [...new Set(activityRows.map((item) => item.actor_user_id).filter((id): id is string => Boolean(id)))];
      const actorResult = actorIds.length
        ? await supabase.from('user_profiles').select('id,first_name,last_name').in('id', actorIds)
        : { data: [], error: null };
      if (actorResult.error) toast(actorResult.error.message, 'error');
      const actors = new Map((actorResult.data ?? []).map((actor) => [actor.id, actor]));
      setActivities(activityRows.map((item) => ({
        ...item,
        profiles: item.actor_user_id ? actors.get(item.actor_user_id) ?? null : null,
      })));
      setStaffList((staffRes.data as typeof staffList) ?? []);
      setLoading(false);
    }

    loadDashboard();
    return () => { cancelled = true; };
  }, [activeSchool, toast]);

  if (!activeSchool) {
    return (
      <EmptyState
        icon={<BookOpen className="h-7 w-7" />}
        title="No school selected"
        description="You don't have access to any school yet. Ask an administrator to add you."
      />
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-display text-navy-500">
            Welcome back, {profile?.first_name}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {activeSchool.name} — {formatDate(new Date(), { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="success">School Active</Badge>
          <Badge variant="navy">{activeSchool.currency}</Badge>
        </div>
      </div>

      {/* AI Insight banner */}
      <Card className="bg-gradient-to-r from-navy-500 to-navy-600 text-white border-0">
        <div className="flex items-start gap-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-500 flex-shrink-0">
            <Sparkles className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <h3 className="text-base font-semibold text-white">AI Insights</h3>
            <p className="mt-1 text-sm text-navy-100">
              Your school platform is set up and ready. As you add students, record attendance, and enter assessment scores, AI-powered insights will appear here to help you track performance trends and identify students who may need additional support.
            </p>
          </div>
        </div>
      </Card>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Students"
          value={stats?.totalStudents ?? 0}
          icon={GraduationCap}
          color="primary"
          loading={loading}
        />
        <StatCard
          title="Active Teachers"
          value={stats?.activeTeachers ?? 0}
          icon={Users}
          color="success"
          loading={loading}
        />
        <StatCard
          title="School Members"
          value={stats?.staffCount ?? 0}
          icon={BookOpen}
          color="navy"
          loading={loading}
        />
        <StatCard
          title="Pending Admissions"
          value={stats?.pendingAdmissions ?? 0}
          icon={FileText}
          color="warning"
          loading={loading}
        />
      </div>

      {/* Second row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent activity */}
        <Card className="lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-base font-semibold text-navy-500">Recent Activity</h3>
              <p className="text-sm text-slate-500 mt-0.5">Latest actions across the school</p>
            </div>
            <Activity className="h-5 w-5 text-slate-400" />
          </div>

          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-full bg-slate-200 animate-pulse" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3 w-40 rounded bg-slate-200 animate-pulse" />
                    <div className="h-2 w-20 rounded bg-slate-100 animate-pulse" />
                  </div>
                </div>
              ))}
            </div>
          ) : activities.length === 0 ? (
            <EmptyState
              icon={<Activity className="h-7 w-7" />}
              title="No activity yet"
              description="Actions taken by school staff will appear here as an audit trail."
            />
          ) : (
            <div className="space-y-1">
              {activities.map((item) => (
                <div key={item.id} className="flex items-center gap-3 py-2.5 px-2 -mx-2 rounded-lg hover:bg-slate-50 transition-colors">
                  <Avatar
                    firstName={item.profiles?.first_name ?? 'S'}
                    lastName={item.profiles?.last_name ?? ''}
                    size="sm"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-navy-500">
                      <span className="font-medium">
                        {item.profiles?.first_name} {item.profiles?.last_name}
                      </span>{' '}
                      <span className="text-slate-500">{item.action}</span>
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {item.entity_type && <span className="capitalize">{item.entity_type} · </span>}
                      {timeAgo(item.created_at)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Quick stats sidebar */}
        <div className="space-y-6">
          {/* School info */}
          <Card>
            <h3 className="text-base font-semibold text-navy-500 mb-3">School Information</h3>
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-slate-500">Type</dt>
                <dd className="font-medium text-navy-500 capitalize">{activeSchool.type}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Currency</dt>
                <dd className="font-medium text-navy-500">{activeSchool.currency}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Timezone</dt>
                <dd className="font-medium text-navy-500">{activeSchool.timezone}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Country</dt>
                <dd className="font-medium text-navy-500">{activeSchool.country}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Created</dt>
                <dd className="font-medium text-navy-500">{formatDate(activeSchool.created_at)}</dd>
              </div>
            </dl>
          </Card>

          {/* Staff list */}
          <Card>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-semibold text-navy-500">Recent Staff</h3>
              <Users className="h-5 w-5 text-slate-400" />
            </div>
            {staffList.length === 0 ? (
              <p className="text-sm text-slate-500 py-4 text-center">No staff registered yet.</p>
            ) : (
              <div className="space-y-2">
                {staffList.map((s) => (
                  <div key={s.id} className="flex items-center gap-3">
                    <Avatar
                      firstName={s.full_name?.split(' ')[0] ?? 'S'}
                      lastName={s.full_name?.split(' ').slice(1).join(' ') ?? ''}
                      size="sm"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-navy-500 truncate">
                        {s.full_name ?? 'Staff member'}
                      </p>
                      <p className="text-xs text-slate-500">{s.designation ?? 'Staff'}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* Placeholder row for upcoming features */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-dashed border-2 border-slate-200 bg-slate-50/50">
          <div className="flex items-center gap-3 text-slate-400">
            <ClipboardCheck className="h-5 w-5" />
            <div>
              <p className="text-sm font-medium text-slate-500">Today's Attendance</p>
              <p className="text-xs">Available in Milestone 3</p>
            </div>
          </div>
        </Card>
        <Card className="border-dashed border-2 border-slate-200 bg-slate-50/50">
          <div className="flex items-center gap-3 text-slate-400">
            <DollarSign className="h-5 w-5" />
            <div>
              <p className="text-sm font-medium text-slate-500">Outstanding Fees</p>
              <p className="text-xs">Available in Milestone 5</p>
            </div>
          </div>
        </Card>
        <Card className="border-dashed border-2 border-slate-200 bg-slate-50/50">
          <div className="flex items-center gap-3 text-slate-400">
            <Calendar className="h-5 w-5" />
            <div>
              <p className="text-sm font-medium text-slate-500">Upcoming Events</p>
              <p className="text-xs">Available in Milestone 3</p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
