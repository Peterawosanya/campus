import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { FileCheck2, Plus, Send, Settings2 } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { EmptyState, LoadingSpinner } from '@/components/ui/EmptyState';
import { Input, Select } from '@/components/ui/Input';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/components/ui/Toast';
import { supabase } from '@/lib/supabase';

type Session = { id: string; name: string };
type Term = { id: string; name: string; academic_session_id: string; starts_on: string; ends_on: string };
type Section = { id: string; name: string; class_id: string; academic_session_id: string; class_name: string };
type Subject = { id: string; name: string };
type AssessmentType = { id: string; name: string };
type Assessment = { id: string; name: string; term_id: string; academic_session_id: string; class_section_id: string; subject_id: string; assessment_type_id: string; max_score: number; weighting: number; status: string };
type RosterStudent = { id: string; student_id: string; first_name: string; last_name: string };
type Score = { student_id: string; score: number | null; status: string };

export function AssessmentsPage() {
  const { activeSchool, activeRoles } = useAuth();
  const { toast } = useToast();
  const canManage = activeRoles.some((role) => ['platform_admin', 'school_owner', 'school_admin', 'academic_admin'].includes(role));
  const [sessions, setSessions] = useState<Session[]>([]);
  const [terms, setTerms] = useState<Term[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [types, setTypes] = useState<AssessmentType[]>([]);
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [selectedSection, setSelectedSection] = useState('');
  const [selectedTerm, setSelectedTerm] = useState('');
  const [selectedAssessment, setSelectedAssessment] = useState('');
  const [roster, setRoster] = useState<RosterStudent[]>([]);
  const [scores, setScores] = useState<Record<string, string>>({});
  const [scoreStatuses, setScoreStatuses] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!activeSchool) return;
    setLoading(true);
    const [sessionResult, termResult, sectionResult, typeResult, assessmentResult] = await Promise.all([
      supabase.from('academic_sessions').select('id,name').eq('school_id', activeSchool.id).order('starts_on', { ascending: false }),
      supabase.from('academic_terms').select('id,name,academic_session_id,starts_on,ends_on').eq('school_id', activeSchool.id).order('starts_on', { ascending: false }),
      supabase.from('class_sections').select('id,name,class_id,academic_session_id').eq('school_id', activeSchool.id).eq('status', 'active').order('name'),
      supabase.from('assessment_types').select('id,name').eq('school_id', activeSchool.id).eq('is_active', true).order('name'),
      supabase.from('assessments').select('id,name,term_id,academic_session_id,class_section_id,subject_id,assessment_type_id,max_score,weighting,status').eq('school_id', activeSchool.id).order('created_at', { ascending: false }),
    ]);
    for (const result of [sessionResult, termResult, sectionResult, typeResult, assessmentResult]) if (result.error) toast(result.error.message, 'error');
    const classIds = [...new Set((sectionResult.data ?? []).map((item) => item.class_id))];
    const classResult = classIds.length ? await supabase.from('classes').select('id,name').eq('school_id', activeSchool.id).in('id', classIds) : { data: [], error: null };
    if (classResult.error) toast(classResult.error.message, 'error');
    const classNames = new Map((classResult.data ?? []).map((item) => [item.id, item.name]));
    const sectionOptions = (sectionResult.data ?? []).map((item) => ({ ...item, class_name: classNames.get(item.class_id) ?? 'Class' }));
    setSessions((sessionResult.data ?? []) as Session[]);
    setTerms((termResult.data ?? []) as Term[]);
    setSections(sectionOptions);
    setTypes((typeResult.data ?? []) as AssessmentType[]);
    setAssessments((assessmentResult.data ?? []) as Assessment[]);
    if (!selectedSection && sectionOptions.length) setSelectedSection(sectionOptions[0].id);
    if (!selectedTerm && termResult.data?.length) setSelectedTerm(termResult.data[0].id);
    if (!selectedAssessment && assessmentResult.data?.length) setSelectedAssessment(assessmentResult.data[0].id);
    setLoading(false);
  }, [activeSchool, selectedAssessment, selectedSection, selectedTerm, toast]);

  useEffect(() => { void load(); }, [load]);
  const selectedSectionInfo = sections.find((item) => item.id === selectedSection);
  const sectionTerms = terms.filter((term) => term.academic_session_id === selectedSectionInfo?.academic_session_id);
  const sectionAssessments = assessments.filter((item) => item.class_section_id === selectedSection && item.term_id === selectedTerm);
  const activeAssessment = assessments.find((item) => item.id === selectedAssessment);

  useEffect(() => {
    let cancelled = false;
    async function loadScoreRoster() {
      if (!activeSchool || !activeAssessment) { setRoster([]); setScores({}); setScoreStatuses({}); return; }
      const [enrollmentResult, scoreResult] = await Promise.all([
        supabase.from('enrollments').select('student_id,students!inner(id,student_id,first_name,last_name)')
          .eq('school_id', activeSchool.id).eq('class_section_id', activeAssessment.class_section_id)
          .eq('academic_session_id', activeAssessment.academic_session_id).eq('status', 'active'),
        supabase.from('assessment_scores').select('student_id,score,status').eq('school_id', activeSchool.id).eq('assessment_id', activeAssessment.id),
      ]);
      if (enrollmentResult.error) toast(enrollmentResult.error.message, 'error');
      if (scoreResult.error) toast(scoreResult.error.message, 'error');
      if (cancelled) return;
      const scoreByStudent = new Map((scoreResult.data ?? []).map((item) => [item.student_id, item as Score]));
      const rows = (enrollmentResult.data ?? []).map((item) => item.students as unknown as RosterStudent);
      setRoster(rows);
      setScores(Object.fromEntries(rows.map((student) => {
        const score = scoreByStudent.get(student.id)?.score;
        return [student.id, score === null || score === undefined ? '' : String(score)];
      })));
      setScoreStatuses(Object.fromEntries(rows.map((student) => [student.id, scoreByStudent.get(student.id)?.status ?? 'draft'])));
    }
    void loadScoreRoster();
    return () => { cancelled = true; };
  }, [activeSchool, activeAssessment, toast]);

  const availableSubjects = useMemo(() => subjects, [subjects]);
  useEffect(() => {
    let cancelled = false;
    async function loadSubjects() {
      if (!activeSchool || !selectedSectionInfo) { setSubjects([]); return; }
      const { data: mappings, error } = await supabase.from('class_subjects').select('subject_id')
        .eq('school_id', activeSchool.id).eq('class_id', selectedSectionInfo.class_id);
      if (error) toast(error.message, 'error');
      const ids = [...new Set((mappings ?? []).map((item) => item.subject_id))];
      const result = ids.length ? await supabase.from('subjects').select('id,name').eq('school_id', activeSchool.id).in('id', ids) : { data: [], error: null };
      if (result.error) toast(result.error.message, 'error');
      if (!cancelled) setSubjects((result.data ?? []) as Subject[]);
    }
    void loadSubjects();
    return () => { cancelled = true; };
  }, [activeSchool, selectedSectionInfo, toast]);

  const createTerm = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeSchool || !canManage) return;
    const form = new FormData(event.currentTarget);
    const sessionId = String(form.get('session_id'));
    const { error } = await supabase.from('academic_terms').insert({
      school_id: activeSchool.id, academic_session_id: sessionId, name: String(form.get('name')),
      starts_on: String(form.get('starts_on')), ends_on: String(form.get('ends_on')),
    });
    if (error) { toast(error.message, 'error'); return; }
    toast('Academic term created.', 'success'); event.currentTarget.reset(); await load();
  };
  const createType = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeSchool || !canManage) return;
    const form = new FormData(event.currentTarget);
    const { error } = await supabase.from('assessment_types').insert({ school_id: activeSchool.id, name: String(form.get('name')) });
    if (error) { toast(error.message, 'error'); return; }
    toast('Assessment type added.', 'success'); event.currentTarget.reset(); await load();
  };
  const createAssessment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeSchool || !canManage || !selectedSectionInfo) return;
    const form = new FormData(event.currentTarget);
    const { error } = await supabase.from('assessments').insert({
      school_id: activeSchool.id, academic_session_id: selectedSectionInfo.academic_session_id,
      class_section_id: selectedSection, term_id: String(form.get('term_id')), subject_id: String(form.get('subject_id')),
      assessment_type_id: String(form.get('assessment_type_id')), name: String(form.get('name')),
      max_score: Number(form.get('max_score')), weighting: Number(form.get('weighting')),
      starts_on: form.get('starts_on') || null, ends_on: form.get('ends_on') || null,
    });
    if (error) { toast(error.message, 'error'); return; }
    toast('Assessment configured. Weightings are validated when results are computed.', 'success'); event.currentTarget.reset(); await load();
  };
  const saveScores = async (submit: boolean) => {
    if (!activeAssessment || !activeSchool) return;
    const invalid = roster.find((student) => {
      const raw = scores[student.id] ?? '';
      return raw.trim() !== '' && (!Number.isFinite(Number(raw)) || Number(raw) < 0 || Number(raw) > Number(activeAssessment.max_score));
    });
    if (invalid) { toast(`Check ${invalid.first_name} ${invalid.last_name}: enter a score from 0 to ${activeAssessment.max_score}.`, 'error'); return; }
    if (submit && roster.some((student) => !scores[student.id]?.trim())) {
      toast('Enter a score for every enrolled student before submitting. Missing scores are not counted as zero.', 'error'); return;
    }
    setSaving(true);
    const { error } = await supabase.rpc('save_assessment_scores', {
      p_assessment_id: activeAssessment.id,
      p_submit: submit,
      p_scores: roster.map((student) => ({ student_id: student.id, score: scores[student.id]?.trim() ? Number(scores[student.id]) : null })),
    });
    setSaving(false);
    if (error) { toast(error.message, 'error'); return; }
    toast(submit ? 'Scores submitted for academic review.' : 'Draft scores saved.', 'success');
    await load();
  };
  const reviewScores = async (approve: boolean) => {
    if (!activeAssessment) return;
    setSaving(true);
    const { error } = await supabase.rpc('review_assessment_scores', { p_assessment_id: activeAssessment.id, p_approve: approve });
    setSaving(false);
    if (error) { toast(error.message, 'error'); return; }
    toast(approve ? 'Reviewed scores approved for result computation.' : 'Scores reviewed and ready for approval.', 'success');
    await load();
  };

  if (!activeSchool) return <EmptyState icon={<FileCheck2 className="h-7 w-7" />} title="No school selected" description="Select a school to manage assessments." />;

  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold font-display text-navy-500">Assessments</h1><p className="mt-1 text-sm text-slate-500">Configure assessment components and enter scores for assigned classes.</p></div>
      {canManage && <Card>
        <CardHeader title="Academic setup" description="Create terms and assessment categories before configuring assessments." />
        <div className="grid gap-6 lg:grid-cols-2">
          <form onSubmit={createTerm} className="grid gap-3 sm:grid-cols-2">
            <Select name="session_id" label="Academic session" required>{sessions.map((session) => <option key={session.id} value={session.id}>{session.name}</option>)}</Select>
            <Input name="name" label="Term name" placeholder="Term 1" required />
            <Input name="starts_on" label="Starts" type="date" required />
            <Input name="ends_on" label="Ends" type="date" required />
            <Button className="sm:col-span-2"><Plus className="h-4 w-4" /> Add term</Button>
          </form>
          <form onSubmit={createType} className="flex items-end gap-3">
            <Input name="name" label="Assessment type" placeholder="Class test, assignment..." required />
            <Button><Plus className="h-4 w-4" /> Add type</Button>
          </form>
        </div>
      </Card>}
      {canManage && <Card>
        <CardHeader title="Configure an assessment" description="Weightings are school-configurable and must total 100% per subject before results can be computed." />
        <form onSubmit={createAssessment} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Select label="Class and section" value={selectedSection} onChange={(event) => setSelectedSection(event.target.value)} required>{sections.map((section) => <option key={section.id} value={section.id}>{section.class_name} {section.name}</option>)}</Select>
          <Select name="term_id" label="Term" value={selectedTerm} onChange={(event) => setSelectedTerm(event.target.value)} required>{sectionTerms.map((term) => <option key={term.id} value={term.id}>{term.name}</option>)}</Select>
          <Select name="subject_id" label="Subject" required>{availableSubjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</Select>
          <Select name="assessment_type_id" label="Type" required>{types.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}</Select>
          <Input name="name" label="Assessment name" placeholder="Mid-term test" required />
          <Input name="max_score" label="Maximum score" type="number" min="0.01" step="0.01" required />
          <Input name="weighting" label="Weight (%)" type="number" min="0.01" max="100" step="0.01" required />
          <div className="flex items-end"><Button disabled={!sectionTerms.length || !types.length || !subjects.length}><Plus className="h-4 w-4" /> Create assessment</Button></div>
        </form>
      </Card>}
      <Card>
        <div className="grid gap-4 sm:grid-cols-3">
          <Select label="Class and section" value={selectedSection} onChange={(event) => setSelectedSection(event.target.value)}>{sections.map((section) => <option key={section.id} value={section.id}>{section.class_name} {section.name}</option>)}</Select>
          <Select label="Term" value={selectedTerm} onChange={(event) => setSelectedTerm(event.target.value)}>{sectionTerms.map((term) => <option key={term.id} value={term.id}>{term.name}</option>)}</Select>
          <Select label="Assessment" value={selectedAssessment} onChange={(event) => setSelectedAssessment(event.target.value)}><option value="">Select assessment</option>{sectionAssessments.map((assessment) => <option key={assessment.id} value={assessment.id}>{assessment.name} · {assessment.weighting}%</option>)}</Select>
        </div>
      </Card>
      {activeAssessment && <Card noPadding>
        <div className="p-5"><CardHeader title={`${activeAssessment.name} score entry`} description={`Maximum ${activeAssessment.max_score} · Weight ${activeAssessment.weighting}%`} action={<Badge variant={activeAssessment.status === 'open' ? 'success' : 'navy'}>{activeAssessment.status}</Badge>} /></div>
        {loading ? <div className="p-6"><LoadingSpinner /></div> : roster.length ? <>
          <div className="overflow-x-auto"><table className="w-full min-w-[600px]"><thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Student</th><th className="px-4 py-3">ID</th><th className="px-4 py-3">Score / {activeAssessment.max_score}</th><th className="px-4 py-3">Workflow</th></tr></thead><tbody className="divide-y divide-slate-100">{roster.map((student) => <tr key={student.id}><td className="px-4 py-3 font-medium text-navy-500">{student.first_name} {student.last_name}</td><td className="px-4 py-3 text-sm text-slate-500">{student.student_id}</td><td className="px-4 py-3"><Input type="number" min="0" max={activeAssessment.max_score} step="0.01" aria-label={`Score for ${student.first_name} ${student.last_name}`} value={scores[student.id] ?? ''} disabled={scoreStatuses[student.id] === 'approved' && !canManage} onChange={(event) => setScores((current) => ({ ...current, [student.id]: event.target.value }))} placeholder="Not entered" /></td><td className="px-4 py-3"><Badge variant={scoreStatuses[student.id] === 'approved' ? 'success' : scoreStatuses[student.id] === 'submitted' ? 'warning' : 'navy'}>{scoreStatuses[student.id] ?? 'draft'}</Badge></td></tr>)}</tbody></table></div>
          <div className="flex flex-wrap gap-2 border-t border-slate-100 p-4">
            <Button variant="outline" onClick={() => void saveScores(false)} loading={saving}><Settings2 className="h-4 w-4" /> Save draft</Button>
            <Button onClick={() => void saveScores(true)} loading={saving}><Send className="h-4 w-4" /> Submit scores</Button>
            {canManage && <><Button variant="outline" onClick={() => void reviewScores(false)} loading={saving}>Mark reviewed</Button><Button variant="success" onClick={() => void reviewScores(true)} loading={saving}>Approve scores</Button></>}
          </div>
        </> : <div className="p-6"><EmptyState icon={<FileCheck2 className="h-7 w-7" />} title="No enrolled students" description="This assessment section has no active enrolments." /></div>}
      </Card>}
      {!loading && !sectionAssessments.length && <EmptyState icon={<FileCheck2 className="h-7 w-7" />} title="No assessments configured" description="Create an assessment for the selected class and term to begin score entry." />}
    </div>
  );
}
