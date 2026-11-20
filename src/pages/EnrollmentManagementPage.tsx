import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckSquare, Plus } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { EmptyState, LoadingSpinner } from '@/components/ui/EmptyState';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';

type Student = { id: string; student_id: string; first_name: string; last_name: string; status: string };
type Session = { id: string; name: string };
type ClassItem = { id: string; name: string; academic_session_id: string; campus_id: string | null };
type Section = { id: string; name: string; class_id: string; academic_session_id: string };
type Enrollment = { id: string; student_id: string; academic_session_id: string; class_id: string; class_section_id: string; enrolment_date: string; status: string };

export function EnrollmentManagementPage() {
  const { activeSchool } = useAuth();
  const { toast } = useToast();
  const [students, setStudents] = useState<Student[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<'new' | 'promote' | null>(null);
  const [transferMode, setTransferMode] = useState<'promotion' | 'class_transfer' | 'campus_transfer'>('promotion');
  const [saving, setSaving] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const load = useCallback(async () => {
    if (!activeSchool) return;
    setLoading(true);
    const [studentResult, sessionResult, classResult, sectionResult, enrollmentResult] = await Promise.all([
      supabase.from('students').select('id,student_id,first_name,last_name,status').eq('school_id', activeSchool.id).order('last_name'),
      supabase.from('academic_sessions').select('id,name').eq('school_id', activeSchool.id).order('name', { ascending: false }),
      supabase.from('classes').select('id,name,academic_session_id,campus_id').eq('school_id', activeSchool.id),
      supabase.from('class_sections').select('id,name,class_id,academic_session_id').eq('school_id', activeSchool.id).eq('status', 'active'),
      supabase.from('enrollments').select('id,student_id,academic_session_id,class_id,class_section_id,enrolment_date,status').eq('school_id', activeSchool.id).order('created_at', { ascending: false }),
    ]);
    for (const result of [studentResult, sessionResult, classResult, sectionResult, enrollmentResult]) if (result.error) toast(result.error.message, 'error');
    setStudents((studentResult.data ?? []) as Student[]);
    setSessions((sessionResult.data ?? []) as Session[]);
    setClasses((classResult.data ?? []) as ClassItem[]);
    setSections((sectionResult.data ?? []) as Section[]);
    setEnrollments((enrollmentResult.data ?? []) as Enrollment[]);
    setLoading(false);
  }, [activeSchool, toast]);

  useEffect(() => { void load(); }, [load]);

  const activeEnrollments = useMemo(() => enrollments.filter((item) => item.status === 'active'), [enrollments]);
  const changeEnrollment = async (studentId: string, sectionId: string, type: string, notes: string | null) => {
    if (!activeSchool) return { error: 'Select a school before transferring students.' };
    const { data, error } = await supabase.rpc('transfer_student', {
      p_school_id: activeSchool.id,
      p_student_id: studentId,
      p_new_class_section_id: sectionId,
      p_transfer_type: type,
      p_notes: notes,
    });
    if (error) return { error: error.message };
    return { id: data as string };
  };

  const createEnrollment = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeSchool) return;
    const form = new FormData(event.currentTarget);
    setSaving(true);
    const { error } = await supabase.rpc('create_enrollment', {
      p_school_id: activeSchool.id,
      p_student_id: form.get('student_id'),
      p_class_section_id: form.get('class_section_id'),
      p_enrolment_date: form.get('enrolment_date'),
    });
    setSaving(false);
    if (error) { toast(error.message, 'error'); return; }
    toast('Student enrolled. Earlier enrolments remain in the academic history.', 'success');
    setModal(null);
    await load();
  };

  const promoteStudents = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeSchool || selectedIds.length === 0) return;
    const form = new FormData(event.currentTarget);
    const targetSectionId = String(form.get('class_section_id') ?? '');
    const notes = String(form.get('notes') ?? '') || null;
    const actionLabel = transferMode === 'promotion' ? 'Promote' : transferMode === 'class_transfer' ? 'Transfer' : 'Transfer campus for';
    const confirmed = window.confirm(`${actionLabel} ${selectedIds.length} selected student${selectedIds.length === 1 ? '' : 's'}? Each student's existing enrolment will be preserved in history.`);
    if (!confirmed) return;
    setSaving(true);
    if (transferMode === 'promotion') {
      const { data, error } = await supabase.rpc('promote_class_students', {
        p_school_id: activeSchool.id,
        p_student_ids: selectedIds,
        p_destination_section_id: targetSectionId,
        p_notes: notes,
      });
      setSaving(false);
      if (error) {
        toast(error.message, 'error');
        return;
      }
      toast(`${data} student(s) promoted successfully.`, 'success');
      setSelectedIds([]);
      setModal(null);
      await load();
      return;
    }
    const failures: string[] = [];
    for (const studentId of selectedIds) {
      const result = await changeEnrollment(studentId, targetSectionId, transferMode, notes);
      if ('error' in result) failures.push(`${studentName(studentId)}: ${result.error}`);
    }
    setSaving(false);
    if (failures.length) toast(`${selectedIds.length - failures.length} student(s) transferred; ${failures.length} failed: ${failures[0]}`, 'error');
    else toast(`${selectedIds.length} student(s) transferred successfully.`, 'success');
    setSelectedIds([]);
    setModal(null);
    await load();
  };

  const withdraw = async (studentId: string) => {
    if (!activeSchool || !window.confirm('Withdraw this student from their active enrolment? Past enrolments will be kept.')) return;
    const { error } = await supabase.rpc('transfer_student', {
      p_school_id: activeSchool.id, p_student_id: studentId, p_new_class_section_id: null,
      p_transfer_type: 'withdrawal', p_notes: null,
    });
    if (error) toast(error.message, 'error');
    else { toast('Student withdrawn; enrolment history preserved.', 'success'); await load(); }
  };

  const sectionName = (id: string) => {
    const section = sections.find((item) => item.id === id);
    return section ? `${classes.find((item) => item.id === section.class_id)?.name ?? 'Class'} ${section.name}` : 'Unknown class';
  };
  const studentName = (id: string) => {
    const student = students.find((item) => item.id === id);
    return student ? `${student.first_name} ${student.last_name}` : 'Unknown student';
  };
  const selectedSource = activeEnrollments.filter((enrollment) => selectedIds.includes(enrollment.student_id));
  const firstSource = selectedSource[0];
  const sameClassAndSession = selectedSource.length > 0 && selectedSource.every((item) =>
    item.class_id === firstSource.class_id && item.academic_session_id === firstSource.academic_session_id,
  );
  const targetSession = firstSource?.academic_session_id;
  const sourceCampusId = firstSource ? classes.find((item) => item.id === firstSource.class_id)?.campus_id : null;
  const targets = sections.filter((section) => {
    const destinationClass = classes.find((item) => item.id === section.class_id);
    if (transferMode === 'promotion') return section.academic_session_id !== targetSession;
    if (!firstSource || section.id === firstSource.class_section_id || section.academic_session_id !== targetSession) return false;
    if (transferMode === 'class_transfer') return true;
    return Boolean(sourceCampusId && destinationClass?.campus_id && destinationClass.campus_id !== sourceCampusId);
  });
  const openTransfer = (studentId: string, mode: 'class_transfer' | 'campus_transfer') => {
    setSelectedIds([studentId]);
    setTransferMode(mode);
    setModal('promote');
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><h1 className="text-2xl font-bold font-display text-navy-500">Enrolments</h1><p className="mt-1 text-sm text-slate-500">Manage session enrolments, class promotions, transfers, and withdrawals.</p></div><div className="flex gap-2"><Button variant="outline" disabled={!sameClassAndSession} onClick={() => { setTransferMode('promotion'); setModal('promote'); }}><CheckSquare className="h-4 w-4" /> Promote selected ({selectedIds.length})</Button><Button onClick={() => setModal('new')}><Plus className="h-4 w-4" /> New enrolment</Button></div></div>
      <Card><CardHeader title="Current enrolments" description="Select students in one class to start a bulk promotion." />
        {loading ? <LoadingSpinner /> : activeEnrollments.length === 0 ? <EmptyState title="No active enrolments" description="Create an enrolment after setting up classes, sections, and an academic session." /> : (
          <div className="overflow-x-auto"><table className="w-full min-w-[850px]"><thead><tr className="border-b text-left text-xs uppercase text-slate-500"><th className="px-3 py-2"><input aria-label="Select students in first class" type="checkbox" checked={sameClassAndSession && selectedSource.length === activeEnrollments.filter((item) => item.class_id === firstSource.class_id && item.academic_session_id === firstSource.academic_session_id).length} onChange={(event) => {
            if (!firstSource) return;
            const group = activeEnrollments.filter((item) => item.class_id === firstSource.class_id && item.academic_session_id === firstSource.academic_session_id).map((item) => item.student_id);
            setSelectedIds(event.target.checked ? group : []);
          }} /></th>{['Student ID', 'Student', 'Session', 'Class section', 'Enrolment date', 'Actions'].map((heading) => <th key={heading} className="px-3 py-2">{heading}</th>)}</tr></thead>
            <tbody className="divide-y">{activeEnrollments.map((enrollment) => <tr key={enrollment.id}>
              <td className="px-3 py-2"><input aria-label={`Select ${studentName(enrollment.student_id)}`} type="checkbox" checked={selectedIds.includes(enrollment.student_id)} onChange={(event) => {
                if (!event.target.checked) {
                  setSelectedIds((ids) => ids.filter((id) => id !== enrollment.student_id));
                  return;
                }
                if (selectedSource.length && (enrollment.class_id !== firstSource.class_id || enrollment.academic_session_id !== firstSource.academic_session_id)) {
                  toast('Bulk promotion is limited to one class and session at a time.', 'warning');
                  return;
                }
                setSelectedIds((ids) => ids.includes(enrollment.student_id) ? ids : [...ids, enrollment.student_id]);
              }} /></td>
              <td className="px-3 py-2 text-sm">{students.find((student) => student.id === enrollment.student_id)?.student_id ?? '—'}</td><td className="px-3 py-2 text-sm font-medium">{studentName(enrollment.student_id)}</td><td className="px-3 py-2 text-sm">{sessions.find((session) => session.id === enrollment.academic_session_id)?.name ?? '—'}</td><td className="px-3 py-2 text-sm">{sectionName(enrollment.class_section_id)}</td><td className="px-3 py-2 text-sm">{enrollment.enrolment_date}</td>              <td className="px-3 py-2"><div className="flex gap-1"><Button size="sm" variant="outline" onClick={() => openTransfer(enrollment.student_id, 'class_transfer')}>Transfer class</Button><Button size="sm" variant="outline" disabled={!classes.find((item) => item.id === enrollment.class_id)?.campus_id} onClick={() => openTransfer(enrollment.student_id, 'campus_transfer')}>Transfer campus</Button><Button size="sm" variant="outline" onClick={() => void withdraw(enrollment.student_id)}>Withdraw</Button></div></td>
            </tr>)}</tbody></table></div>
        )}
      </Card>
      <Card><CardHeader title="Academic history" description="Completed, transferred, and withdrawn enrolments remain available." />
        <div className="space-y-2">{enrollments.filter((item) => item.status !== 'active').slice(0, 20).map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 py-2 text-sm"><span>{studentName(item.student_id)} · {sessions.find((session) => session.id === item.academic_session_id)?.name} · {sectionName(item.class_section_id)}</span><Badge variant="neutral">{item.status}</Badge></div>)}{enrollments.every((item) => item.status === 'active') && <p className="text-sm text-slate-500">No prior enrolment history yet.</p>}</div>
      </Card>
      {selectedIds.length > 0 && !sameClassAndSession && <p className="text-sm text-warning-700">Select students from a single class and academic session for bulk promotion.</p>}
      <Modal open={modal === 'new'} onClose={() => setModal(null)} title="Create enrolment" description="The student must not already have an active enrolment for that session.">
        <form className="space-y-4" onSubmit={(event) => void createEnrollment(event)}><Select name="student_id" label="Student" required defaultValue=""><option value="" disabled>Select student</option>{students.filter((student) => student.status === 'active').map((student) => <option key={student.id} value={student.id}>{student.student_id} · {student.first_name} {student.last_name}</option>)}</Select><Select name="class_section_id" label="Class section" required defaultValue=""><option value="" disabled>Select section</option>{sections.map((section) => <option key={section.id} value={section.id}>{sectionName(section.id)} · {sessions.find((session) => session.id === section.academic_session_id)?.name}</option>)}</Select><Input name="enrolment_date" label="Enrolment date" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required /><FormActions close={() => setModal(null)} saving={saving} /></form>
      </Modal>
      <Modal open={modal === 'promote'} onClose={() => setModal(null)} title={transferMode === 'promotion' ? 'Bulk promotion' : transferMode === 'class_transfer' ? 'Class transfer' : 'Campus transfer'} description="Review the selected students and destination before confirming the operation." size="lg">
        <form className="space-y-4" onSubmit={(event) => void promoteStudents(event)}><p className="text-sm text-slate-600">Selected: {selectedIds.map(studentName).join(', ') || 'None'}</p><Select name="class_section_id" label="Destination section" required defaultValue=""><option value="" disabled>{transferMode === 'promotion' ? 'Select next-session section' : 'Select destination section'}</option>{targets.map((section) => <option key={section.id} value={section.id}>{sectionName(section.id)} · {sessions.find((session) => session.id === section.academic_session_id)?.name}</option>)}</Select><Textarea name="notes" label="Notes (optional)" /><p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800">Confirmation is required. Each student is processed individually; failures are reported and successful history is preserved.</p><FormActions close={() => setModal(null)} saving={saving} label={transferMode === 'promotion' ? 'Review & promote' : 'Review & transfer'} /></form>
      </Modal>
    </div>
  );
}

function FormActions({ close, saving, label = 'Save' }: { close: () => void; saving: boolean; label?: string }) {
  return <div className="flex justify-end gap-2 border-t border-slate-100 pt-4"><Button type="button" variant="outline" onClick={close}>Cancel</Button><Button type="submit" loading={saving}>{label}</Button></div>;
}
