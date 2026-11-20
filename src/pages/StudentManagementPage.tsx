import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Download, GraduationCap, Plus, Search, Users, X } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { EmptyState, LoadingSpinner } from '@/components/ui/EmptyState';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';

type Student = {
  id: string;
  student_id: string;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  date_of_birth: string;
  gender: 'female' | 'male' | 'other';
  photo_url?: string | null;
  admission_date: string;
  admission_type: string | null;
  previous_school: string | null;
  status: string;
  residential_address: string | null;
  nationality: string | null;
  state_of_origin: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
};

type GuardianDraft = {
  full_name: string;
  relationship: string;
  phone: string;
  email: string;
  address: string;
  is_primary: boolean;
  is_emergency_contact: boolean;
};
type SortKey = keyof Student | 'class' | 'guardian';
type AcademicSession = { id: string; name: string };
type ClassOption = { id: string; name: string; academic_session_id: string; class_name: string };
type AcademicRecord = { id: string; session: string; class_name: string; section_name: string; status: string; enrolment_date: string };

const blankGuardian = (): GuardianDraft => ({
  full_name: '',
  relationship: 'Parent',
  phone: '',
  email: '',
  address: '',
  is_primary: false,
  is_emergency_contact: false,
});

const EMPTY_TABS = ['Documents', 'Fees'] as const;

export function StudentManagementPage() {
  const { studentId } = useParams();
  const { activeSchool, activeRoles } = useAuth();
  const { toast } = useToast();
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [genderFilter, setGenderFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [classFilter, setClassFilter] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('last_name');
  const [sortAsc, setSortAsc] = useState(true);
  const [page, setPage] = useState(0);
  const [profileTab, setProfileTab] = useState('Overview');
  const [guardians, setGuardians] = useState<GuardianDraft[]>([blankGuardian()]);
  const canEdit = activeRoles.some((role) => ['platform_admin', 'school_owner', 'school_admin', 'academic_admin'].includes(role));
  const canManageSensitive = activeRoles.some((role) => ['platform_admin', 'school_owner', 'school_admin'].includes(role));

  const loadStudents = useCallback(async () => {
    if (!activeSchool) return;
    setLoading(true);
    const [studentResult, classResult, guardianResult, sessionResult, sectionResult, allClassResult] = await Promise.all([
      supabase.from('students').select('*').eq('school_id', activeSchool.id).order('last_name'),
      supabase.from('enrollments')
        .select('student_id, class_sections!inner(id, name, class_id)')
        .eq('school_id', activeSchool.id)
        .eq('status', 'active'),
      supabase.from('student_guardians')
        .select('student_id, guardian_id, is_primary')
        .eq('school_id', activeSchool.id)
        .order('is_primary', { ascending: false }),
      supabase.from('academic_sessions').select('id,name').eq('school_id', activeSchool.id).order('starts_on', { ascending: false }),
      supabase.from('class_sections').select('id,name,class_id,academic_session_id').eq('school_id', activeSchool.id).eq('status', 'active').order('name'),
      supabase.from('classes').select('id,name,academic_session_id').eq('school_id', activeSchool.id).eq('status', 'active').order('name'),
    ]);
    if (studentResult.error) {
      toast(studentResult.error.message, 'error');
    } else {
      const activeClassRows = (classResult.data ?? []).map((enrollment) => {
        const section = enrollment.class_sections as unknown as { id: string; name: string; class_id: string };
        return { studentId: enrollment.student_id, sectionId: section.id, sectionName: section.name, classId: section.class_id };
      });
      const classNames = new Map((allClassResult.data ?? []).map((item) => [item.id, item.name]));
      const activeClasses = new Map<string, string>();
      for (const row of activeClassRows) {
        activeClasses.set(row.studentId, `${classNames.get(row.classId) ?? ''} ${row.sectionName}`.trim());
      }
      setStudents((studentResult.data ?? []) as Student[]);
      setStudentClasses(activeClasses);
      const guardianIds = [...new Set((guardianResult.data ?? []).map((link) => link.guardian_id))];
      const guardianDetailResult = guardianIds.length
        ? await supabase.from('guardians').select('id,full_name').eq('school_id', activeSchool.id).in('id', guardianIds)
        : { data: [], error: null };
      if (guardianDetailResult.error) toast(guardianDetailResult.error.message, 'error');
      const names = new Map((guardianDetailResult.data ?? []).map((guardian) => [guardian.id, guardian.full_name]));
      const guardianNames = new Map<string, string>();
      for (const link of guardianResult.data ?? []) {
        const guardianName = names.get(link.guardian_id);
        if (guardianName && !guardianNames.has(link.student_id)) guardianNames.set(link.student_id, guardianName);
      }
      setStudentGuardianNames(guardianNames);
      setAcademicSessions((sessionResult.data ?? []) as AcademicSession[]);
      const classNameById = new Map((allClassResult.data ?? []).map((item) => [item.id, item.name]));
      setClassOptions((sectionResult.data ?? []).map((section) => ({
        id: section.id,
        name: section.name,
        academic_session_id: section.academic_session_id,
        class_name: classNameById.get(section.class_id) ?? 'Class',
      })) as ClassOption[]);
      const entries = await Promise.all((studentResult.data ?? [])
        .filter((student) => student.photo_url)
        .map(async (student) => {
          const { data, error } = await supabase.storage.from('school-documents')
            .createSignedUrl(student.photo_url as string, 3600);
          if (error) {
            toast(`Could not load a student photograph: ${error.message}`, 'error');
            return [student.id, ''] as const;
          }
          return [student.id, data.signedUrl] as const;
        }));
      setPhotoUrls(Object.fromEntries(entries.filter(([, url]) => url)));
    }
    if (classResult.error) toast(classResult.error.message, 'error');
    if (guardianResult.error) toast(guardianResult.error.message, 'error');
    if (sessionResult.error) toast(sessionResult.error.message, 'error');
    if (sectionResult.error) toast(sectionResult.error.message, 'error');
    if (allClassResult.error) toast(allClassResult.error.message, 'error');
    setLoading(false);
  }, [activeSchool, toast]);

  const [studentClasses, setStudentClasses] = useState<Map<string, string>>(new Map());
  const [studentGuardianNames, setStudentGuardianNames] = useState<Map<string, string>>(new Map());
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [academicSessions, setAcademicSessions] = useState<AcademicSession[]>([]);
  const [classOptions, setClassOptions] = useState<ClassOption[]>([]);
  const [registrationSession, setRegistrationSession] = useState('');
  const [registrationSection, setRegistrationSection] = useState('');

  useEffect(() => {
    void loadStudents();
  }, [loadStudents]);

  const filtered = useMemo(() => students.filter((student) => {
    const text = `${student.first_name} ${student.middle_name ?? ''} ${student.last_name} ${student.student_id}`.toLowerCase();
    return (!query || text.includes(query.toLowerCase()))
      && (!genderFilter || student.gender === genderFilter)
      && (!statusFilter || student.status === statusFilter)
      && (!classFilter || studentClasses.get(student.id) === classFilter);
  }).sort((a, b) => {
    const leftValue = sortKey === 'class' ? studentClasses.get(a.id) : sortKey === 'guardian' ? studentGuardianNames.get(a.id) : a[sortKey];
    const rightValue = sortKey === 'class' ? studentClasses.get(b.id) : sortKey === 'guardian' ? studentGuardianNames.get(b.id) : b[sortKey];
    const left = String(leftValue ?? '').toLowerCase();
    const right = String(rightValue ?? '').toLowerCase();
    return left.localeCompare(right) * (sortAsc ? 1 : -1);
  }), [students, query, genderFilter, statusFilter, classFilter, studentClasses, studentGuardianNames, sortKey, sortAsc]);

  const pageSize = 10;
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const rows = filtered.slice(page * pageSize, (page + 1) * pageSize);

  const exportCsv = () => {
    const csvRows = [
      ['Student ID', 'First name', 'Middle name', 'Last name', 'Gender', 'Class', 'Status', 'Admission date'],
      ...filtered.map((student) => [
        student.student_id, student.first_name, student.middle_name ?? '', student.last_name,
        student.gender, studentClasses.get(student.id) ?? '', student.status, student.admission_date,
      ]),
    ];
    const csv = csvRows.map((row) => row.map((field) => {
      const value = String(field);
      const safeValue = /^[=+\-@]/.test(value) ? `'${value}` : value;
      return `"${safeValue.replace(/"/g, '""')}"`;
    }).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'cedarfield-students.csv';
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const handleRegister = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeSchool) return;
    const form = new FormData(event.currentTarget);
    const student = Object.fromEntries(form.entries());
    const guardianData = guardians.filter((guardian) => guardian.full_name.trim() && guardian.phone.trim());
    setSaving(true);
    const { data, error } = await supabase.rpc('register_student', {
      p_school_id: activeSchool.id,
      p_student: Object.fromEntries(Object.entries(student).filter(([key]) =>
        key !== 'photo' && (canManageSensitive || !['medical_notes', 'blood_group', 'allergies'].includes(key)),
      )),
      p_guardians: guardianData,
    });
    setSaving(false);
    if (error) {
      toast(error.message, 'error');
      return;
    }
    let photoIssue: string | null = null;
    const photo = form.get('photo');
    if (photo instanceof File && photo.size > 0) {
      const path = `${activeSchool.id}/students/${data}/${crypto.randomUUID()}-${photo.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
      const upload = await supabase.storage.from('school-documents').upload(path, photo, { upsert: false });
      if (upload.error) {
        photoIssue = upload.error.message;
      } else {
        const { error: updateError } = await supabase.rpc('update_student', {
          p_school_id: activeSchool.id, p_student_id: data, p_student: { photo_url: path },
        });
        if (updateError) {
          await supabase.storage.from('school-documents').remove([path]);
          photoIssue = updateError.message;
        }
      }
    }
    if (photoIssue) toast(`Student registered (ID: ${data}), but the photograph could not be saved: ${photoIssue}`, 'error');
    else toast(`Student registered. ID: ${data}`, 'success');
    setModalOpen(false);
    setGuardians([blankGuardian()]);
    setRegistrationSession('');
    setRegistrationSection('');
    await loadStudents();
  };

  if (studentId) {
    return (
      <StudentProfile
        studentId={studentId}
        schoolId={activeSchool?.id}
        canEdit={canEdit}
        canManageSensitive={canManageSensitive}
        selectedTab={profileTab}
        onTabChange={setProfileTab}
      />
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold font-display text-navy-500">Students</h1>
          <p className="mt-1 text-sm text-slate-500">Student records for {activeSchool?.name ?? 'your school'}.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/guardians"><Button variant="outline"><Users className="h-4 w-4" /> Guardians</Button></Link>
          <Button variant="outline" onClick={exportCsv}><Download className="h-4 w-4" /> Export CSV</Button>
          {canEdit && <Button onClick={() => setModalOpen(true)}><Plus className="h-4 w-4" /> Add student</Button>}
        </div>
      </div>

      <Card>
        <div className="grid gap-3 md:grid-cols-4">
          <div className="relative md:col-span-1">
            <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
            <input value={query} onChange={(event) => { setQuery(event.target.value); setPage(0); }}
              placeholder="Search name or student ID"
              className="h-10 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary-400" />
          </div>
          <Select aria-label="Filter by class" value={classFilter} onChange={(event) => { setClassFilter(event.target.value); setPage(0); }}>
            <option value="">All classes</option>
            {[...new Set(studentClasses.values())].sort().map((name) => <option key={name}>{name}</option>)}
          </Select>
          <Select aria-label="Filter by gender" value={genderFilter} onChange={(event) => { setGenderFilter(event.target.value); setPage(0); }}>
            <option value="">All genders</option><option value="female">Female</option><option value="male">Male</option><option value="other">Other</option>
          </Select>
          <Select aria-label="Filter by academic status" value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setPage(0); }}>
            <option value="">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option><option value="graduated">Graduated</option><option value="withdrawn">Withdrawn</option>
          </Select>
        </div>
      </Card>

      <Card noPadding>
        {loading ? <div className="flex justify-center py-16"><LoadingSpinner /></div> : rows.length === 0 ? (
          <EmptyState icon={<GraduationCap className="h-7 w-7" />} title="No students found"
            description={students.length ? 'Try adjusting your search or filters.' : 'Register a student to start building your school directory.'} />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[850px]">
                <thead><tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  {([
                    ['student_id', 'Student ID'], ['last_name', 'Student'], ['gender', 'Gender'],
                    ['class', 'Class'], ['status', 'Academic status'], ['guardian', 'Guardian'],
                    ['admission_date', 'Admission date'],
                  ] as [SortKey, string][]).map(([key, title]) => (
                    <th key={key} className="px-4 py-3 font-semibold">
                      <button className="hover:text-navy-500" onClick={() => {
                        if (sortKey === key) setSortAsc(!sortAsc);
                        else { setSortKey(key); setSortAsc(true); }
                      }}>{title}{sortKey === key ? (sortAsc ? ' ↑' : ' ↓') : ''}</button>
                    </th>
                  ))}
                </tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((student) => (
                    <tr key={student.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 text-sm font-medium text-primary-700"><Link to={`/students/${student.id}`}>{student.student_id}</Link></td>
                      <td className="px-4 py-3"><Link to={`/students/${student.id}`} className="flex items-center gap-3">
                        {photoUrls[student.id] ? <img src={photoUrls[student.id]} alt="" className="h-8 w-8 rounded-full object-cover" /> : <Avatar firstName={student.first_name} lastName={student.last_name} size="sm" />}
                        <span className="text-sm font-medium text-navy-500">{student.first_name} {student.middle_name ? `${student.middle_name} ` : ''}{student.last_name}</span>
                      </Link></td>
                      <td className="px-4 py-3 text-sm capitalize text-navy-500">{student.gender}</td>
                      <td className="px-4 py-3 text-sm text-navy-500">{student.admission_date}</td>
                      <td className="px-4 py-3"><Badge variant={student.status === 'active' ? 'success' : 'neutral'}>{student.status}</Badge></td>
                      <td className="px-4 py-3 text-sm text-navy-500">{studentClasses.get(student.id) ?? '—'}</td>
                      <td className="px-4 py-3 text-sm text-navy-500"><Link to="/guardians" className="text-primary-700 hover:underline">{studentGuardianNames.get(student.id) ?? 'Add guardian'}</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-sm text-slate-500">
              <span>{filtered.length} student{filtered.length === 1 ? '' : 's'}</span>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</Button>
                <span>Page {page + 1} of {pageCount}</span>
                <Button size="sm" variant="outline" disabled={page + 1 >= pageCount} onClick={() => setPage(page + 1)}>Next</Button>
              </div>
            </div>
          </>
        )}
      </Card>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Register student"
        description="Enter the student's details and link one or more guardians." size="lg">
        <form className="max-h-[70vh] space-y-5 overflow-y-auto pr-1" onSubmit={handleRegister}>
          <section className="space-y-3">
            <h3 className="font-semibold text-navy-500">Personal information</h3>
            <div className="grid gap-3 sm:grid-cols-3">
              <Input name="first_name" label="First name" required />
              <Input name="middle_name" label="Middle name" />
              <Input name="last_name" label="Last name" required />
              <Input name="date_of_birth" label="Date of birth" type="date" required />
              <Select name="gender" label="Gender" required defaultValue=""><option value="" disabled>Select gender</option><option value="female">Female</option><option value="male">Male</option><option value="other">Other</option></Select>
              <Input name="photo" label="Student photograph" type="file" accept="image/*" />
              <Input name="nationality" label="Nationality" defaultValue="Nigerian" />
              <Input name="state_of_origin" label="State of origin" />
              <div className="sm:col-span-2"><Input name="residential_address" label="Residential address" /></div>
            </div>
          </section>
          <section className="space-y-3">
            <h3 className="font-semibold text-navy-500">School information</h3>
            <div className="grid gap-3 sm:grid-cols-3">
              <Input name="student_id" label="Student ID" hint="Leave blank to generate a unique ID." />
              <Input name="admission_date" label="Admission date" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required />
              <Select name="admission_type" label="Admission type"><option value="">Select type</option><option value="new">New</option><option value="transfer">Transfer</option><option value="returning">Returning</option></Select>
              <Input name="previous_school" label="Previous school" />
              <Select name="academic_session_id" label="Academic session" value={registrationSession} onChange={(event) => { setRegistrationSession(event.target.value); setRegistrationSection(''); }}><option value="">Not enrolled yet</option>{academicSessions.map((session) => <option key={session.id} value={session.id}>{session.name}</option>)}</Select>
              <Select name="class_section_id" label="Intended class" disabled={!registrationSession} value={registrationSection} onChange={(event) => setRegistrationSection(event.target.value)}><option value="">Not assigned</option>{classOptions.filter((section) => section.academic_session_id === registrationSession).map((section) => <option key={section.id} value={section.id}>{section.class_name} {section.name}</option>)}</Select>
              <Select name="status" label="Student status" defaultValue="active"><option value="active">Active</option><option value="inactive">Inactive</option></Select>
            </div>
          </section>
          <section className="space-y-3">
            <h3 className="font-semibold text-navy-500">Emergency contact</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input name="emergency_contact_name" label="Emergency contact name" />
              <Input name="emergency_contact_phone" label="Emergency contact phone" />
            </div>
          </section>
          {canManageSensitive && <section className="space-y-3">
            <h3 className="font-semibold text-navy-500">Medical & emergency information</h3>
            <p className="text-xs text-slate-500">Health information is stored separately and only school managers can access it.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input name="blood_group" label="Blood group (optional)" />
              <Input name="allergies" label="Allergies (optional)" />
              <div className="sm:col-span-2"><Textarea name="medical_notes" label="Relevant medical notes" /></div>
            </div>
          </section>}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-navy-500">Guardians</h3>
              <Button type="button" size="sm" variant="outline" onClick={() => setGuardians((items) => [...items, blankGuardian()])}><Plus className="h-4 w-4" /> Add guardian</Button>
            </div>
            {guardians.map((guardian, index) => (
              <div key={index} className="rounded-lg border border-slate-200 p-3">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-sm font-medium text-navy-500">Guardian {index + 1}</span>
                  {guardians.length > 1 && <button type="button" aria-label="Remove guardian" onClick={() => setGuardians((items) => items.filter((_, itemIndex) => itemIndex !== index))}><X className="h-4 w-4 text-slate-400" /></button>}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input label="Full name" required value={guardian.full_name} onChange={(event) => setGuardians((items) => items.map((item, i) => i === index ? { ...item, full_name: event.target.value } : item))} />
                  <Input label="Relationship" required value={guardian.relationship} onChange={(event) => setGuardians((items) => items.map((item, i) => i === index ? { ...item, relationship: event.target.value } : item))} />
                  <Input label="Phone" required value={guardian.phone} onChange={(event) => setGuardians((items) => items.map((item, i) => i === index ? { ...item, phone: event.target.value } : item))} />
                  <Input label="Email" type="email" value={guardian.email} onChange={(event) => setGuardians((items) => items.map((item, i) => i === index ? { ...item, email: event.target.value } : item))} />
                  <Input label="Address" value={guardian.address} onChange={(event) => setGuardians((items) => items.map((item, i) => i === index ? { ...item, address: event.target.value } : item))} />
                  <div className="flex gap-4 text-sm text-slate-600 sm:col-span-2">
                    <label className="flex items-center gap-2"><input type="checkbox" checked={guardian.is_primary} onChange={(event) => setGuardians((items) => items.map((item, i) => ({ ...item, is_primary: i === index && event.target.checked })))} /> Primary contact</label>
                    <label className="flex items-center gap-2"><input type="checkbox" checked={guardian.is_emergency_contact} onChange={(event) => setGuardians((items) => items.map((item, i) => i === index ? { ...item, is_emergency_contact: event.target.checked } : item))} /> Emergency contact</label>
                  </div>
                </div>
              </div>
            ))}
          </section>
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button type="submit" loading={saving}>Register student</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function StudentProfile({ studentId, schoolId, canEdit, canManageSensitive, selectedTab, onTabChange }: {
  studentId: string;
  schoolId?: string;
  canEdit: boolean;
  canManageSensitive: boolean;
  selectedTab: string;
  onTabChange: (tab: string) => void;
}) {
  const { toast } = useToast();
  const [student, setStudent] = useState<Student | null>(null);
  const [links, setLinks] = useState<{ id: string; relationship: string; is_primary: boolean; is_emergency_contact: boolean; guardians: { full_name: string; phone: string; email: string | null }[] | null }[]>([]);
  const [history, setHistory] = useState<{ action: string; created_at: string; actor_user_id: string | null }[]>([]);
  const [academicHistory, setAcademicHistory] = useState<AcademicRecord[]>([]);
  const [attendanceRecords, setAttendanceRecords] = useState<{ id: string; attendance_date: string; status: string; remarks: string | null }[]>([]);
  const [resultRecords, setResultRecords] = useState<{ id: string; term: string; subject: string; weighted_score: number; grade: string; status: string }[]>([]);
  const [medical, setMedical] = useState<{ medical_notes: string | null; blood_group: string | null; allergies: string | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [photoUrl, setPhotoUrl] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadProfile = useCallback(async () => {
    if (!schoolId) return;
    setLoading(true);
    const [studentResult, guardianResult, medicalResult, auditResult, enrollmentResult, attendanceResult, resultResult] = await Promise.all([
      supabase.from('students').select('*').eq('school_id', schoolId).eq('id', studentId).maybeSingle(),
      supabase.from('student_guardians').select('id, guardian_id, relationship, is_primary, is_emergency_contact').eq('school_id', schoolId).eq('student_id', studentId),
      canManageSensitive
        ? supabase.from('student_medical_records').select('medical_notes, blood_group, allergies').eq('school_id', schoolId).eq('student_id', studentId).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      supabase.from('audit_logs').select('action, created_at, actor_user_id').eq('school_id', schoolId).eq('entity_id', studentId).order('created_at', { ascending: false }),
      supabase.from('enrollments').select('id,academic_session_id,class_id,class_section_id,status,enrolment_date').eq('school_id', schoolId).eq('student_id', studentId).order('enrolment_date', { ascending: false }),
      supabase.from('attendance_records').select('id,attendance_date,status,remarks').eq('school_id', schoolId).eq('student_id', studentId).order('attendance_date', { ascending: false }).limit(100),
      supabase.from('term_results').select('id,term_id,subject_id,weighted_score,grade,status').eq('school_id', schoolId).eq('student_id', studentId).order('updated_at', { ascending: false }),
    ]);
    if (studentResult.error) toast(studentResult.error.message, 'error');
    if (attendanceResult.error) toast(attendanceResult.error.message, 'error');
    if (resultResult.error) toast(resultResult.error.message, 'error');
    setAttendanceRecords((attendanceResult.data ?? []) as typeof attendanceRecords);
    const resultRows = resultResult.data ?? [];
    const [resultTerms, resultSubjects] = await Promise.all([
      resultRows.length ? supabase.from('academic_terms').select('id,name').eq('school_id', schoolId).in('id', [...new Set(resultRows.map((row) => row.term_id))]) : Promise.resolve({ data: [], error: null }),
      resultRows.length ? supabase.from('subjects').select('id,name').eq('school_id', schoolId).in('id', [...new Set(resultRows.map((row) => row.subject_id))]) : Promise.resolve({ data: [], error: null }),
    ]);
    if (resultTerms.error) toast(resultTerms.error.message, 'error');
    if (resultSubjects.error) toast(resultSubjects.error.message, 'error');
    const termsById = new Map((resultTerms.data ?? []).map((item) => [item.id, item.name]));
    const subjectsById = new Map((resultSubjects.data ?? []).map((item) => [item.id, item.name]));
    setResultRecords(resultRows.map((row) => ({
      id: row.id, term: termsById.get(row.term_id) ?? 'Term', subject: subjectsById.get(row.subject_id) ?? 'Subject',
      weighted_score: Number(row.weighted_score), grade: row.grade, status: row.status,
    })));
    setStudent((studentResult.data as Student | null) ?? null);
    const linkedGuardianIds = [...new Set((guardianResult.data ?? []).map((link) => link.guardian_id))];
    const linkedGuardianResult = linkedGuardianIds.length
      ? await supabase.from('guardians').select('id,full_name,phone,email').eq('school_id', schoolId).in('id', linkedGuardianIds)
      : { data: [], error: null };
    if (linkedGuardianResult.error) toast(linkedGuardianResult.error.message, 'error');
    const linkedGuardians = new Map((linkedGuardianResult.data ?? []).map((guardian) => [guardian.id, guardian]));
    setLinks((guardianResult.data ?? []).map((link) => ({
      ...link,
      guardians: linkedGuardians.has(link.guardian_id) ? [linkedGuardians.get(link.guardian_id)!] : [],
    })) as typeof links);
    if (guardianResult.error) toast(guardianResult.error.message, 'error');
    if (medicalResult.error && medicalResult.error.code !== 'PGRST116') toast(medicalResult.error.message, 'error');
    setMedical((medicalResult.data as typeof medical) ?? null);
    setHistory((auditResult.data ?? []) as typeof history);
    if (enrollmentResult.error) toast(enrollmentResult.error.message, 'error');
    const enrollmentRows = enrollmentResult.data ?? [];
    const classIds = [...new Set(enrollmentRows.map((entry) => entry.class_id))];
    const sectionIds = [...new Set(enrollmentRows.map((entry) => entry.class_section_id))];
    const sessionIds = [...new Set(enrollmentRows.map((entry) => entry.academic_session_id))];
    const [classResult, sectionResult, sessionResult] = await Promise.all([
      classIds.length ? supabase.from('classes').select('id,name').eq('school_id', schoolId).in('id', classIds) : Promise.resolve({ data: [], error: null }),
      sectionIds.length ? supabase.from('class_sections').select('id,name').eq('school_id', schoolId).in('id', sectionIds) : Promise.resolve({ data: [], error: null }),
      sessionIds.length ? supabase.from('academic_sessions').select('id,name').eq('school_id', schoolId).in('id', sessionIds) : Promise.resolve({ data: [], error: null }),
    ]);
    for (const result of [classResult, sectionResult, sessionResult]) if (result.error) toast(result.error.message, 'error');
    const classNames = new Map((classResult.data ?? []).map((item) => [item.id, item.name]));
    const sectionNames = new Map((sectionResult.data ?? []).map((item) => [item.id, item.name]));
    const sessionNames = new Map((sessionResult.data ?? []).map((item) => [item.id, item.name]));
    setAcademicHistory(enrollmentRows.map((entry) => ({
      id: entry.id,
      session: sessionNames.get(entry.academic_session_id) ?? 'Academic session',
      class_name: classNames.get(entry.class_id) ?? 'Class',
      section_name: sectionNames.get(entry.class_section_id) ?? '',
      status: entry.status,
      enrolment_date: entry.enrolment_date,
    })));
    if (studentResult.data?.photo_url) {
      const { data, error } = await supabase.storage.from('school-documents').createSignedUrl(studentResult.data.photo_url, 3600);
      if (error) toast(error.message, 'error');
      setPhotoUrl(data?.signedUrl ?? '');
    } else {
      setPhotoUrl('');
    }
    setLoading(false);
  }, [schoolId, studentId, toast, canManageSensitive]);

  useEffect(() => { void loadProfile(); }, [loadProfile]);

  const saveProfile = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!schoolId) return;
    const form = new FormData(event.currentTarget);
    const values = Object.fromEntries([...form.entries()].filter(([key]) => key !== 'photo'));
    const photo = form.get('photo');
    let uploadedPath: string | null = null;
    setSaving(true);
    if (photo instanceof File && photo.size > 0) {
      uploadedPath = `${schoolId}/students/${studentId}/${crypto.randomUUID()}-${photo.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
      const upload = await supabase.storage.from('school-documents').upload(uploadedPath, photo, { upsert: false });
      if (upload.error) {
        setSaving(false);
        toast(upload.error.message, 'error');
        return;
      }
      values.photo_url = uploadedPath;
    }
    const { error } = await supabase.rpc('update_student', {
      p_school_id: schoolId,
      p_student_id: studentId,
      p_student: values,
    });
    if (error) {
      if (uploadedPath) await supabase.storage.from('school-documents').remove([uploadedPath]);
      setSaving(false);
      toast(error.message, 'error');
      return;
    }
    setSaving(false);
    setEditOpen(false);
    toast('Student profile updated.', 'success');
    await loadProfile();
  };

  if (loading) return <div className="flex justify-center py-16"><LoadingSpinner /></div>;
  if (!student) return <EmptyState title="Student record not found" description="This record may have been removed or you may not have permission to view it." />;

  const fullName = `${student.first_name} ${student.middle_name ? `${student.middle_name} ` : ''}${student.last_name}`;
  const tabs = ['Overview', 'Guardians', ...(canEdit ? ['Audit history'] : []), 'Academic history', 'Documents', 'Attendance', 'Results', 'Fees'];
  return (
    <div className="space-y-6 animate-fade-in">
      <Link to="/students" className="text-sm font-medium text-primary-700 hover:underline">← Back to students</Link>
      <Card>
        <div className="flex flex-wrap items-center gap-4">
          {photoUrl ? <img src={photoUrl} alt={`${fullName}`} className="h-16 w-16 rounded-full object-cover" /> : <Avatar firstName={student.first_name} lastName={student.last_name} size="lg" />}
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold font-display text-navy-500">{fullName}</h1>
            <p className="mt-1 text-sm text-slate-500">{student.student_id} · {student.gender} · Admitted {student.admission_date}</p>
          </div>
          <Badge variant={student.status === 'active' ? 'success' : 'neutral'}>{student.status}</Badge>
          {canEdit && <Button variant="outline" onClick={() => setEditOpen(true)}>Edit profile</Button>}
        </div>
      </Card>
      <div className="flex gap-2 overflow-x-auto border-b border-slate-200">
        {tabs.map((tab) => <button key={tab} onClick={() => onTabChange(tab)}
          className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium ${selectedTab === tab ? 'border-primary-500 text-primary-700' : 'border-transparent text-slate-500 hover:text-navy-500'}`}>{tab}</button>)}
      </div>
      {selectedTab === 'Overview' && <Card>
        <CardHeader title="Student information" description="Personal and admission information" />
        <dl className="grid gap-4 sm:grid-cols-2">
          <Info label="Date of birth" value={student.date_of_birth} /><Info label="Gender" value={student.gender} />
          <Info label="Admission date" value={student.admission_date} /><Info label="Residential address" value={student.residential_address ?? '—'} />
          <Info label="Nationality" value={student.nationality ?? '—'} /><Info label="State of origin" value={student.state_of_origin ?? '—'} />
          <Info label="Admission type" value={student.admission_type ?? '—'} /><Info label="Previous school" value={student.previous_school ?? '—'} />
          <Info label="Emergency contact" value={`${student.emergency_contact_name ?? '—'} ${student.emergency_contact_phone ?? ''}`} />
          <Info label="Academic status" value={student.status} />
        </dl>
        {canManageSensitive && <div className="mt-5 border-t border-slate-100 pt-4">
          <h3 className="mb-2 text-sm font-semibold text-navy-500">Restricted medical information</h3>
          {medical ? <dl className="grid gap-3 sm:grid-cols-3"><Info label="Blood group" value={medical.blood_group ?? '—'} /><Info label="Allergies" value={medical.allergies ?? '—'} /><Info label="Medical notes" value={medical.medical_notes ?? '—'} /></dl> : <p className="text-sm text-slate-500">No medical information recorded.</p>}
        </div>}
      </Card>}
      {selectedTab === 'Guardians' && <Card>
        <CardHeader title="Linked guardians" description="Guardians explicitly linked to this student" />
        {links.length ? <div className="divide-y divide-slate-100">{links.map((link) => <div key={link.id} className="flex items-center justify-between py-3">
          <div><p className="font-medium text-navy-500">{link.guardians?.[0]?.full_name ?? 'Guardian'}</p><p className="text-sm text-slate-500">{link.relationship} · {link.guardians?.[0]?.phone}</p></div>
          <div className="flex gap-2">{link.is_primary && <Badge variant="primary">Primary</Badge>}{link.is_emergency_contact && <Badge variant="warning">Emergency</Badge>}</div>
        </div>)}</div> : <p className="text-sm text-slate-500">No guardians linked yet.</p>}
      </Card>}
      {selectedTab === 'Academic history' && <Card><CardHeader title="Academic history" description="Enrolments are preserved when students move between classes or sessions." />{academicHistory.length ? <div className="divide-y divide-slate-100">{academicHistory.map((record) => <div key={record.id} className="flex flex-wrap items-center justify-between gap-2 py-3"><div><p className="text-sm font-medium text-navy-500">{record.session} · {record.class_name} {record.section_name}</p><p className="text-xs text-slate-500">Enrolled {record.enrolment_date}</p></div><Badge variant={record.status === 'active' ? 'success' : 'neutral'}>{record.status}</Badge></div>)}</div> : <p className="text-sm text-slate-500">No enrolment history recorded yet.</p>}</Card>}
      {selectedTab === 'Audit history' && <Card><CardHeader title="Audit history" description="Recorded changes to this student record" />{history.length ? history.map((entry, index) => <p className="border-t border-slate-100 py-3 text-sm text-slate-600" key={`${entry.created_at}-${index}`}>{entry.action.replace(/_/g, ' ')} · {new Date(entry.created_at).toLocaleString()}</p>) : <p className="text-sm text-slate-500">No audit entries found.</p>}</Card>}
      {selectedTab === 'Attendance' && <Card><CardHeader title="Attendance history" description={`${attendanceRecords.length} recorded school days`} />{attendanceRecords.length ? <div className="divide-y divide-slate-100">{attendanceRecords.map((record) => <div key={record.id} className="flex items-center justify-between gap-3 py-3"><div><p className="font-medium text-navy-500">{record.attendance_date}</p>{record.remarks && <p className="text-sm text-slate-500">{record.remarks}</p>}</div><Badge variant={record.status === 'present' ? 'success' : record.status === 'absent' ? 'error' : record.status === 'late' ? 'warning' : 'navy'}>{record.status}</Badge></div>)}</div> : <p className="text-sm text-slate-500">No attendance records have been entered.</p>}</Card>}
      {selectedTab === 'Results' && <Card><CardHeader title="Assessment results" description="Draft results are visible only to authorized school staff." />{resultRecords.length ? <div className="divide-y divide-slate-100">{resultRecords.map((record) => <div key={record.id} className="grid gap-2 py-3 sm:grid-cols-4"><span className="font-medium text-navy-500">{record.term}</span><span>{record.subject}</span><span>{record.weighted_score.toFixed(1)}% · {record.grade}</span><Badge variant={record.status === 'published' ? 'success' : 'navy'}>{record.status}</Badge></div>)}</div> : <p className="text-sm text-slate-500">No assessment results have been computed.</p>}</Card>}
      {EMPTY_TABS.includes(selectedTab as typeof EMPTY_TABS[number]) && <EmptyState title={`${selectedTab} is not available yet`} description="This section will show real records when the corresponding school module is implemented. No sample records are displayed." />}
      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Edit student profile" size="lg">
        <form className="max-h-[70vh] space-y-4 overflow-y-auto pr-1" onSubmit={(event) => void saveProfile(event)}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input name="first_name" label="First name" required defaultValue={student.first_name} />
            <Input name="middle_name" label="Middle name" defaultValue={student.middle_name ?? ''} />
            <Input name="last_name" label="Last name" required defaultValue={student.last_name} />
            <Input name="date_of_birth" label="Date of birth" type="date" required defaultValue={student.date_of_birth} />
            <Select name="gender" label="Gender" defaultValue={student.gender}><option value="female">Female</option><option value="male">Male</option><option value="other">Other</option></Select>
            <Input name="admission_date" label="Admission date" type="date" defaultValue={student.admission_date} />
            <Input name="residential_address" label="Residential address" defaultValue={student.residential_address ?? ''} />
            <Input name="nationality" label="Nationality" defaultValue={student.nationality ?? ''} />
            <Input name="state_of_origin" label="State of origin" defaultValue={student.state_of_origin ?? ''} />
            <Input name="admission_type" label="Admission type" />
            <Input name="previous_school" label="Previous school" />
            <Input name="emergency_contact_name" label="Emergency contact name" defaultValue={student.emergency_contact_name ?? ''} />
            <Input name="emergency_contact_phone" label="Emergency contact phone" defaultValue={student.emergency_contact_phone ?? ''} />
            <Select name="status" label="Status" defaultValue={student.status}><option value="active">Active</option><option value="inactive">Inactive</option><option value="graduated">Graduated</option></Select>
            <Input name="photo" label="Replace photograph" type="file" accept="image/*" />
            {canManageSensitive && <><Input name="blood_group" label="Blood group (restricted)" defaultValue={medical?.blood_group ?? ''} /><Input name="allergies" label="Allergies (restricted)" defaultValue={medical?.allergies ?? ''} /><div className="sm:col-span-2"><Textarea name="medical_notes" label="Medical notes (restricted)" defaultValue={medical?.medical_notes ?? ''} /></div></>}
          </div>
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4"><Button type="button" variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button><Button type="submit" loading={saving}>Save changes</Button></div>
        </form>
      </Modal>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</dt><dd className="mt-1 text-sm capitalize text-navy-500">{value || '—'}</dd></div>;
}
