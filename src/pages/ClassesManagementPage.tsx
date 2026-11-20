import { useCallback, useEffect, useState } from 'react';
import { BookOpen, Plus } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { EmptyState, LoadingSpinner } from '@/components/ui/EmptyState';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';

type Session = { id: string; name: string; starts_on: string; ends_on: string; is_current: boolean };
type Grade = { id: string; name: string; academic_level: string; sort_order: number };
type ClassItem = { id: string; name: string; grade_level_id: string; academic_session_id: string; campus_id: string | null; status: string };
type Section = { id: string; class_id: string; name: string; classroom: string | null; capacity: number | null; status: string };
type Subject = { id: string; name: string; code: string; academic_level: string | null; description: string | null; is_active: boolean };
type Staff = { id: string; full_name: string | null };
type Campus = { id: string; name: string };
type ClassSubject = { class_id: string; subject_id: string };

export function ClassesManagementPage() {
  const { activeSchool } = useAuth();
  const { toast } = useToast();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [grades, setGrades] = useState<Grade[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [campuses, setCampuses] = useState<Campus[]>([]);
  const [classSubjects, setClassSubjects] = useState<ClassSubject[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<'session' | 'grade' | 'class' | 'section' | 'subject' | 'assign' | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!activeSchool) return;
    setLoading(true);
    const [sessionResult, gradeResult, classResult, sectionResult, subjectResult, staffResult, campusResult, classSubjectResult] = await Promise.all([
      supabase.from('academic_sessions').select('id,name,starts_on,ends_on,is_current').eq('school_id', activeSchool.id).order('starts_on', { ascending: false }),
      supabase.from('grade_levels').select('id,name,academic_level,sort_order').eq('school_id', activeSchool.id).eq('is_active', true).order('sort_order'),
      supabase.from('classes').select('id,name,grade_level_id,academic_session_id,campus_id,status').eq('school_id', activeSchool.id).order('name'),
      supabase.from('class_sections').select('id,class_id,name,classroom,capacity,status').eq('school_id', activeSchool.id).order('name'),
      supabase.from('subjects').select('id,name,code,academic_level,description,is_active').eq('school_id', activeSchool.id).order('name'),
      supabase.from('staff_profiles').select('id,full_name').eq('school_id', activeSchool.id).eq('status', 'active').order('full_name'),
      supabase.from('campuses').select('id,name').eq('school_id', activeSchool.id).eq('is_active', true).order('name'),
      supabase.from('class_subjects').select('class_id,subject_id').eq('school_id', activeSchool.id),
    ]);
    for (const result of [sessionResult, gradeResult, classResult, sectionResult, subjectResult, staffResult, campusResult, classSubjectResult]) {
      if (result.error) toast(result.error.message, 'error');
    }
    setSessions((sessionResult.data ?? []) as Session[]);
    setGrades((gradeResult.data ?? []) as Grade[]);
    setClasses((classResult.data ?? []) as ClassItem[]);
    setSections((sectionResult.data ?? []) as Section[]);
    setSubjects((subjectResult.data ?? []) as Subject[]);
    setStaff((staffResult.data ?? []) as Staff[]);
    setCampuses((campusResult.data ?? []) as Campus[]);
    setClassSubjects((classSubjectResult.data ?? []) as ClassSubject[]);
    setLoading(false);
  }, [activeSchool, toast]);

  useEffect(() => { void load(); }, [load]);

  const submit = async (table: string, event: React.FormEvent<HTMLFormElement>, successMessage: string) => {
    event.preventDefault();
    if (!activeSchool) return;
    const values = Object.fromEntries(new FormData(event.currentTarget).entries());
    const record: Record<string, unknown> = {
      ...Object.fromEntries(Object.entries(values).map(([key, value]) => [key, String(value)])),
      school_id: activeSchool.id,
    };
    if (table === 'classes' || table === 'class_sections') record.status = String(values.status || 'active');
    if (table === 'grade_levels') record.sort_order = Number(values.sort_order || 0);
    if (table === 'class_sections') {
      record.capacity = values.capacity ? Number(values.capacity) : null;
      record.class_teacher_id = values.class_teacher_id || null;
    }
    if (table === 'classes') record.campus_id = values.campus_id || null;
    if (table === 'academic_sessions') {
      record.is_current = values.is_current === 'on';
    }
    if (table === 'subjects') {
      record.is_active = values.is_active === 'on';
    }
    setSaving(true);
    const { error } = await supabase.from(table).insert(record);
    setSaving(false);
    if (error) { toast(error.message, 'error'); return; }
    toast(successMessage, 'success');
    setModal(null);
    await load();
  };

  const assignSubject = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeSchool) return;
    const values = Object.fromEntries(new FormData(event.currentTarget).entries());
    setSaving(true);
    const { error } = await supabase.from('class_subjects').insert({
      school_id: activeSchool.id, class_id: values.class_id, subject_id: values.subject_id,
    });
    setSaving(false);
    if (error) { toast(error.message, 'error'); return; }
    toast('Subject assigned to class.', 'success');
    setModal(null);
  };

  const gradeName = (id: string) => grades.find((item) => item.id === id)?.name ?? 'Unknown level';
  const sessionName = (id: string) => sessions.find((item) => item.id === id)?.name ?? 'Unknown session';
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><h1 className="text-2xl font-bold font-display text-navy-500">Classes & subjects</h1><p className="mt-1 text-sm text-slate-500">Configure grade levels, sessions, class sections, and subjects.</p></div>
        <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => setModal('session')}>Academic session</Button><Button variant="outline" onClick={() => setModal('grade')}>Add grade level</Button><Button variant="outline" onClick={() => setModal('subject')}>Add subject</Button><Button variant="outline" onClick={() => setModal('assign')}>Assign subject</Button><Button onClick={() => setModal('class')}><Plus className="h-4 w-4" /> Add class</Button></div>
      </div>
      {loading ? <LoadingSpinner /> : (
        <>
          <Card><CardHeader title="Academic sessions" description="Create sessions before configuring classes and admissions." />
            {sessions.length ? <div className="overflow-x-auto"><table className="w-full"><thead><tr className="border-b text-left text-xs uppercase text-slate-500">{['Name', 'Starts', 'Ends', 'Status'].map((item) => <th key={item} className="px-3 py-2">{item}</th>)}</tr></thead><tbody className="divide-y">{sessions.map((session) => <tr key={session.id}><td className="px-3 py-2 text-sm font-medium">{session.name}</td><td className="px-3 py-2 text-sm">{session.starts_on}</td><td className="px-3 py-2 text-sm">{session.ends_on}</td><td className="px-3 py-2 text-sm">{session.is_current ? 'Current' : '—'}</td></tr>)}</tbody></table></div> : <EmptyState title="No academic sessions" description="Create the current academic session to continue." action={<Button size="sm" onClick={() => setModal('session')}>Add session</Button>} />}</Card>
          <Card><CardHeader title="Grade levels" description="Demonstration levels can be renamed and configured to suit each school." />
            {grades.length ? <div className="flex flex-wrap gap-2">{grades.map((grade) => <span className="rounded-full bg-slate-100 px-3 py-1 text-sm text-navy-500" key={grade.id}>{grade.name} <span className="text-xs text-slate-400">{grade.academic_level}</span></span>)}</div> : <EmptyState title="No grade levels configured" description="The school administrator can create levels in the grade-level catalogue." />}</Card>
          <Card><div className="flex flex-wrap items-center justify-between gap-3"><CardHeader title="Classes & sections" description="Class sections are tied to an academic session." /><Button variant="outline" onClick={() => setModal('section')}>Add class section</Button></div>
            {classes.length ? <div className="overflow-x-auto"><table className="w-full min-w-[800px]"><thead><tr className="border-b text-left text-xs uppercase text-slate-500">{['Class', 'Level', 'Session', 'Campus', 'Sections', 'Subjects', 'Status'].map((item) => <th key={item} className="px-3 py-2">{item}</th>)}</tr></thead><tbody className="divide-y">{classes.map((item) => <tr key={item.id}><td className="px-3 py-2 text-sm font-medium">{item.name}</td><td className="px-3 py-2 text-sm">{gradeName(item.grade_level_id)}</td><td className="px-3 py-2 text-sm">{sessionName(item.academic_session_id)}</td><td className="px-3 py-2 text-sm">{campuses.find((campus) => campus.id === item.campus_id)?.name ?? '—'}</td><td className="px-3 py-2 text-sm">{sections.filter((section) => section.class_id === item.id).map((section) => <span key={section.id} className="mr-2 inline-block rounded bg-slate-100 px-2 py-1">{section.name}</span>)}</td><td className="px-3 py-2 text-sm">{classSubjects.filter((mapping) => mapping.class_id === item.id).map((mapping) => subjects.find((subject) => subject.id === mapping.subject_id)?.name).filter(Boolean).join(', ') || '—'}</td><td className="px-3 py-2 text-sm capitalize">{item.status}</td></tr>)}</tbody></table></div> : <EmptyState icon={<BookOpen className="h-7 w-7" />} title="No classes configured" description="Add grade levels and an academic session before creating classes." />}</Card>
          <Card><CardHeader title="Subject catalogue" description="Subjects are reusable across classes; duplicate names and codes are rejected." />
            {subjects.length ? <div className="overflow-x-auto"><table className="w-full"><thead><tr className="border-b text-left text-xs uppercase text-slate-500">{['Code', 'Subject', 'Level', 'Status'].map((item) => <th key={item} className="px-3 py-2">{item}</th>)}</tr></thead><tbody className="divide-y">{subjects.map((subject) => <tr key={subject.id}><td className="px-3 py-2 text-sm font-medium">{subject.code}</td><td className="px-3 py-2 text-sm">{subject.name}</td><td className="px-3 py-2 text-sm">{subject.academic_level ?? 'All levels'}</td><td className="px-3 py-2 text-sm">{subject.is_active ? 'Active' : 'Inactive'}</td></tr>)}</tbody></table></div> : <EmptyState title="No subjects yet" description="Add subjects to the catalogue, then assign them to classes." />}</Card>
        </>
      )}
      <Modal open={modal === 'session'} onClose={() => setModal(null)} title="Add academic session"><form className="space-y-4" onSubmit={(event) => void submit('academic_sessions', event, 'Academic session created.')}><Input name="name" label="Session name" placeholder="2026/2027" required /><Input name="starts_on" label="Start date" type="date" required /><Input name="ends_on" label="End date" type="date" required /><label className="flex gap-2 text-sm"><input type="checkbox" name="is_current" /> Mark as current session</label><FormActions close={() => setModal(null)} saving={saving} /></form></Modal>
      <Modal open={modal === 'grade'} onClose={() => setModal(null)} title="Add grade level" description="Grade levels are configurable; these names are only Cedarfield's initial defaults."><form className="space-y-4" onSubmit={(event) => void submit('grade_levels', event, 'Grade level added.')}><Input name="name" label="Grade level name" required /><Input name="academic_level" label="Academic level grouping" placeholder="Primary" required /><Input name="sort_order" label="Display order" type="number" defaultValue="0" /><FormActions close={() => setModal(null)} saving={saving} /></form></Modal>
      <Modal open={modal === 'class'} onClose={() => setModal(null)} title="Create class"><form className="space-y-4" onSubmit={(event) => void submit('classes', event, 'Class created.')}><Input name="name" label="Class name" placeholder="Primary 5" required /><Select name="grade_level_id" label="Academic level" required defaultValue=""><option value="" disabled>Select grade level</option>{grades.map((grade) => <option key={grade.id} value={grade.id}>{grade.name}</option>)}</Select><Select name="academic_session_id" label="Academic session" required defaultValue=""><option value="" disabled>Select session</option>{sessions.map((session) => <option key={session.id} value={session.id}>{session.name}</option>)}</Select><Select name="campus_id" label="Campus"><option value="">Not assigned</option>{campuses.map((campus) => <option key={campus.id} value={campus.id}>{campus.name}</option>)}</Select><Select name="status" label="Status" defaultValue="active"><option value="active">Active</option><option value="inactive">Inactive</option></Select><FormActions close={() => setModal(null)} saving={saving} /></form></Modal>
      <Modal open={modal === 'section'} onClose={() => setModal(null)} title="Add class section"><form className="space-y-4" onSubmit={(event) => void submit('class_sections', event, 'Class section created.')}><Select name="class_id" label="Class" required defaultValue=""><option value="" disabled>Select class</option>{classes.map((item) => <option key={item.id} value={item.id}>{item.name} · {sessionName(item.academic_session_id)}</option>)}</Select><Input name="name" label="Section / arm" placeholder="A" required /><Input name="classroom" label="Classroom" /><Input name="capacity" label="Capacity" type="number" min="1" /><Select name="class_teacher_id" label="Class teacher" defaultValue=""><option value="">Unassigned</option>{staff.map((member) => <option key={member.id} value={member.id}>{member.full_name ?? 'Staff member'}</option>)}</Select><FormActions close={() => setModal(null)} saving={saving} /></form></Modal>
      <Modal open={modal === 'subject'} onClose={() => setModal(null)} title="Add subject"><form className="space-y-4" onSubmit={(event) => void submit('subjects', event, 'Subject added.')}><Input name="name" label="Subject name" required /><Input name="code" label="Subject code" required /><Input name="academic_level" label="Academic level" /><Textarea name="description" label="Description" /><label className="flex gap-2 text-sm"><input type="checkbox" name="is_active" defaultChecked /> Active</label><FormActions close={() => setModal(null)} saving={saving} /></form></Modal>
      <Modal open={modal === 'assign'} onClose={() => setModal(null)} title="Assign subject to class"><form className="space-y-4" onSubmit={(event) => void assignSubject(event)}><Select name="class_id" label="Class" required defaultValue=""><option value="" disabled>Select class</option>{classes.map((item) => <option key={item.id} value={item.id}>{item.name} · {sessionName(item.academic_session_id)}</option>)}</Select><Select name="subject_id" label="Subject" required defaultValue=""><option value="" disabled>Select subject</option>{subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</Select><FormActions close={() => setModal(null)} saving={saving} /></form></Modal>
    </div>
  );
}

function FormActions({ close, saving }: { close: () => void; saving: boolean }) {
  return <div className="flex justify-end gap-2 border-t border-slate-100 pt-4"><Button type="button" variant="outline" onClick={close}>Cancel</Button><Button type="submit" loading={saving}>Save</Button></div>;
}
