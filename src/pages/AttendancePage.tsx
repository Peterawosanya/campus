import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, Check, ClipboardCheck, Users } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { EmptyState, LoadingSpinner } from '@/components/ui/EmptyState';
import { Input, Select } from '@/components/ui/Input';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/components/ui/Toast';
import { supabase } from '@/lib/supabase';

type AttendanceStatus = 'present' | 'absent' | 'late' | 'excused';
type SectionOption = { id: string; name: string; class_id: string; academic_session_id: string; class_name: string; campus_id: string | null };
type StudentRow = { id: string; student_id: string; first_name: string; last_name: string };
type AttendanceRow = { id: string; student_id: string; attendance_date: string; status: AttendanceStatus; remarks: string | null; students?: StudentRow };
type TermOption = { id: string; name: string; academic_session_id: string; starts_on: string; ends_on: string };
type SessionOption = { id: string; name: string };
type CampusOption = { id: string; name: string };
type NotificationRow = { id: string; message: string; notification_type: string; created_at: string; read_at: string | null; student_id: string };
type TrendDay = { date: string; present: number; absent: number; late: number; excused: number };
type RosterItem = StudentRow & { status: AttendanceStatus | ''; remarks: string };

const statuses: AttendanceStatus[] = ['present', 'absent', 'late', 'excused'];
const statusColor: Record<AttendanceStatus, 'success' | 'error' | 'warning' | 'navy'> = {
  present: 'success',
  absent: 'error',
  late: 'warning',
  excused: 'navy',
};
const today = () => new Date().toLocaleDateString('en-CA');
const localDate = (date: Date) => new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);

export function AttendancePage() {
  const { activeSchool, activeRoles, user } = useAuth();
  const { toast } = useToast();
  const canManage = activeRoles.some((role) => ['platform_admin', 'school_owner', 'school_admin', 'academic_admin'].includes(role));
  const isFamily = !canManage && !activeRoles.includes('teacher')
    && (activeRoles.includes('parent') || activeRoles.includes('student'));
  const [sections, setSections] = useState<SectionOption[]>([]);
  const [terms, setTerms] = useState<TermOption[]>([]);
  const [sessions, setSessions] = useState<SessionOption[]>([]);
  const [campuses, setCampuses] = useState<CampusOption[]>([]);
  const [sessionId, setSessionId] = useState('');
  const [campusId, setCampusId] = useState('');
  const [sectionId, setSectionId] = useState('');
  const [termId, setTermId] = useState('');
  const [date, setDate] = useState(today());
  const [roster, setRoster] = useState<RosterItem[]>([]);
  const [trend, setTrend] = useState<TrendDay[]>([]);
  const [familyRecords, setFamilyRecords] = useState<AttendanceRow[]>([]);
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [staffDate, setStaffDate] = useState(today());
  const [staffRows, setStaffRows] = useState<{ id: string; name: string; status: AttendanceStatus | ''; remarks: string }[]>([]);

  const loadOptions = useCallback(async () => {
    if (!activeSchool) return;
    setLoading(true);
    const [sectionResult, termResult, sessionResult] = await Promise.all([
      supabase.from('class_sections').select('id,name,class_id,academic_session_id').eq('school_id', activeSchool.id).eq('status', 'active').order('name'),
      supabase.from('academic_terms').select('id,name,academic_session_id,starts_on,ends_on').eq('school_id', activeSchool.id).order('starts_on', { ascending: false }),
      supabase.from('academic_sessions').select('id,name').eq('school_id', activeSchool.id).order('starts_on', { ascending: false }),
    ]);
    if (sectionResult.error) toast(sectionResult.error.message, 'error');
    if (termResult.error) toast(termResult.error.message, 'error');
    if (sessionResult.error) toast(sessionResult.error.message, 'error');
    const classIds = [...new Set((sectionResult.data ?? []).map((item) => item.class_id))];
    const classesResult = classIds.length
      ? await supabase.from('classes').select('id,name,campus_id').eq('school_id', activeSchool.id).in('id', classIds)
      : { data: [], error: null };
    if (classesResult.error) toast(classesResult.error.message, 'error');
    const classes = new Map((classesResult.data ?? []).map((item) => [item.id, item]));
    const campusIds = [...new Set((classesResult.data ?? []).map((item) => item.campus_id).filter((id): id is string => Boolean(id)))];
    const campusResult = campusIds.length ? await supabase.from('campuses').select('id,name').eq('school_id', activeSchool.id).in('id', campusIds) : { data: [], error: null };
    if (campusResult.error) toast(campusResult.error.message, 'error');
    const sectionOptions = (sectionResult.data ?? []).map((item) => ({
      ...item,
      class_name: classes.get(item.class_id)?.name ?? 'Class',
      campus_id: classes.get(item.class_id)?.campus_id ?? null,
    }));
    const defaultSessionId = sessionId || sessionResult.data?.[0]?.id || '';
    setSections(sectionOptions);
    setTerms((termResult.data ?? []) as TermOption[]);
    setSessions((sessionResult.data ?? []) as SessionOption[]);
    setCampuses((campusResult.data ?? []) as CampusOption[]);
    if (!sessionId && defaultSessionId) setSessionId(defaultSessionId);
    if (!sectionOptions.some((section) => section.id === sectionId && section.academic_session_id === defaultSessionId)) {
      setSectionId(sectionOptions.find((section) => section.academic_session_id === defaultSessionId)?.id ?? '');
    }
    if (!termResult.data?.some((term) => term.id === termId && term.academic_session_id === defaultSessionId)) {
      setTermId(termResult.data?.find((term) => term.academic_session_id === defaultSessionId)?.id ?? '');
    }
    setLoading(false);
  }, [activeSchool, sectionId, sessionId, termId, toast]);

  useEffect(() => { void loadOptions(); }, [loadOptions]);

  const loadRegister = useCallback(async () => {
    if (!activeSchool || isFamily || !date) return;
    if (!sectionId) { setRoster([]); setTrend([]); setLoading(false); return; }
    setLoading(true);
    const section = sections.find((item) => item.id === sectionId);
    if (!section) { setLoading(false); return; }
    const [enrollmentResult, attendanceResult] = await Promise.all([
      supabase.from('enrollments')
        .select('id,student_id,students!inner(id,student_id,first_name,last_name)')
        .eq('school_id', activeSchool.id).eq('class_section_id', sectionId)
        .eq('academic_session_id', section.academic_session_id).eq('status', 'active'),
      (() => {
        let query = supabase.from('attendance_records').select('id,student_id,attendance_date,status,remarks')
          .eq('school_id', activeSchool.id).eq('attendance_date', date);
        if (termId) query = query.eq('term_id', termId);
        return query;
      })(),
    ]);
    if (enrollmentResult.error) toast(enrollmentResult.error.message, 'error');
    if (attendanceResult.error) toast(attendanceResult.error.message, 'error');
    const byStudent = new Map((attendanceResult.data ?? []).map((record) => [record.student_id, record]));
    const nextRoster: RosterItem[] = (enrollmentResult.data ?? []).map((item) => {
      const student = item.students as unknown as StudentRow;
      const attendance = byStudent.get(item.student_id);
      const status: RosterItem['status'] = attendance ? attendance.status as AttendanceStatus : '';
      return {
        ...student,
        status,
        remarks: attendance?.remarks ?? '',
      };
    });
    const enrollmentIds = (enrollmentResult.data ?? []).map((item) => item.id);
    if (enrollmentIds.length) {
      const endDate = new Date(`${date}T00:00:00`);
      const startDate = new Date(endDate);
      startDate.setDate(startDate.getDate() - 6);
      const trendResult = await supabase.from('attendance_records').select('attendance_date,status')
        .eq('school_id', activeSchool.id).in('enrollment_id', enrollmentIds)
        .gte('attendance_date', localDate(startDate)).lte('attendance_date', date);
      if (trendResult.error) toast(trendResult.error.message, 'error');
      const grouped = new Map<string, TrendDay>();
      for (const record of trendResult.data ?? []) {
        const day = grouped.get(record.attendance_date) ?? { date: record.attendance_date, present: 0, absent: 0, late: 0, excused: 0 };
        day[record.status as AttendanceStatus] += 1;
        grouped.set(record.attendance_date, day);
      }
      setTrend([...grouped.values()].sort((a, b) => a.date.localeCompare(b.date)));
    } else setTrend([]);
    setRoster(nextRoster);
    setDirty(false);
    setLoading(false);
  }, [activeSchool, date, isFamily, sectionId, sections, termId, toast]);

  const loadFamilyAttendance = useCallback(async () => {
    if (!activeSchool || !isFamily || !user) return;
    setLoading(true);
    const [attendanceResult, notificationResult] = await Promise.all([
      supabase.from('attendance_records')
      .select('id,student_id,attendance_date,status,remarks,students!inner(id,student_id,first_name,last_name)')
      .eq('school_id', activeSchool.id)
      .order('attendance_date', { ascending: false }).limit(200),
      supabase.from('academic_notifications').select('id,message,notification_type,created_at,read_at,student_id')
        .eq('school_id', activeSchool.id).order('created_at', { ascending: false }).limit(50),
    ]);
    if (attendanceResult.error) toast(attendanceResult.error.message, 'error');
    if (notificationResult.error) toast(notificationResult.error.message, 'error');
    setFamilyRecords((attendanceResult.data ?? []).map((item) => ({ ...item, students: item.students as unknown as StudentRow })) as AttendanceRow[]);
    setNotifications((notificationResult.data ?? []) as NotificationRow[]);
    setLoading(false);
  }, [activeSchool, isFamily, toast, user]);

  const markNotificationRead = async (id: string) => {
    const { error } = await supabase.rpc('mark_academic_notification_read', { p_notification_id: id });
    if (error) { toast(error.message, 'error'); return; }
    setNotifications((current) => current.map((item) => item.id === id ? { ...item, read_at: new Date().toISOString() } : item));
  };

  useEffect(() => {
    if (isFamily) void loadFamilyAttendance();
    else void loadRegister();
  }, [isFamily, loadFamilyAttendance, loadRegister]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const summary = useMemo(() => statuses.reduce((acc, status) => {
    acc[status] = roster.filter((item) => item.status === status).length;
    return acc;
  }, { present: 0, absent: 0, late: 0, excused: 0 } as Record<AttendanceStatus, number>), [roster]);
  const attendanceRate = roster.length ? Math.round((summary.present + summary.late + summary.excused) * 100 / roster.length) : 0;

  const setStatus = (studentId: string, status: AttendanceStatus | '') => {
    setRoster((current) => current.map((item) => item.id === studentId ? { ...item, status } : item));
    setDirty(true);
  };
  const setRemark = (studentId: string, remarks: string) => {
    setRoster((current) => current.map((item) => item.id === studentId ? { ...item, remarks } : item));
    setDirty(true);
  };
  const guardFilterChange = (next: () => void) => {
    if (dirty && !window.confirm('Discard unsaved attendance changes?')) return;
    setDirty(false);
    next();
  };
  const markAllPresent = () => {
    setRoster((current) => current.map((item) => ({ ...item, status: 'present' })));
    setDirty(true);
  };
  const saveAttendance = async () => {
    if (!activeSchool || !sectionId || !roster.length) return;
    if (roster.some((student) => !student.status)) {
      toast('Mark every student before saving the register.', 'error');
      return;
    }
    const selectedTerm = terms.find((term) => term.id === termId);
    if (selectedTerm && (date < selectedTerm.starts_on || date > selectedTerm.ends_on)) {
      toast('Choose a date within the selected academic term.', 'error');
      return;
    }
    setSaving(true);
    const { data, error } = await supabase.rpc('save_attendance', {
      p_school_id: activeSchool.id,
      p_class_section_id: sectionId,
      p_term_id: termId || null,
      p_date: date,
      p_records: roster.map(({ id, status, remarks }) => ({ student_id: id, status, remarks: remarks || null })),
    });
    setSaving(false);
    if (error) { toast(error.message, 'error'); return; }
    toast(`Attendance saved for ${data} students.`, 'success');
    setDirty(false);
    await loadRegister();
  };

  const loadStaffRegister = async () => {
    if (!activeSchool || !canManage) return;
    const [staffResult, recordResult] = await Promise.all([
      supabase.from('staff_profiles').select('id,full_name').eq('school_id', activeSchool.id).eq('status', 'active').order('full_name'),
      supabase.from('staff_attendance').select('staff_profile_id,status,remarks').eq('school_id', activeSchool.id).eq('attendance_date', staffDate),
    ]);
    if (staffResult.error) toast(staffResult.error.message, 'error');
    if (recordResult.error) toast(recordResult.error.message, 'error');
    const records = new Map((recordResult.data ?? []).map((row) => [row.staff_profile_id, row]));
    setStaffRows((staffResult.data ?? []).map((person) => ({
      id: person.id, name: person.full_name ?? 'Staff member',
      status: (records.get(person.id)?.status as AttendanceStatus | undefined) ?? '',
      remarks: records.get(person.id)?.remarks ?? '',
    })));
  };

  const saveStaffAttendance = async () => {
    if (!activeSchool || !staffRows.length) return;
    if (staffRows.some((person) => !person.status)) { toast('Mark every staff member before saving.', 'error'); return; }
    setSaving(true);
    const { data, error } = await supabase.rpc('save_staff_attendance', {
      p_school_id: activeSchool.id,
      p_date: staffDate,
      p_records: staffRows.map(({ id, status, remarks }) => ({ staff_profile_id: id, status, remarks: remarks || null })),
    });
    setSaving(false);
    if (error) { toast(error.message, 'error'); return; }
    toast(`Staff attendance saved for ${data} staff members.`, 'success');
    await loadStaffRegister();
  };

  if (!activeSchool) return <EmptyState icon={<ClipboardCheck className="h-7 w-7" />} title="No school selected" description="Select a school to view attendance." />;
  if (loading && !sections.length && !isFamily) return <LoadingSpinner />;

  if (isFamily) {
    const counts = statuses.reduce((acc, status) => {
      acc[status] = familyRecords.filter((row) => row.status === status).length;
      return acc;
    }, { present: 0, absent: 0, late: 0, excused: 0 } as Record<AttendanceStatus, number>);
    return (
      <div className="space-y-6">
        <div><h1 className="text-2xl font-bold font-display text-navy-500">Attendance</h1><p className="mt-1 text-sm text-slate-500">Attendance records for your linked students.</p></div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {statuses.map((status) => <Card key={status}><p className="text-sm capitalize text-slate-500">{status}</p><p className="mt-1 text-2xl font-semibold text-navy-500">{counts[status]}</p></Card>)}
        </div>
        <Card>
          <CardHeader title="Recent attendance" description="History for children explicitly linked to your account." />
          {loading ? <LoadingSpinner /> : familyRecords.length ? <div className="divide-y divide-slate-100">{familyRecords.map((record) => <div key={record.id} className="flex items-center justify-between gap-3 py-3"><div><p className="font-medium text-navy-500">{record.students?.first_name} {record.students?.last_name}</p><p className="text-sm text-slate-500">{record.students?.student_id} · {record.attendance_date}</p></div><Badge variant={statusColor[record.status]}>{record.status}</Badge></div>)}</div> : <EmptyState icon={<CalendarDays className="h-7 w-7" />} title="No attendance records yet" description="Records will appear here after the school takes attendance." />}
        </Card>
        <Card><CardHeader title="Attendance notifications" description="In-app absence and late arrival notices for linked children." />
          {notifications.length ? <div className="divide-y divide-slate-100">{notifications.map((notice) => <div key={notice.id} className="flex items-center justify-between gap-3 py-3"><div><p className={notice.read_at ? 'text-sm text-slate-500' : 'text-sm font-medium text-navy-500'}>{notice.message}</p><p className="text-xs text-slate-400">{new Date(notice.created_at).toLocaleString()}</p></div>{!notice.read_at && <Button size="sm" variant="outline" onClick={() => void markNotificationRead(notice.id)}>Mark read</Button>}</div>)}</div> : <EmptyState icon={<CalendarDays className="h-7 w-7" />} title="No notifications" description="Absence or late notifications will appear here." />}
        </Card>
      </div>
    );
  }

  const selectedSection = sections.find((item) => item.id === sectionId);
  const visibleSections = sections.filter((section) =>
    (!sessionId || section.academic_session_id === sessionId) && (!campusId || section.campus_id === campusId),
  );
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div><h1 className="text-2xl font-bold font-display text-navy-500">Attendance</h1><p className="mt-1 text-sm text-slate-500">Take and review the daily student register.</p></div>
        {canManage && <Button variant="outline" onClick={() => void loadStaffRegister()}><Users className="h-4 w-4" /> Staff register</Button>}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ['Enrolled', roster.length], ['Present', summary.present], ['Absent', summary.absent], ['Late / Excused', summary.late + summary.excused],
        ].map(([label, value]) => <Card key={label}><p className="text-sm text-slate-500">{label}</p><p className="mt-1 text-2xl font-semibold text-navy-500">{value}</p></Card>)}
      </div>
      <Card>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Select label="Academic session" value={sessionId} onChange={(event) => guardFilterChange(() => {
            const value = event.target.value;
            setSessionId(value);
            setSectionId(sections.find((section) => section.academic_session_id === value && (!campusId || section.campus_id === campusId))?.id ?? '');
            setTermId(terms.find((term) => term.academic_session_id === value)?.id ?? '');
          })}>
            {sessions.map((session) => <option key={session.id} value={session.id}>{session.name}</option>)}
          </Select>
          <Select label="Campus" value={campusId} onChange={(event) => guardFilterChange(() => {
            const value = event.target.value;
            setCampusId(value);
            setSectionId(sections.find((section) => section.academic_session_id === sessionId && (!value || section.campus_id === value))?.id ?? '');
          })}><option value="">All campuses</option>{campuses.map((campus) => <option key={campus.id} value={campus.id}>{campus.name}</option>)}</Select>
          <Select label="Academic term" value={termId} onChange={(event) => guardFilterChange(() => setTermId(event.target.value))}>
            <option value="">All terms</option>{terms.filter((term) => !sessionId || term.academic_session_id === sessionId).map((term) => <option key={term.id} value={term.id}>{term.name}</option>)}
          </Select>
          <Select label="Class and section" value={sectionId} onChange={(event) => guardFilterChange(() => setSectionId(event.target.value))}>
            <option value="">Select section</option>
            {visibleSections.map((section) => <option key={section.id} value={section.id}>{section.class_name} {section.name}</option>)}
          </Select>
          <Input type="date" label="Attendance date" value={date} max={today()} onChange={(event) => guardFilterChange(() => setDate(event.target.value))} />
          <div className="flex items-end gap-2"><Button variant="outline" onClick={markAllPresent} disabled={!roster.length}>Mark all present</Button><Button onClick={() => void saveAttendance()} loading={saving} disabled={!roster.length || !dirty}><Check className="h-4 w-4" /> Save register</Button></div>
        </div>
        <p className="mt-3 text-xs text-slate-500">{selectedSection ? `${selectedSection.class_name} ${selectedSection.name}` : 'Select a class'} · Attendance rate {attendanceRate}%{dirty ? ' · Unsaved changes' : ''}</p>
      </Card>
      <Card><CardHeader title="Recent attendance trend" description="Daily rates use saved records for the selected class and enrolments." />
        {trend.length ? <div className="grid gap-2 sm:grid-cols-4 lg:grid-cols-7">{trend.map((day) => { const total = day.present + day.absent + day.late + day.excused; const rate = total ? Math.round((day.present + day.late + day.excused) * 100 / total) : 0; return <div key={day.date} className="rounded-lg bg-slate-50 p-3"><p className="text-xs text-slate-500">{day.date.slice(5)}</p><p className="mt-1 text-lg font-semibold text-navy-500">{rate}%</p><p className="text-xs text-slate-500">{total} recorded</p></div>; })}</div> : <p className="text-sm text-slate-500">No recent records for this class.</p>}
      </Card>
      <Card noPadding>
        {loading ? <div className="p-8"><LoadingSpinner /></div> : roster.length ? <div className="overflow-x-auto"><table className="w-full min-w-[720px]"><thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Student</th><th className="px-4 py-3">Student ID</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Remark</th></tr></thead><tbody className="divide-y divide-slate-100">{roster.map((student) => <tr key={student.id}><td className="px-4 py-3 font-medium text-navy-500">{student.first_name} {student.last_name}</td><td className="px-4 py-3 text-sm text-slate-600">{student.student_id}</td><td className="px-4 py-3"><Select aria-label={`Attendance status for ${student.first_name} ${student.last_name}`} value={student.status} onChange={(event) => setStatus(student.id, event.target.value as AttendanceStatus | '')}><option value="">Not marked</option>{statuses.map((status) => <option key={status} value={status}>{status}</option>)}</Select></td><td className="px-4 py-3"><Input aria-label={`Remark for ${student.first_name} ${student.last_name}`} value={student.remarks} onChange={(event) => setRemark(student.id, event.target.value)} placeholder="Optional" /></td></tr>)}</tbody></table></div> : <div className="p-6"><EmptyState icon={<ClipboardCheck className="h-7 w-7" />} title="No enrolled students" description="Select a class section with active enrolments." /></div>}
      </Card>
      {canManage && staffRows.length > 0 && <Card><CardHeader title="Staff attendance" description="Administrator-only staff register." /><div className="mb-4 flex flex-wrap items-end gap-3"><Input type="date" label="Date" value={staffDate} max={today()} onChange={(event) => setStaffDate(event.target.value)} /><Button variant="outline" onClick={() => setStaffRows((rows) => rows.map((row) => ({ ...row, status: 'present' })))}>Mark all present</Button><Button onClick={() => void saveStaffAttendance()} loading={saving}>Save staff register</Button></div><div className="divide-y divide-slate-100">{staffRows.map((person) => <div key={person.id} className="grid items-center gap-3 py-2 sm:grid-cols-3"><span className="font-medium text-navy-500">{person.name}</span><Select aria-label={`Staff attendance status for ${person.name}`} value={person.status} onChange={(event) => setStaffRows((rows) => rows.map((row) => row.id === person.id ? { ...row, status: event.target.value as AttendanceStatus | '' } : row))}><option value="">Not marked</option>{statuses.map((status) => <option key={status} value={status}>{status}</option>)}</Select><Input aria-label={`Staff remark for ${person.name}`} value={person.remarks} onChange={(event) => setStaffRows((rows) => rows.map((row) => row.id === person.id ? { ...row, remarks: event.target.value } : row))} placeholder="Optional remark" /></div>)}</div></Card>}
    </div>
  );
}
