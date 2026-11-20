import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { CalendarDays, Plus, Printer } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { EmptyState, LoadingSpinner } from '@/components/ui/EmptyState';
import { Input, Select } from '@/components/ui/Input';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/components/ui/Toast';
import { supabase } from '@/lib/supabase';

type Session = { id: string; name: string };
type Term = { id: string; name: string; academic_session_id: string };
type Section = { id: string; name: string; class_id: string; academic_session_id: string; class_name: string };
type Subject = { id: string; name: string };
type Staff = { id: string; full_name: string | null };
type Room = { id: string; name: string };
type Period = { id: string; name: string; starts_at: string; ends_at: string; is_break: boolean };
type Holiday = { id: string; name: string; starts_on: string; ends_on: string };
type Entry = { id: string; term_id: string; class_section_id: string; subject_id: string; teacher_profile_id: string; classroom_id: string | null; day_of_week: number; starts_at: string; ends_at: string };
const days = [{ id: 1, name: 'Monday' }, { id: 2, name: 'Tuesday' }, { id: 3, name: 'Wednesday' }, { id: 4, name: 'Thursday' }, { id: 5, name: 'Friday' }, { id: 6, name: 'Saturday' }, { id: 0, name: 'Sunday' }];

export function TimetablePage() {
  const { activeSchool, activeRoles } = useAuth();
  const { toast } = useToast();
  const canManage = activeRoles.some((role) => ['platform_admin', 'school_owner', 'school_admin', 'academic_admin'].includes(role));
  const [sessions, setSessions] = useState<Session[]>([]);
  const [terms, setTerms] = useState<Term[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [activeDays, setActiveDays] = useState<number[]>([]);
  const [termId, setTermId] = useState('');
  const [sectionId, setSectionId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!activeSchool) return;
    setLoading(true);
    const [sessionResult, termResult, sectionResult, subjectResult, staffResult, roomResult, periodResult, entryResult, daysResult, holidayResult] = await Promise.all([
      supabase.from('academic_sessions').select('id,name').eq('school_id', activeSchool.id).order('starts_on', { ascending: false }),
      supabase.from('academic_terms').select('id,name,academic_session_id').eq('school_id', activeSchool.id).order('starts_on'),
      supabase.from('class_sections').select('id,name,class_id,academic_session_id').eq('school_id', activeSchool.id).eq('status', 'active').order('name'),
      supabase.from('subjects').select('id,name').eq('school_id', activeSchool.id).eq('is_active', true).order('name'),
      supabase.from('staff_profiles').select('id,full_name').eq('school_id', activeSchool.id).eq('status', 'active').order('full_name'),
      supabase.from('school_classrooms').select('id,name').eq('school_id', activeSchool.id).eq('is_active', true).order('name'),
      supabase.from('timetable_periods').select('id,name,starts_at,ends_at,is_break').eq('school_id', activeSchool.id).order('sort_order'),
      supabase.from('timetable_entries').select('id,term_id,class_section_id,subject_id,teacher_profile_id,classroom_id,day_of_week,starts_at,ends_at').eq('school_id', activeSchool.id),
      supabase.from('school_days').select('day_of_week,is_school_day').eq('school_id', activeSchool.id),
      supabase.from('school_holidays').select('id,name,starts_on,ends_on').eq('school_id', activeSchool.id).order('starts_on'),
    ]);
    for (const result of [sessionResult, termResult, sectionResult, subjectResult, staffResult, roomResult, periodResult, entryResult, daysResult, holidayResult]) {
      if (result.error) toast(result.error.message, 'error');
    }
    const classIds = [...new Set((sectionResult.data ?? []).map((item) => item.class_id))];
    const classResult = classIds.length ? await supabase.from('classes').select('id,name').eq('school_id', activeSchool.id).in('id', classIds) : { data: [], error: null };
    if (classResult.error) toast(classResult.error.message, 'error');
    const classNames = new Map((classResult.data ?? []).map((item) => [item.id, item.name]));
    setSessions((sessionResult.data ?? []) as Session[]);
    setTerms((termResult.data ?? []) as Term[]);
    setSections((sectionResult.data ?? []).map((item) => ({ ...item, class_name: classNames.get(item.class_id) ?? 'Class' })));
    setSubjects((subjectResult.data ?? []) as Subject[]);
    setStaff((staffResult.data ?? []) as Staff[]);
    setRooms((roomResult.data ?? []) as Room[]);
    setPeriods((periodResult.data ?? []) as Period[]);
    setHolidays((holidayResult.data ?? []) as Holiday[]);
    setEntries((entryResult.data ?? []) as Entry[]);
    setActiveDays((daysResult.data ?? []).filter((item) => item.is_school_day).map((item) => item.day_of_week));
    if (!termId && termResult.data?.length) setTermId(termResult.data[0].id);
    if (!sectionId && sectionResult.data?.length) setSectionId(sectionResult.data[0].id);
    setLoading(false);
  }, [activeSchool, sectionId, termId, toast]);
  useEffect(() => { void load(); }, [load]);

  const selectedSection = sections.find((item) => item.id === sectionId);
  const termsForSection = terms.filter((item) => item.academic_session_id === selectedSection?.academic_session_id);
  const entriesForView = useMemo(() => entries.filter((entry) =>
    (!termId || entry.term_id === termId) && (!sectionId || entry.class_section_id === sectionId),
  ), [entries, sectionId, termId]);

  const createPeriod = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeSchool) return;
    const form = new FormData(event.currentTarget);
    const { error } = await supabase.from('timetable_periods').insert({
      school_id: activeSchool.id, name: String(form.get('name')), starts_at: String(form.get('starts_at')),
      ends_at: String(form.get('ends_at')), sort_order: Number(form.get('sort_order') || 0),
      is_break: form.get('is_break') === 'on',
    });
    if (error) { toast(error.message, 'error'); return; }
    toast('Timetable period saved.', 'success'); event.currentTarget.reset(); await load();
  };
  const createRoom = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeSchool) return;
    const form = new FormData(event.currentTarget);
    const { error } = await supabase.from('school_classrooms').insert({
      school_id: activeSchool.id, name: String(form.get('name')), capacity: form.get('capacity') ? Number(form.get('capacity')) : null,
    });
    if (error) { toast(error.message, 'error'); return; }
    toast('Classroom added.', 'success'); event.currentTarget.reset(); await load();
  };
  const createHoliday = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeSchool) return;
    const form = new FormData(event.currentTarget);
    const { error } = await supabase.from('school_holidays').insert({
      school_id: activeSchool.id, name: String(form.get('name')),
      starts_on: String(form.get('starts_on')), ends_on: String(form.get('ends_on')),
    });
    if (error) { toast(error.message, 'error'); return; }
    toast('School holiday added. Attendance is disabled on those dates.', 'success'); event.currentTarget.reset(); await load();
  };
  const removeHoliday = async (id: string) => {
    if (!window.confirm('Remove this school holiday?')) return;
    const { error } = await supabase.from('school_holidays').delete().eq('id', id);
    if (error) { toast(error.message, 'error'); return; }
    toast('School holiday removed.', 'success'); await load();
  };
  const createEntry = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeSchool || !selectedSection) return;
    const form = new FormData(event.currentTarget);
    const period = periods.find((item) => item.id === form.get('period_id'));
    if (!period || period.is_break) { toast('Choose a teaching period, not a break.', 'error'); return; }
    setSaving(true);
    const { error } = await supabase.from('timetable_entries').insert({
      school_id: activeSchool.id,
      academic_session_id: selectedSection.academic_session_id,
      term_id: String(form.get('term_id')),
      class_section_id: selectedSection.id,
      subject_id: String(form.get('subject_id')),
      teacher_profile_id: String(form.get('teacher_profile_id')),
      classroom_id: String(form.get('classroom_id') || '') || null,
      day_of_week: Number(form.get('day_of_week')),
      starts_at: period.starts_at,
      ends_at: period.ends_at,
    });
    setSaving(false);
    if (error) { toast(error.message, 'error'); return; }
    toast('Timetable lesson added.', 'success'); event.currentTarget.reset(); await load();
  };
  const removeEntry = async (id: string) => {
    if (!window.confirm('Remove this timetable lesson?')) return;
    const { error } = await supabase.from('timetable_entries').delete().eq('id', id);
    if (error) { toast(error.message, 'error'); return; }
    toast('Lesson removed.', 'success'); await load();
  };
  const toggleSchoolDay = async (day: number) => {
    if (!activeSchool || !canManage) return;
    const is_school_day = !activeDays.includes(day);
    const { error } = await supabase.from('school_days').upsert({ school_id: activeSchool.id, day_of_week: day, is_school_day });
    if (error) { toast(error.message, 'error'); return; }
    setActiveDays((current) => is_school_day ? [...current, day] : current.filter((value) => value !== day));
  };

  if (!activeSchool) return <EmptyState icon={<CalendarDays className="h-7 w-7" />} title="No school selected" description="Select a school to view the timetable." />;

  const lookup = (values: { id: string; name: string }[], id: string | null) => values.find((item) => item.id === id)?.name ?? '—';
  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-3"><div><h1 className="text-2xl font-bold font-display text-navy-500">Timetable</h1><p className="mt-1 text-sm text-slate-500">School schedule with server-validated teacher, class, and room conflicts.</p></div><Button variant="outline" onClick={() => window.print()}><Printer className="h-4 w-4" /> Print</Button></div>
      {canManage && <Card>
        <CardHeader title="Timetable setup" description="Configure teaching days, periods, and rooms before adding lessons." />
        <div className="mb-5 flex flex-wrap gap-2">{days.map((day) => <Button key={day.id} size="sm" variant={activeDays.includes(day.id) ? 'primary' : 'outline'} onClick={() => void toggleSchoolDay(day.id)}>{day.name}</Button>)}</div>
        <div className="grid gap-6 lg:grid-cols-2">
          <form onSubmit={createPeriod} className="grid gap-3 sm:grid-cols-2">
            <Input name="name" label="Period name" placeholder="Period 1" required />
            <Input name="sort_order" label="Order" type="number" min="0" defaultValue="1" />
            <Input name="starts_at" label="Starts" type="time" required />
            <Input name="ends_at" label="Ends" type="time" required />
            <label className="flex items-center gap-2 text-sm text-navy-500"><input name="is_break" type="checkbox" /> Break or lunch period</label>
            <Button className="sm:col-span-2"><Plus className="h-4 w-4" /> Add period</Button>
          </form>
          <form onSubmit={createRoom} className="grid gap-3 sm:grid-cols-2">
            <Input name="name" label="Classroom" placeholder="Room 1" required />
            <Input name="capacity" label="Capacity" type="number" min="1" />
            <Button className="sm:col-span-2"><Plus className="h-4 w-4" /> Add classroom</Button>
          </form>
        </div>
        <div className="mt-6 grid gap-6 border-t border-slate-100 pt-5 lg:grid-cols-2">
          <form onSubmit={createHoliday} className="grid gap-3 sm:grid-cols-3">
            <Input name="name" label="Holiday or closure" required />
            <Input name="starts_on" label="Starts" type="date" required />
            <Input name="ends_on" label="Ends" type="date" required />
            <Button className="sm:col-span-3"><Plus className="h-4 w-4" /> Add holiday</Button>
          </form>
          <div><p className="mb-2 text-sm font-medium text-navy-500">Configured holidays</p>{holidays.length ? <div className="divide-y divide-slate-100">{holidays.map((holiday) => <div key={holiday.id} className="flex items-center justify-between gap-2 py-2 text-sm"><span>{holiday.name} · {holiday.starts_on}{holiday.ends_on !== holiday.starts_on ? ` to ${holiday.ends_on}` : ''}</span><Button size="sm" variant="ghost" onClick={() => void removeHoliday(holiday.id)}>Remove</Button></div>)}</div> : <p className="text-sm text-slate-500">No holidays configured.</p>}</div>
        </div>
      </Card>}
      <Card>
        <div className="grid gap-4 sm:grid-cols-2">
          <Select label="Class and section" value={sectionId} onChange={(event) => setSectionId(event.target.value)}><option value="">All assigned classes</option>{sections.map((section) => <option key={section.id} value={section.id}>{section.class_name} {section.name}</option>)}</Select>
          <Select label="Term" value={termId} onChange={(event) => setTermId(event.target.value)}><option value="">All terms</option>{terms.map((term) => <option key={term.id} value={term.id}>{term.name}</option>)}</Select>
        </div>
      </Card>
      {canManage && <Card>
        <CardHeader title="Add a lesson" description="Conflicts are checked again by the database when the lesson is saved." />
        <form onSubmit={createEntry} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Select label="Class section" value={sectionId} onChange={(event) => setSectionId(event.target.value)} required>{sections.map((section) => <option key={section.id} value={section.id}>{section.class_name} {section.name}</option>)}</Select>
          <Select name="term_id" label="Term" required>{termsForSection.map((term) => <option key={term.id} value={term.id}>{term.name}</option>)}</Select>
          <Select name="subject_id" label="Subject" required>{subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</Select>
          <Select name="teacher_profile_id" label="Teacher" required>{staff.map((person) => <option key={person.id} value={person.id}>{person.full_name ?? 'Staff member'}</option>)}</Select>
          <Select name="classroom_id" label="Classroom"><option value="">No room selected</option>{rooms.map((room) => <option key={room.id} value={room.id}>{room.name}</option>)}</Select>
          <Select name="day_of_week" label="Day" required>{days.filter((day) => activeDays.includes(day.id)).map((day) => <option key={day.id} value={day.id}>{day.name}</option>)}</Select>
          <Select name="period_id" label="Period" required>{periods.filter((period) => !period.is_break).map((period) => <option key={period.id} value={period.id}>{period.name} ({period.starts_at.slice(0, 5)}–{period.ends_at.slice(0, 5)})</option>)}</Select>
          <div className="flex items-end"><Button loading={saving} disabled={!sections.length || !termsForSection.length || !periods.length || !staff.length}>Add lesson</Button></div>
        </form>
      </Card>}
      <Card>
        <CardHeader title={selectedSection ? `${selectedSection.class_name} ${selectedSection.name}` : 'Weekly schedule'} description="Lessons are filtered by the selected section and term." />
        {loading ? <LoadingSpinner /> : entriesForView.length ? <div className="overflow-x-auto"><table className="w-full min-w-[780px]"><thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr><th className="px-3 py-3">Day</th><th className="px-3 py-3">Time</th><th className="px-3 py-3">Class</th><th className="px-3 py-3">Subject</th><th className="px-3 py-3">Teacher</th><th className="px-3 py-3">Room</th>{canManage && <th className="px-3 py-3">Action</th>}</tr></thead><tbody className="divide-y divide-slate-100">{entriesForView.slice().sort((a, b) => a.day_of_week - b.day_of_week || a.starts_at.localeCompare(b.starts_at)).map((entry) => <tr key={entry.id}><td className="px-3 py-3"><Badge variant="navy">{days.find((day) => day.id === entry.day_of_week)?.name ?? 'Day'}</Badge></td><td className="px-3 py-3 text-sm">{entry.starts_at.slice(0, 5)}–{entry.ends_at.slice(0, 5)}</td><td className="px-3 py-3">{lookup(sections.map((section) => ({ id: section.id, name: `${section.class_name} ${section.name}` })), entry.class_section_id)}</td><td className="px-3 py-3">{lookup(subjects, entry.subject_id)}</td><td className="px-3 py-3">{lookup(staff.map((person) => ({ id: person.id, name: person.full_name ?? 'Staff member' })), entry.teacher_profile_id)}</td><td className="px-3 py-3">{lookup(rooms, entry.classroom_id)}</td>{canManage && <td className="px-3 py-3"><Button size="sm" variant="danger" onClick={() => void removeEntry(entry.id)}>Remove</Button></td>}</tr>)}</tbody></table></div> : <EmptyState icon={<CalendarDays className="h-7 w-7" />} title="No timetable lessons yet" description="Add a lesson after configuring teaching days, periods, rooms, and class assignments." />}
      </Card>
      {!loading && !sessions.length && <p className="text-sm text-warning-600">No academic sessions are configured yet.</p>}
    </div>
  );
}
