import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { FileText, Plus } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState, LoadingSpinner } from '@/components/ui/EmptyState';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';

type Application = {
  id: string;
  applicant_first_name: string;
  applicant_middle_name: string | null;
  applicant_last_name: string;
  date_of_birth: string;
  status: string;
  parent_name: string;
  parent_phone: string;
  submitted_at: string;
  intended_grade_level_id: string;
  academic_session_id: string;
  linked_student_id: string | null;
};
type Grade = { id: string; name: string };
type Session = { id: string; name: string };
type Section = { id: string; name: string; class_id: string; academic_session_id: string };
type ClassItem = { id: string; grade_level_id: string };
type History = { id: string; action: string; notes: string | null; created_at: string };

const statuses = ['pending', 'under_review', 'accepted', 'rejected', 'withdrawn'];

export function AdmissionsManagementPage() {
  const { activeSchool } = useAuth();
  const { toast } = useToast();
  const [applications, setApplications] = useState<Application[]>([]);
  const [grades, setGrades] = useState<Grade[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [history, setHistory] = useState<History[]>([]);
  const [selected, setSelected] = useState<Application | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modal, setModal] = useState<'new' | 'accept' | 'history' | null>(null);

  const load = useCallback(async () => {
    if (!activeSchool) return;
    setLoading(true);
    const [applicationResult, gradeResult, sessionResult, sectionResult, classResult] = await Promise.all([
      supabase.from('admissions').select('id,applicant_first_name,applicant_middle_name,applicant_last_name,date_of_birth,status,parent_name,parent_phone,submitted_at,intended_grade_level_id,academic_session_id,linked_student_id').eq('school_id', activeSchool.id).order('submitted_at', { ascending: false }),
      supabase.from('grade_levels').select('id,name').eq('school_id', activeSchool.id).eq('is_active', true).order('sort_order'),
      supabase.from('academic_sessions').select('id,name').eq('school_id', activeSchool.id).order('starts_on', { ascending: false }),
      supabase.from('class_sections').select('id,name,class_id,academic_session_id').eq('school_id', activeSchool.id).eq('status', 'active'),
      supabase.from('classes').select('id,grade_level_id').eq('school_id', activeSchool.id).eq('status', 'active'),
    ]);
    for (const result of [applicationResult, gradeResult, sessionResult, sectionResult, classResult]) if (result.error) toast(result.error.message, 'error');
    setApplications((applicationResult.data ?? []) as Application[]);
    setGrades((gradeResult.data ?? []) as Grade[]);
    setSessions((sessionResult.data ?? []) as Session[]);
    setSections((sectionResult.data ?? []) as Section[]);
    setClasses((classResult.data ?? []) as ClassItem[]);
    setLoading(false);
  }, [activeSchool, toast]);

  useEffect(() => { void load(); }, [load]);

  const counts = useMemo(() => statuses.reduce<Record<string, number>>((acc, status) => {
    acc[status] = applications.filter((application) => application.status === status).length;
    return acc;
  }, {}), [applications]);

  const submitApplication = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeSchool) return;
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form).entries());
    const document = (form.elements.namedItem('supporting_document') as HTMLInputElement).files?.[0];
    const gender = values.gender;
    const payload = {
      school_id: activeSchool.id,
      applicant_first_name: values.applicant_first_name,
      applicant_middle_name: values.applicant_middle_name || null,
      applicant_last_name: values.applicant_last_name,
      date_of_birth: values.date_of_birth,
      gender,
      intended_grade_level_id: values.intended_grade_level_id,
      academic_session_id: values.academic_session_id,
      parent_name: values.parent_name,
      parent_relationship: values.parent_relationship,
      parent_phone: values.parent_phone,
      parent_email: values.parent_email || null,
      parent_address: values.parent_address || null,
      previous_school: values.previous_school || null,
      residential_address: values.residential_address || null,
      additional_notes: values.additional_notes || null,
    };
    setSaving(true);
    const { data, error } = await supabase.from('admissions').insert(payload).select('id').single();
    if (error) {
      setSaving(false);
      toast(error.message, 'error');
      return;
    }
    if (document) {
      const safeName = document.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const path = `${activeSchool.id}/admissions/${data.id}/${crypto.randomUUID()}-${safeName}`;
      const upload = await supabase.storage.from('school-documents').upload(path, document, { upsert: false });
      if (upload.error) {
        setSaving(false);
        toast(`Application saved, but the supporting document failed to upload: ${upload.error.message}`, 'error');
        setModal(null);
        await load();
        return;
      }
      const { error: documentError } = await supabase.from('admission_documents').insert({
        school_id: activeSchool.id, admission_id: data.id, file_name: document.name, storage_path: path,
      });
      if (documentError) {
        await supabase.storage.from('school-documents').remove([path]);
        setSaving(false);
        toast(`Application and file upload succeeded, but document indexing failed: ${documentError.message}`, 'error');
        setModal(null);
        await load();
        return;
      }
    }
    setSaving(false);
    toast('Admission application submitted.', 'success');
    setModal(null);
    await load();
  };

  const review = async (application: Application, status: 'under_review' | 'rejected' | 'withdrawn') => {
    const notes = window.prompt(status === 'under_review' ? 'Information needed / internal note (optional)' : 'Add an internal note (optional)');
    if (notes === null) return;
    const { error } = await supabase.rpc('review_admission', {
      p_admission_id: application.id, p_status: status, p_notes: notes || null,
    });
    if (error) toast(error.message, 'error');
    else { toast(`Application marked ${status.replace('_', ' ')}.`, 'success'); await load(); }
  };

  const accept = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selected) return;
    const form = new FormData(event.currentTarget);
    setSaving(true);
    const { data, error } = await supabase.rpc('accept_admission', {
      p_admission_id: selected.id, p_class_section_id: form.get('class_section_id'),
    });
    setSaving(false);
    if (error) { toast(error.message, 'error'); return; }
    toast(`Admission accepted. Student record created (${data}).`, 'success');
    setModal(null);
    setSelected(null);
    await load();
  };

  const showHistory = async (application: Application) => {
    if (!activeSchool) return;
    setSelected(application);
    const { data, error } = await supabase.from('admission_history').select('id,action,notes,created_at').eq('school_id', activeSchool.id).eq('admission_id', application.id).order('created_at', { ascending: false });
    if (error) toast(error.message, 'error');
    setHistory((data ?? []) as History[]);
    setModal('history');
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><h1 className="text-2xl font-bold font-display text-navy-500">Admissions</h1><p className="mt-1 text-sm text-slate-500">Review applications and accept students into a class and session.</p></div><Button onClick={() => setModal('new')}><Plus className="h-4 w-4" /> New application</Button></div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {[
          ['Total applications', applications.length],
          ['Pending', counts.pending ?? 0],
          ['Under review', counts.under_review ?? 0],
          ['Accepted', counts.accepted ?? 0],
          ['Rejected', counts.rejected ?? 0],
        ].map(([label, count]) => <Card key={label}><p className="text-sm text-slate-500">{label}</p><p className="mt-2 text-2xl font-bold text-navy-500">{count}</p></Card>)}
      </div>
      <Card noPadding>{loading ? <LoadingSpinner /> : applications.length === 0 ? <EmptyState icon={<FileText className="h-7 w-7" />} title="No applications yet" description="Submit an application to begin the admissions workflow." action={<Button size="sm" onClick={() => setModal('new')}>New application</Button>} /> : (
        <div className="overflow-x-auto"><table className="w-full min-w-[950px]"><thead><tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase text-slate-500">{['Applicant', 'Intended class', 'Parent / guardian', 'Submitted', 'Status', 'Actions'].map((heading) => <th key={heading} className="px-4 py-3 font-semibold">{heading}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{applications.map((application) => {
          const eligibleSections = sections.filter((section) => section.academic_session_id === application.academic_session_id
            && classes.some((item) => item.id === section.class_id && item.grade_level_id === application.intended_grade_level_id));
          const gradeName = grades.find((grade) => grade.id === application.intended_grade_level_id)?.name ?? 'Unknown level';
          return <tr key={application.id} className="hover:bg-slate-50"><td className="px-4 py-3"><p className="text-sm font-medium text-navy-500">{application.applicant_first_name} {application.applicant_last_name}</p><p className="text-xs text-slate-500">DOB {application.date_of_birth}</p></td><td className="px-4 py-3 text-sm text-slate-600">{gradeName} · {sessions.find((session) => session.id === application.academic_session_id)?.name}</td><td className="px-4 py-3 text-sm text-slate-600">{application.parent_name}<br />{application.parent_phone}</td><td className="px-4 py-3 text-sm text-slate-600">{new Date(application.submitted_at).toLocaleDateString()}</td><td className="px-4 py-3"><Badge variant={application.status === 'accepted' ? 'success' : application.status === 'rejected' ? 'error' : 'neutral'}>{application.status.replace('_', ' ')}</Badge></td><td className="px-4 py-3"><div className="flex flex-wrap gap-1"><Button size="sm" variant="outline" onClick={() => void showHistory(application)}>History</Button>{['pending', 'under_review'].includes(application.status) && <><Button size="sm" variant="outline" onClick={() => void review(application, 'under_review')}>Review / request info</Button><Button size="sm" variant="outline" disabled={!eligibleSections.length} onClick={() => { setSelected(application); setModal('accept'); }}>Accept</Button><Button size="sm" variant="danger" onClick={() => void review(application, 'rejected')}>Reject</Button><Button size="sm" variant="outline" onClick={() => void review(application, 'withdrawn')}>Withdraw</Button></>}{application.linked_student_id && <Link className="self-center text-xs text-primary-700 hover:underline" to={`/students/${application.linked_student_id}`}>View student</Link>}</div>{application.status === 'pending' && eligibleSections.length === 0 && <p className="mt-1 text-xs text-warning-600">Create a matching class section for this session before accepting.</p>}</td></tr>;
        })}</tbody></table></div>
      )}</Card>
      <Modal open={modal === 'new'} onClose={() => setModal(null)} title="Submit admission application" description="Application and guardian details are stored in the selected school." size="lg">
        <form className="max-h-[70vh] space-y-4 overflow-y-auto pr-1" onSubmit={(event) => void submitApplication(event)}>
          <div className="grid gap-3 sm:grid-cols-2"><Input name="applicant_first_name" label="Applicant first name" required /><Input name="applicant_middle_name" label="Middle name" /><Input name="applicant_last_name" label="Applicant last name" required /><Input name="date_of_birth" label="Date of birth" type="date" required /><Select name="gender" label="Gender" required defaultValue=""><option value="" disabled>Select gender</option><option value="female">Female</option><option value="male">Male</option><option value="other">Other</option></Select><Select name="intended_grade_level_id" label="Intended class level" required defaultValue=""><option value="" disabled>Select level</option>{grades.map((grade) => <option key={grade.id} value={grade.id}>{grade.name}</option>)}</Select><Select name="academic_session_id" label="Academic session" required defaultValue=""><option value="" disabled>Select session</option>{sessions.map((session) => <option key={session.id} value={session.id}>{session.name}</option>)}</Select><Input name="previous_school" label="Previous school" /><Input name="residential_address" label="Residential address" /><Input name="parent_name" label="Parent / guardian name" required /><Input name="parent_relationship" label="Relationship" required defaultValue="Parent" /><Input name="parent_phone" label="Parent / guardian phone" required /><Input name="parent_email" label="Parent / guardian email" type="email" /><Input name="parent_address" label="Parent / guardian address" /><div className="sm:col-span-2"><Input name="supporting_document" label="Supporting document (optional)" type="file" accept=".pdf,.png,.jpg,.jpeg" /></div><div className="sm:col-span-2"><Textarea name="additional_notes" label="Additional notes" /></div></div>
          <FormActions close={() => setModal(null)} saving={saving} label="Submit application" />
        </form>
      </Modal>
      <Modal open={modal === 'accept'} onClose={() => setModal(null)} title="Accept application" description="This operation creates the student, links a guardian, and creates the first enrolment atomically.">
        <form className="space-y-4" onSubmit={(event) => void accept(event)}><p className="text-sm text-slate-600">Accepting {selected?.applicant_first_name} {selected?.applicant_last_name} will generate a unique student ID.</p><Select name="class_section_id" label="Class section" required defaultValue=""><option value="" disabled>Select class section</option>{sections.filter((section) => section.academic_session_id === selected?.academic_session_id && classes.some((item) => item.id === section.class_id && item.grade_level_id === selected.intended_grade_level_id)).map((section) => <option key={section.id} value={section.id}>{section.name}</option>)}</Select><FormActions close={() => setModal(null)} saving={saving} label="Accept & enrol" /></form>
      </Modal>
      <Modal open={modal === 'history'} onClose={() => setModal(null)} title="Application history" description={`${selected?.applicant_first_name ?? ''} ${selected?.applicant_last_name ?? ''}`}>
        {history.length ? <div className="divide-y divide-slate-100">{history.map((item) => <div key={item.id} className="py-3"><p className="text-sm font-medium capitalize text-navy-500">{item.action.replace(/_/g, ' ')}</p>{item.notes && <p className="mt-1 text-sm text-slate-600">{item.notes}</p>}<p className="mt-1 text-xs text-slate-400">{new Date(item.created_at).toLocaleString()}</p></div>)}</div> : <EmptyState title="No review history" description="History is recorded as administrators review this application." />}
      </Modal>
    </div>
  );
}

function FormActions({ close, saving, label }: { close: () => void; saving: boolean; label: string }) {
  return <div className="flex justify-end gap-2 border-t border-slate-100 pt-4"><Button type="button" variant="outline" onClick={close}>Cancel</Button><Button type="submit" loading={saving}>{label}</Button></div>;
}
