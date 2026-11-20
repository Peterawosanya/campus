import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { useAuth } from '@/context/AuthContext';
import { formatDate } from '@/lib/utils';
import { ROLE_LABELS } from '@/types';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/components/ui/Toast';
import {
  BookOpen,
  CalendarDays,
  ClipboardCheck,
  DollarSign,
  FileText,
  GraduationCap,
  Sparkles,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

function DashboardHeader({ title, subtitle }: { title: string; subtitle: string }) {
  const { activeSchool, activeRole } = useAuth();
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold font-display text-navy-500">{title}</h1>
        <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
      </div>
      <div className="flex items-center gap-2">
        {activeSchool && <Badge variant="success">{activeSchool.name}</Badge>}
        {activeRole && <Badge variant="navy">{ROLE_LABELS[activeRole]}</Badge>}
      </div>
    </div>
  );
}

function ComingSoonCard({
  title,
  milestone,
  icon: Icon,
}: {
  title: string;
  milestone: string;
  icon: LucideIcon;
}) {
  return (
    <Card className="border-dashed border-2 border-slate-200 bg-slate-50/50">
      <div className="flex items-center gap-3 text-slate-400">
        <Icon className="h-5 w-5" />
        <div>
          <p className="text-sm font-medium text-slate-500">{title}</p>
          <p className="text-xs">{milestone}</p>
        </div>
      </div>
    </Card>
  );
}

function NoSchool() {
  return (
    <EmptyState
      icon={<BookOpen className="h-7 w-7" />}
      title="No school selected"
      description="You don't have access to any school yet. Ask an administrator to add you."
    />
  );
}

export function OwnerDashboard() {
  const { activeSchool, profile, memberships } = useAuth();
  if (!activeSchool) return <NoSchool />;
  const schoolMembers = memberships.filter((m) => m.school_id === activeSchool.id);

  return (
    <div className="space-y-6 animate-fade-in">
      <DashboardHeader
        title={`School overview, ${profile?.first_name}`}
        subtitle={`${activeSchool.name} — operational snapshot for owners`}
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <p className="text-sm text-slate-500">School members</p>
          <p className="mt-2 text-3xl font-bold font-display text-navy-500">{schoolMembers.length}</p>
        </Card>
        <Card>
          <p className="text-sm text-slate-500">Currency</p>
          <p className="mt-2 text-3xl font-bold font-display text-navy-500">{activeSchool.currency}</p>
        </Card>
        <Card>
          <p className="text-sm text-slate-500">Type</p>
          <p className="mt-2 text-xl font-bold font-display text-navy-500 capitalize">{activeSchool.type}</p>
        </Card>
        <Card>
          <p className="text-sm text-slate-500">Opened</p>
          <p className="mt-2 text-lg font-bold font-display text-navy-500">{formatDate(activeSchool.created_at)}</p>
        </Card>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Link to="/enrollments" className="rounded-xl border border-slate-200 bg-white p-5 transition-shadow hover:shadow-card-hover">
          <div className="flex items-center gap-3 text-primary-600"><GraduationCap className="h-5 w-5" /><span className="text-sm font-medium text-navy-500">Manage enrolments</span></div>
        </Link>
        <ComingSoonCard title="Financial summaries" milestone="Milestone 5" icon={DollarSign} />
        <ComingSoonCard title="Attendance trends" milestone="Milestone 3" icon={ClipboardCheck} />
      </div>
    </div>
  );
}

export function AcademicDashboard() {
  const { activeSchool, profile } = useAuth();
  if (!activeSchool) return <NoSchool />;
  return (
    <div className="space-y-6 animate-fade-in">
      <DashboardHeader
        title={`Academic office, ${profile?.first_name}`}
        subtitle="Sessions, grading, and results workflow will live here"
      />
      <Card className="bg-gradient-to-r from-navy-500 to-navy-600 text-white border-0">
        <div className="flex items-start gap-4">
          <Sparkles className="h-5 w-5 mt-0.5" />
          <p className="text-sm text-navy-100">
            Result workflow (Draft → Submitted → Reviewed → Approved → Published) is scheduled for Milestone 3.
            This dashboard will then show pending approvals from live assessment data.
          </p>
        </div>
      </Card>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Link to="/classes" className="rounded-xl border border-slate-200 bg-white p-5 transition-shadow hover:shadow-card-hover">
          <div className="flex items-center gap-3 text-primary-600"><CalendarDays className="h-5 w-5" /><span className="text-sm font-medium text-navy-500">Manage sessions & classes</span></div>
        </Link>
        <ComingSoonCard title="Results pending approval" milestone="Milestone 3" icon={FileText} />
        <ComingSoonCard title="Grading schemes" milestone="Milestone 3" icon={BookOpen} />
      </div>
    </div>
  );
}

export function BursarDashboard() {
  const { activeSchool, profile } = useAuth();
  if (!activeSchool) return <NoSchool />;
  return (
    <div className="space-y-6 animate-fade-in">
      <DashboardHeader
        title={`Finance desk, ${profile?.first_name}`}
        subtitle={`Invoices and receipts in ${activeSchool.currency}. Payments are never auto-verified from screenshots.`}
      />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <ComingSoonCard title="Outstanding balances" milestone="Milestone 5" icon={DollarSign} />
        <ComingSoonCard title="Payments to verify" milestone="Milestone 5" icon={FileText} />
        <ComingSoonCard title="Fee structures" milestone="Milestone 5" icon={BookOpen} />
      </div>
    </div>
  );
}

export function TeacherDashboard() {
  const { activeSchool, profile, user } = useAuth();
  const { toast } = useToast();
  const [assignedClasses, setAssignedClasses] = useState<{ id: string; className: string; sectionName: string; subjectName: string }[]>([]);
  const [assignmentsLoading, setAssignmentsLoading] = useState(true);

  useEffect(() => {
    const schoolId = activeSchool?.id;
    if (!schoolId || !user) return;
    let cancelled = false;
    async function loadAssignments() {
      const { data: assignmentRows, error: assignmentError } = await supabase
        .from('teacher_assignments').select('id,class_section_id,subject_id')
        .eq('school_id', schoolId);
      if (assignmentError) toast(assignmentError.message, 'error');
      const rows = assignmentRows ?? [];
      const sectionIds = [...new Set(rows.map((row) => row.class_section_id))];
      const subjectIds = [...new Set(rows.map((row) => row.subject_id).filter((id): id is string => Boolean(id)))];
      const [sectionResult, subjectResult] = await Promise.all([
        sectionIds.length ? supabase.from('class_sections').select('id,name,class_id').eq('school_id', schoolId).in('id', sectionIds) : Promise.resolve({ data: [], error: null }),
        subjectIds.length ? supabase.from('subjects').select('id,name').eq('school_id', schoolId).in('id', subjectIds) : Promise.resolve({ data: [], error: null }),
      ]);
      if (sectionResult.error) toast(sectionResult.error.message, 'error');
      if (subjectResult.error) toast(subjectResult.error.message, 'error');
      const classIds = [...new Set((sectionResult.data ?? []).map((section) => section.class_id))];
      const classResult = classIds.length
        ? await supabase.from('classes').select('id,name').eq('school_id', schoolId).in('id', classIds)
        : { data: [], error: null };
      if (classResult.error) toast(classResult.error.message, 'error');
      if (cancelled) return;
      const sections = new Map((sectionResult.data ?? []).map((section) => [section.id, section]));
      const subjects = new Map((subjectResult.data ?? []).map((subject) => [subject.id, subject.name]));
      const classes = new Map((classResult.data ?? []).map((classItem) => [classItem.id, classItem.name]));
      setAssignedClasses(rows.map((row) => {
        const section = sections.get(row.class_section_id);
        return {
          id: row.id,
          className: section ? classes.get(section.class_id) ?? 'Class' : 'Class',
          sectionName: section?.name ?? '',
          subjectName: row.subject_id ? subjects.get(row.subject_id) ?? 'Subject' : 'Class teacher',
        };
      }));
      setAssignmentsLoading(false);
    }
    void loadAssignments();
    return () => { cancelled = true; };
  }, [activeSchool, user, toast]);

  if (!activeSchool) return <NoSchool />;
  return (
    <div className="space-y-6 animate-fade-in">
      <DashboardHeader
        title={`Teaching workspace, ${profile?.first_name}`}
        subtitle="Your assigned classes and subjects"
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="sm:col-span-2 lg:col-span-4">
          <h3 className="mb-3 text-base font-semibold text-navy-500">Assigned classes</h3>
          {assignmentsLoading ? <p className="text-sm text-slate-500">Loading assignments...</p> : assignedClasses.length ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{assignedClasses.map((item) => <div key={item.id} className="rounded-lg border border-slate-200 p-3"><p className="font-medium text-navy-500">{item.className} {item.sectionName}</p><p className="mt-1 text-sm text-slate-500">{item.subjectName}</p></div>)}</div>
          ) : <p className="text-sm text-slate-500">No class assignments have been made yet.</p>}
        </Card>
        <ComingSoonCard title="Today's timetable" milestone="Milestone 3" icon={CalendarDays} />
        <ComingSoonCard title="Attendance tasks" milestone="Milestone 3" icon={ClipboardCheck} />
        <ComingSoonCard title="Assignment submissions" milestone="Milestone 4" icon={FileText} />
      </div>
    </div>
  );
}

export function ParentDashboard() {
  const { activeSchool, profile } = useAuth();
  if (!activeSchool) return <NoSchool />;
  return (
    <div className="space-y-6 animate-fade-in">
      <DashboardHeader
        title={`Family portal, ${profile?.first_name}`}
        subtitle="You will only see children linked to this account. No linked students yet."
      />
      <EmptyState
        icon={<GraduationCap className="h-7 w-7" />}
        title="No linked children"
        description="When the school links a guardian record to your account (Milestone 2), attendance, results, and fees for those children will appear here."
      />
    </div>
  );
}

export function StudentDashboard() {
  const { activeSchool, profile } = useAuth();
  if (!activeSchool) return <NoSchool />;
  return (
    <div className="space-y-6 animate-fade-in">
      <DashboardHeader
        title={`My school, ${profile?.first_name}`}
        subtitle="Your timetable, assignments, and published results only — once enrolment is complete"
      />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <ComingSoonCard title="Timetable" milestone="Milestone 3" icon={CalendarDays} />
        <ComingSoonCard title="Assignments" milestone="Milestone 4" icon={FileText} />
        <ComingSoonCard title="Published results" milestone="Milestone 3" icon={BookOpen} />
      </div>
    </div>
  );
}
