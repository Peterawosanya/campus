import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Award, Printer, RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { EmptyState, LoadingSpinner } from '@/components/ui/EmptyState';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/components/ui/Toast';
import { supabase } from '@/lib/supabase';

type ResultStatus = 'draft' | 'submitted' | 'reviewed' | 'approved' | 'published';
type ResultRow = { id: string; student_id: string; academic_session_id: string; term_id: string; class_section_id: string; subject_id: string; grading_scheme_id: string; weighted_score: number; grade: string; status: ResultStatus };
type Student = { id: string; student_id: string; first_name: string; last_name: string };
type Term = { id: string; name: string; academic_session_id: string };
type Section = { id: string; name: string; academic_session_id: string; class_name: string };
type Subject = { id: string; name: string };
type Scheme = { id: string; name: string; pass_mark: number; is_default: boolean };
type Comment = { id: string; student_id: string; term_id: string; comment_type: string; comment: string };
type ResultComponent = { id: string; result_id: string; assessment_id: string; score: number; max_score: number; weighting: number; weighted_points: number };
const flow: ResultStatus[] = ['draft', 'submitted', 'reviewed', 'approved', 'published'];

export function ResultsPage() {
  const { activeSchool, activeRoles, profile } = useAuth();
  const { toast } = useToast();
  const canManage = activeRoles.some((role) => ['platform_admin', 'school_owner', 'school_admin', 'academic_admin'].includes(role));
  const canPublish = activeRoles.some((role) => ['platform_admin', 'school_owner', 'school_admin'].includes(role));
  const [results, setResults] = useState<ResultRow[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [terms, setTerms] = useState<Term[]>([]);
  const [schemes, setSchemes] = useState<Scheme[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [components, setComponents] = useState<ResultComponent[]>([]);
  const [termId, setTermId] = useState('');
  const [sectionId, setSectionId] = useState('');
  const [schemeId, setSchemeId] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedStudent, setSelectedStudent] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [correction, setCorrection] = useState<ResultRow | null>(null);

  const load = useCallback(async () => {
    if (!activeSchool) return;
    setLoading(true);
    const [resultResult, termResult, sectionResult, schemeResult, commentResult] = await Promise.all([
      supabase.from('term_results').select('id,student_id,academic_session_id,term_id,class_section_id,subject_id,grading_scheme_id,weighted_score,grade,status').eq('school_id', activeSchool.id).order('weighted_score', { ascending: false }),
      supabase.from('academic_terms').select('id,name,academic_session_id').eq('school_id', activeSchool.id).order('starts_on', { ascending: false }),
      supabase.from('class_sections').select('id,name,academic_session_id,class_id').eq('school_id', activeSchool.id).order('name'),
      supabase.from('grading_schemes').select('id,name,pass_mark,is_default').eq('school_id', activeSchool.id).order('name'),
      supabase.from('report_card_comments').select('id,student_id,term_id,comment_type,comment').eq('school_id', activeSchool.id),
    ]);
    for (const result of [resultResult, termResult, sectionResult, schemeResult, commentResult]) if (result.error) toast(result.error.message, 'error');
    const rows = (resultResult.data ?? []) as ResultRow[];
    const resultIds = rows.map((item) => item.id);
    const studentIds = [...new Set(rows.map((item) => item.student_id))];
    const subjectIds = [...new Set(rows.map((item) => item.subject_id))];
    const classIds = [...new Set((sectionResult.data ?? []).map((item) => item.class_id))];
    const [studentResult, subjectResult, classResult] = await Promise.all([
      studentIds.length ? supabase.from('students').select('id,student_id,first_name,last_name').eq('school_id', activeSchool.id).in('id', studentIds) : Promise.resolve({ data: [], error: null }),
      subjectIds.length ? supabase.from('subjects').select('id,name').eq('school_id', activeSchool.id).in('id', subjectIds) : Promise.resolve({ data: [], error: null }),
      classIds.length ? supabase.from('classes').select('id,name').eq('school_id', activeSchool.id).in('id', classIds) : Promise.resolve({ data: [], error: null }),
    ]);
    for (const result of [studentResult, subjectResult, classResult]) if (result.error) toast(result.error.message, 'error');
    const classNames = new Map((classResult.data ?? []).map((item) => [item.id, item.name]));
    setResults(rows);
    const componentResult = resultIds.length ? await supabase.from('report_card_components')
      .select('id,result_id,assessment_id,score,max_score,weighting,weighted_points')
      .eq('school_id', activeSchool.id).in('result_id', resultIds) : { data: [], error: null };
    if (componentResult.error) toast(componentResult.error.message, 'error');
    setComponents((componentResult.data ?? []) as ResultComponent[]);
    setStudents((studentResult.data ?? []) as Student[]);
    setSubjects((subjectResult.data ?? []) as Subject[]);
    setSections((sectionResult.data ?? []).map((item) => ({ id: item.id, name: item.name, academic_session_id: item.academic_session_id, class_name: classNames.get(item.class_id) ?? 'Class' })));
    setTerms((termResult.data ?? []) as Term[]);
    setSchemes((schemeResult.data ?? []) as Scheme[]);
    setComments((commentResult.data ?? []) as Comment[]);
    if (!termId && termResult.data?.length) setTermId(termResult.data[0].id);
    if (!schemeId && schemeResult.data?.length) setSchemeId(schemeResult.data.find((item) => item.is_default)?.id ?? schemeResult.data[0]?.id ?? '');
    setLoading(false);
  }, [activeSchool, schemeId, termId, toast]);
  useEffect(() => { void load(); }, [load]);

  const termsForSection = terms.filter((item) => !sectionId || item.academic_session_id === sections.find((section) => section.id === sectionId)?.academic_session_id);
  const visibleResults = results.filter((item) => (!termId || item.term_id === termId) && (!sectionId || item.class_section_id === sectionId));
  const studentsById = new Map(students.map((item) => [item.id, item]));
  const subjectsById = new Map(subjects.map((item) => [item.id, item.name]));
  const sectionsById = new Map(sections.map((item) => [item.id, `${item.class_name} ${item.name}`]));
  const average = visibleResults.length ? visibleResults.reduce((sum, item) => sum + Number(item.weighted_score), 0) / visibleResults.length : 0;
  const gradeCounts = visibleResults.reduce((counts, row) => {
    counts[row.grade] = (counts[row.grade] ?? 0) + 1;
    return counts;
  }, {} as Record<string, number>);

  const createScheme = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeSchool) return;
    const form = new FormData(event.currentTarget);
    const { error } = await supabase.from('grading_schemes').insert({
      school_id: activeSchool.id, name: String(form.get('name')), pass_mark: Number(form.get('pass_mark')),
    });
    if (error) { toast(error.message, 'error'); return; }
    toast('Grading scheme created.', 'success'); event.currentTarget.reset(); await load();
  };
  const createBand = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeSchool || !schemeId) return;
    const form = new FormData(event.currentTarget);
    const { error } = await supabase.from('grading_bands').insert({
      school_id: activeSchool.id, grading_scheme_id: schemeId, grade: String(form.get('grade')),
      minimum_score: Number(form.get('minimum_score')), maximum_score: Number(form.get('maximum_score')),
      remark: String(form.get('remark') || '') || null,
    });
    if (error) { toast(error.message, 'error'); return; }
    toast('Grade band saved.', 'success'); event.currentTarget.reset();
  };
  const compute = async () => {
    if (!activeSchool || !sectionId || !termId || !schemeId) { toast('Select a term, class section, and grading scheme.', 'error'); return; }
    setSaving(true);
    const { data, error } = await supabase.rpc('compute_term_results', {
      p_school_id: activeSchool.id, p_term_id: termId, p_class_section_id: sectionId, p_grading_scheme_id: schemeId,
    });
    setSaving(false);
    if (error) { toast(error.message, 'error'); return; }
    toast(`${data} subject results computed from approved scores.`, 'success'); await load();
  };
  const advance = async (status: ResultStatus) => {
    const selected = results.filter((item) => selectedIds.includes(item.id));
    if (!selected.length) { toast('Select results first.', 'error'); return; }
    if (new Set(selected.map((item) => item.status)).size !== 1) { toast('Select results in the same workflow stage.', 'error'); return; }
    const currentIndex = flow.indexOf(selected[0].status);
    if (flow[currentIndex + 1] !== status) { toast('Results must advance one workflow stage at a time.', 'error'); return; }
    if (status === 'published' && !canPublish) { toast('Only school administrators can publish results.', 'error'); return; }
    setSaving(true);
    const { error } = await supabase.rpc('transition_term_results', { p_result_ids: selectedIds, p_status: status, p_reason: null });
    setSaving(false);
    if (error) { toast(error.message, 'error'); return; }
    toast(`Results moved to ${status}.`, 'success'); setSelectedIds([]); await load();
  };
  const saveComment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeSchool || !selectedStudent || !termId) return;
    const form = new FormData(event.currentTarget);
    const { error } = await supabase.from('report_card_comments').upsert({
      school_id: activeSchool.id, student_id: selectedStudent, term_id: termId,
      comment_type: String(form.get('comment_type')), comment: String(form.get('comment')),
      author_user_id: profile?.id,
    }, { onConflict: 'school_id,student_id,term_id,comment_type' });
    if (error) { toast(error.message, 'error'); return; }
    toast('Report-card comment saved.', 'success'); event.currentTarget.reset(); await load();
  };
  const correctPublishedResult = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!correction) return;
    const form = new FormData(event.currentTarget);
    setSaving(true);
    const { error } = await supabase.rpc('correct_published_result', {
      p_result_id: correction.id,
      p_weighted_score: Number(form.get('weighted_score')),
      p_reason: String(form.get('reason')),
    });
    setSaving(false);
    if (error) { toast(error.message, 'error'); return; }
    toast('Published result correction saved and the previous version retained.', 'success');
    setCorrection(null);
    await load();
  };
  const selectedStudentResults = useMemo(() => visibleResults.filter((item) => item.student_id === selectedStudent), [selectedStudent, visibleResults]);
  const student = studentsById.get(selectedStudent);

  if (!activeSchool) return <EmptyState icon={<Award className="h-7 w-7" />} title="No school selected" description="Select a school to view results." />;
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><h1 className="text-2xl font-bold font-display text-navy-500">Results & report cards</h1><p className="mt-1 text-sm text-slate-500">Results are computed from approved scores and published only through the review workflow.</p></div><Button variant="outline" onClick={() => window.print()} disabled={!selectedStudent}><Printer className="h-4 w-4" /> Print report card</Button></div>
      {canManage && <Card>
        <CardHeader title="Grading configuration" description="Set a school grading scheme and non-overlapping score bands; scores are never computed by AI." />
        <div className="grid gap-6 lg:grid-cols-2">
          <form onSubmit={createScheme} className="grid gap-3 sm:grid-cols-3">
            <Input name="name" label="Scheme name" placeholder="Cedarfield standard" required />
            <Input name="pass_mark" label="Pass mark" type="number" min="0" max="100" step="0.01" defaultValue="50" required />
            <div className="flex items-end"><Button>Create scheme</Button></div>
          </form>
          <form onSubmit={createBand} className="grid gap-3 sm:grid-cols-3">
            <Select label="Scheme" value={schemeId} onChange={(event) => setSchemeId(event.target.value)}>{schemes.map((scheme) => <option key={scheme.id} value={scheme.id}>{scheme.name}</option>)}</Select>
            <Input name="grade" label="Grade" placeholder="A" required />
            <Input name="remark" label="Remark" placeholder="Excellent" />
            <Input name="minimum_score" label="Minimum" type="number" min="0" max="100" step="0.01" required />
            <Input name="maximum_score" label="Maximum" type="number" min="0" max="100" step="0.01" required />
            <div className="flex items-end"><Button disabled={!schemeId}>Add grade band</Button></div>
          </form>
        </div>
      </Card>}
      <Card>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Select label="Term" value={termId} onChange={(event) => setTermId(event.target.value)}>{termsForSection.map((term) => <option key={term.id} value={term.id}>{term.name}</option>)}</Select>
          <Select label="Class section" value={sectionId} onChange={(event) => setSectionId(event.target.value)}><option value="">All available sections</option>{sections.map((section) => <option key={section.id} value={section.id}>{section.class_name} {section.name}</option>)}</Select>
          {canManage && <Select label="Grading scheme" value={schemeId} onChange={(event) => setSchemeId(event.target.value)}>{schemes.map((scheme) => <option key={scheme.id} value={scheme.id}>{scheme.name}</option>)}</Select>}
          {canManage && <div className="flex items-end"><Button onClick={() => void compute()} loading={saving}><RefreshCw className="h-4 w-4" /> Compute results</Button></div>}
        </div>
      </Card>
      {canManage && <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => void advance('submitted')} disabled={!selectedIds.length || saving}>Submit</Button>
        <Button size="sm" variant="outline" onClick={() => void advance('reviewed')} disabled={!selectedIds.length || saving}>Mark reviewed</Button>
        <Button size="sm" variant="outline" onClick={() => void advance('approved')} disabled={!selectedIds.length || saving}>Approve</Button>
        {canPublish && <Button size="sm" variant="success" onClick={() => void advance('published')} disabled={!selectedIds.length || saving}>Publish</Button>}
      </div>}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Card><p className="text-sm text-slate-500">Visible subject results</p><p className="mt-1 text-2xl font-semibold text-navy-500">{visibleResults.length}</p></Card>
        <Card><p className="text-sm text-slate-500">Class / selection average</p><p className="mt-1 text-2xl font-semibold text-navy-500">{visibleResults.length ? `${average.toFixed(1)}%` : '—'}</p></Card>
        <Card><p className="text-sm text-slate-500">Grade distribution</p><p className="mt-1 text-sm text-navy-500">{Object.entries(gradeCounts).map(([grade, count]) => `${grade}: ${count}`).join(' · ') || 'No results yet'}</p></Card>
      </div>
      <Card noPadding>
        {loading ? <div className="p-8"><LoadingSpinner /></div> : visibleResults.length ? <div className="overflow-x-auto"><table className="w-full min-w-[780px]"><thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr>{canManage && <th className="px-3 py-3">Select</th>}<th className="px-3 py-3">Student</th><th className="px-3 py-3">Class</th><th className="px-3 py-3">Subject</th><th className="px-3 py-3">Score</th><th className="px-3 py-3">Grade</th><th className="px-3 py-3">Status</th>{canPublish && <th className="px-3 py-3">Correction</th>}</tr></thead><tbody className="divide-y divide-slate-100">{visibleResults.map((item) => { const pupil = studentsById.get(item.student_id); return <tr key={item.id}>{canManage && <td className="px-3 py-3"><input type="checkbox" checked={selectedIds.includes(item.id)} onChange={(event) => setSelectedIds((ids) => event.target.checked ? [...ids, item.id] : ids.filter((id) => id !== item.id))} aria-label={`Select result ${item.id}`} /></td>}<td className="px-3 py-3"><button className="text-left font-medium text-primary-700 hover:underline" onClick={() => { setSelectedStudent(item.student_id); }}>{pupil ? `${pupil.first_name} ${pupil.last_name}` : 'Student'}</button><p className="text-xs text-slate-500">{pupil?.student_id}</p></td><td className="px-3 py-3">{sectionsById.get(item.class_section_id) ?? '—'}</td><td className="px-3 py-3">{subjectsById.get(item.subject_id) ?? '—'}</td><td className="px-3 py-3">{Number(item.weighted_score).toFixed(1)}%</td><td className="px-3 py-3 font-semibold">{item.grade}</td><td className="px-3 py-3"><Badge variant={item.status === 'published' ? 'success' : item.status === 'approved' ? 'warning' : 'navy'}>{item.status}</Badge></td>{canPublish && <td className="px-3 py-3">{item.status === 'published' && <Button size="sm" variant="outline" onClick={() => setCorrection(item)}>Correct</Button>}</td>}</tr>; })}</tbody></table></div> : <div className="p-6"><EmptyState icon={<Award className="h-7 w-7" />} title="No results available" description="Computed results appear here after all component scores are approved and complete." /></div>}
      </Card>
      {selectedStudent && student && <Card>
        <CardHeader title={`Report card · ${student.first_name} ${student.last_name}`} description={`${activeSchool.name} · ${student.student_id} · ${sectionsById.get(selectedStudentResults[0]?.class_section_id ?? '') ?? ''} · ${terms.find((item) => item.id === termId)?.name ?? ''}`} />
        {selectedStudentResults.length ? <><div className="divide-y divide-slate-100">{selectedStudentResults.map((item) => { const parts = components.filter((part) => part.result_id === item.id); return <div key={item.id} className="py-3"><div className="grid grid-cols-4 gap-3 text-sm"><span>{subjectsById.get(item.subject_id)}</span><span>{Number(item.weighted_score).toFixed(1)}%</span><strong>{item.grade}</strong><Badge variant={item.status === 'published' ? 'success' : 'navy'}>{item.status}</Badge></div>{parts.length > 0 && <div className="mt-2 ml-3 space-y-1 border-l-2 border-slate-100 pl-3">{parts.map((part) => <p key={part.id} className="text-xs text-slate-500">{Number(part.score).toFixed(1)} / {Number(part.max_score).toFixed(1)} · {Number(part.weighting).toFixed(1)}% weight · {Number(part.weighted_points).toFixed(1)} weighted points</p>)}</div>}</div>; })}</div><div className="mt-3 rounded-lg bg-slate-50 p-3 text-sm"><span className="text-slate-500">Overall average: </span><strong>{(selectedStudentResults.reduce((sum, item) => sum + Number(item.weighted_score), 0) / selectedStudentResults.length).toFixed(1)}%</strong></div><div className="mt-4"><h3 className="mb-2 text-sm font-semibold text-navy-500">Report-card comments</h3>{comments.filter((item) => item.student_id === selectedStudent && item.term_id === termId).map((item) => <p key={item.id} className="mb-1 text-sm"><span className="font-medium capitalize">{item.comment_type.replace('_', ' ')}: </span>{item.comment}</p>)}{canManage && <form onSubmit={saveComment} className="mt-3 grid gap-3 sm:grid-cols-3"><Select name="comment_type" label="Comment role"><option value="class_teacher">Class teacher</option><option value="head_teacher">Head teacher</option><option value="subject_teacher">Subject teacher</option></Select><Textarea name="comment" label="Comment" required /><div className="flex items-end"><Button>Save comment</Button></div></form>}</div></> : <p className="text-sm text-slate-500">No subject results for this student in the selected term.</p>}
      </Card>}
      <Modal open={Boolean(correction)} onClose={() => setCorrection(null)} title="Correct published result" description="A correction requires a reason and preserves the previous result version.">
        <form onSubmit={correctPublishedResult} className="space-y-4">
          <Input name="weighted_score" label="Corrected score (%)" type="number" min="0" max="100" step="0.01" defaultValue={correction?.weighted_score} required />
          <Textarea name="reason" label="Correction reason" required />
          <div className="flex justify-end gap-2"><Button variant="outline" type="button" onClick={() => setCorrection(null)}>Cancel</Button><Button loading={saving}>Save correction</Button></div>
        </form>
      </Modal>
    </div>
  );
}
