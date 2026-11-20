import { useCallback, useEffect, useState } from 'react';
import { BriefcaseBusiness, Plus, Search } from 'lucide-react';
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

type Department = { id: string; name: string };
type Staff = {
  id: string;
  user_id: string | null;
  employee_id: string | null;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  department_id: string | null;
  job_title: string | null;
  employment_type: string | null;
  joined_on: string | null;
  status: string;
  date_of_birth: string | null;
  qualifications: string | null;
  teaching_experience: string | null;
};
type Section = { id: string; name: string };
type Subject = { id: string; name: string; code: string };
type Assignment = { id: string; staff_profile_id: string; class_section_id: string; subject_id: string | null };

export function StaffManagementPage() {
  const { activeSchool } = useAuth();
  const { toast } = useToast();
  const [staff, setStaff] = useState<Staff[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [members, setMembers] = useState<{ id: string; name: string; email: string }[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<'staff' | 'department' | 'assignment' | null>(null);
  const [selected, setSelected] = useState<Staff | null>(null);
  const [query, setQuery] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!activeSchool) return;
    setLoading(true);
    const [staffResult, departmentResult, sectionResult, subjectResult, membershipResult, assignmentResult] = await Promise.all([
      supabase.from('staff_profiles').select('id,user_id,employee_id,full_name,email,phone,department_id,job_title,employment_type,joined_on,status,qualifications,teaching_experience').eq('school_id', activeSchool.id).order('full_name'),
      supabase.from('departments').select('id,name').eq('school_id', activeSchool.id).eq('is_active', true).order('name'),
      supabase.from('class_sections').select('id,name').eq('school_id', activeSchool.id).eq('status', 'active').order('name'),
      supabase.from('subjects').select('id,name,code').eq('school_id', activeSchool.id).eq('is_active', true).order('name'),
      supabase.from('school_memberships').select('user_id').eq('school_id', activeSchool.id).eq('is_active', true),
      supabase.from('teacher_assignments').select('id,staff_profile_id,class_section_id,subject_id').eq('school_id', activeSchool.id),
    ]);
    if (staffResult.error) toast(staffResult.error.message, 'error');
    if (departmentResult.error) toast(departmentResult.error.message, 'error');
    if (sectionResult.error) toast(sectionResult.error.message, 'error');
    if (subjectResult.error) toast(subjectResult.error.message, 'error');
    if (membershipResult.error) toast(membershipResult.error.message, 'error');
    if (assignmentResult.error) toast(assignmentResult.error.message, 'error');
    const memberIds = [...new Set((membershipResult.data ?? []).map((membership) => membership.user_id))];
    const profileResult = memberIds.length
      ? await supabase.from('user_profiles').select('id,first_name,last_name,email').in('id', memberIds)
      : { data: [], error: null };
    if (profileResult.error) toast(profileResult.error.message, 'error');
    setStaff((staffResult.data ?? []) as Staff[]);
    setDepartments((departmentResult.data ?? []) as Department[]);
    setSections((sectionResult.data ?? []) as Section[]);
    setSubjects((subjectResult.data ?? []) as Subject[]);
    setMembers((profileResult.data ?? []).map((profile) => ({
      id: profile.id, name: `${profile.first_name} ${profile.last_name}`, email: profile.email,
    })));
    setAssignments((assignmentResult.data ?? []) as Assignment[]);
    setLoading(false);
  }, [activeSchool, toast]);

  useEffect(() => { void load(); }, [load]);

  const saveStaff = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeSchool) return;
    const values = Object.fromEntries(new FormData(event.currentTarget).entries());
    const userId = values.user_id || null;
    const teacherRole = values.teacher_role === 'on';
    delete values.user_id;
    delete values.teacher_role;
    const record = {
      ...values,
      school_id: activeSchool.id,
      user_id: userId,
      department_id: values.department_id || null,
      date_of_birth: values.date_of_birth || null,
      joined_on: values.joined_on || null,
      full_name: `${String(values.first_name)} ${String(values.last_name)}`.trim(),
      designation: values.job_title,
      department: departments.find((department) => department.id === values.department_id)?.name ?? null,
    };
    delete (record as Record<string, unknown>).first_name;
    delete (record as Record<string, unknown>).last_name;
    setSaving(true);
    const result = selected
      ? await supabase.from('staff_profiles').update(record).eq('id', selected.id).eq('school_id', activeSchool.id)
      : await supabase.from('staff_profiles').insert(record);
    if (result.error) {
      setSaving(false);
      toast(result.error.message, 'error');
      return;
    }
    if (teacherRole && userId) {
      const membership = await supabase.from('school_memberships').select('id,is_active')
        .eq('school_id', activeSchool.id).eq('user_id', userId).eq('role', 'teacher').maybeSingle();
      const roleResult = membership.error
        ? { error: membership.error }
        : membership.data?.is_active
          ? { error: null }
          : membership.data
            ? await supabase.from('school_memberships').update({ is_active: true }).eq('id', membership.data.id)
            : await supabase.from('school_memberships').insert({ school_id: activeSchool.id, user_id: userId, role: 'teacher', is_active: true });
      if (roleResult.error) {
        setSaving(false);
        toast(`Staff record saved, but teacher access could not be assigned: ${roleResult.error.message}`, 'error');
        await load();
        return;
      }
    }
    setSaving(false);
    toast(selected ? 'Staff profile updated.' : 'Staff profile created.', 'success');
    setModal(null);
    setSelected(null);
    await load();
  };

  const saveDepartment = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeSchool) return;
    const form = Object.fromEntries(new FormData(event.currentTarget).entries());
    setSaving(true);
    const { error } = await supabase.from('departments').insert({ ...form, school_id: activeSchool.id });
    setSaving(false);
    if (error) { toast(error.message, 'error'); return; }
    toast('Department created.', 'success');
    setModal(null);
    await load();
  };

  const addAssignment = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeSchool) return;
    const values = Object.fromEntries(new FormData(event.currentTarget).entries());
    setSaving(true);
    const { error } = await supabase.from('teacher_assignments').insert({
      school_id: activeSchool.id,
      staff_profile_id: values.staff_profile_id,
      class_section_id: values.class_section_id,
      subject_id: values.subject_id || null,
    });
    setSaving(false);
    if (error) { toast(error.message, 'error'); return; }
    toast('Teacher assignment created.', 'success');
    setModal(null);
  };

  const removeAssignment = async (assignmentId: string) => {
    if (!activeSchool || !window.confirm('Remove this teacher assignment?')) return;
    const { error } = await supabase.from('teacher_assignments').delete().eq('school_id', activeSchool.id).eq('id', assignmentId);
    if (error) toast(error.message, 'error');
    else { toast('Teacher assignment removed.', 'success'); await load(); }
  };

  const shown = staff.filter((person) => `${person.full_name ?? ''} ${person.employee_id ?? ''} ${person.email ?? ''} ${person.job_title ?? ''}`.toLowerCase().includes(query.toLowerCase()));
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div><h1 className="text-2xl font-bold font-display text-navy-500">Staff & teachers</h1><p className="mt-1 text-sm text-slate-500">Manage employee records, departments, and teaching assignments.</p></div>
        <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => setModal('department')}>Departments</Button><Button variant="outline" onClick={() => setModal('assignment')}>Teacher assignment</Button><Button onClick={() => { setSelected(null); setModal('staff'); }}><Plus className="h-4 w-4" /> Add staff</Button></div>
      </div>
      <Card><div className="relative max-w-md"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, employee ID, email" className="h-10 w-full rounded-lg border border-slate-300 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400" /></div></Card>
      <Card noPadding>
        {loading ? <LoadingSpinner /> : shown.length === 0 ? <EmptyState icon={<BriefcaseBusiness className="h-7 w-7" />} title="No staff records" description="Add staff to start building the employee directory." /> : (
          <div className="overflow-x-auto"><table className="w-full min-w-[850px]">
            <thead><tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase text-slate-500">{['Employee ID', 'Name', 'Department', 'Position', 'Employment', 'Contact', 'Status', ''].map((heading) => <th key={heading} className="px-4 py-3 font-semibold">{heading}</th>)}</tr></thead>
            <tbody className="divide-y divide-slate-100">{shown.map((person) => <tr key={person.id} className="hover:bg-slate-50">
              <td className="px-4 py-3 text-sm font-medium text-navy-500">{person.employee_id ?? '—'}</td>
              <td className="px-4 py-3"><div className="flex items-center gap-3"><Avatar firstName={person.full_name?.split(' ')[0] ?? 'Staff'} lastName={person.full_name?.split(' ').slice(1).join(' ') ?? ''} size="sm" /><div><p className="text-sm font-medium text-navy-500">{person.full_name ?? 'Staff member'}</p><p className="text-xs text-slate-500">{person.email ?? 'No email'}</p></div></div></td>
              <td className="px-4 py-3 text-sm text-slate-600">{departments.find((item) => item.id === person.department_id)?.name ?? '—'}</td>
              <td className="px-4 py-3 text-sm text-slate-600">{person.job_title ?? '—'}</td><td className="px-4 py-3 text-sm capitalize text-slate-600">{person.employment_type ?? '—'}</td><td className="px-4 py-3 text-sm text-slate-600">{person.phone ?? '—'}</td>
              <td className="px-4 py-3"><Badge variant={person.status === 'active' ? 'success' : 'neutral'}>{person.status}</Badge></td>
              <td className="px-4 py-3 text-right"><Button size="sm" variant="outline" onClick={() => { setSelected(person); setModal('staff'); }}>Edit</Button></td>
            </tr>)}</tbody>
          </table></div>
        )}
      </Card>
      <Card><CardHeader title="Teacher profiles" description="A teacher role grants only teacher access, never administrator permissions." /><p className="text-sm text-slate-600">Link an existing school account and select “Assign teacher role” when saving a staff profile. Class and subject assignments are managed here.</p></Card>
      <Card><CardHeader title="Teacher assignments" description="Assignments are limited to active staff with the teacher role." />
        {assignments.length ? <div className="divide-y divide-slate-100">{assignments.map((assignment) => <div key={assignment.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"><span>{staff.find((person) => person.id === assignment.staff_profile_id)?.full_name ?? 'Staff'} · {sections.find((section) => section.id === assignment.class_section_id)?.name ?? 'Class'} · {subjects.find((subject) => subject.id === assignment.subject_id)?.name ?? 'Class teacher'}</span><Button size="sm" variant="outline" onClick={() => void removeAssignment(assignment.id)}>Remove</Button></div>)}</div> : <p className="text-sm text-slate-500">No teacher assignments yet.</p>}
      </Card>
      <Modal open={modal === 'staff'} onClose={() => setModal(null)} title={selected ? 'Edit staff profile' : 'Register staff member'} description="Staff records are retained; use an inactive status when an employee leaves." size="lg">
        <form className="max-h-[70vh] space-y-4 overflow-y-auto pr-1" onSubmit={saveStaff}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input name="first_name" label="First name" required defaultValue={selected?.full_name?.split(' ')[0] ?? ''} />
            <Input name="last_name" label="Last name" required defaultValue={selected?.full_name?.split(' ').slice(1).join(' ') ?? ''} />
            <Input name="email" label="Email" type="email" defaultValue={selected?.email ?? ''} />
            <Input name="phone" label="Phone" defaultValue={selected?.phone ?? ''} />
            <Input name="employee_id" label="Employee ID" required defaultValue={selected?.employee_id ?? ''} />
            <Input name="date_of_birth" label="Date of birth" type="date" defaultValue={selected?.date_of_birth ?? ''} />
            <Input name="address" label="Address" />
            <Select name="department_id" label="Department" defaultValue={selected?.department_id ?? ''}><option value="">Select department</option>{departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</Select>
            <Input name="job_title" label="Job title" defaultValue={selected?.job_title ?? ''} />
            <Select name="employment_type" label="Employment type" defaultValue={selected?.employment_type ?? ''}><option value="">Select type</option><option>Full-time</option><option>Part-time</option><option>Contract</option><option>Temporary</option></Select>
            <Input name="joined_on" label="Employment start date" type="date" defaultValue={selected?.joined_on ?? ''} />
            <Select name="status" label="Status" defaultValue={selected?.status ?? 'active'}><option value="active">Active</option><option value="on_leave">On leave</option><option value="inactive">Inactive</option><option value="archived">Archived</option></Select>
            <Select name="user_id" label="Link an existing user account" defaultValue={selected?.user_id ?? ''}><option value="">No linked account</option>{members.map((member) => <option key={member.id} value={member.id}>{member.name} · {member.email}</option>)}</Select>
            <Textarea name="qualifications" label="Qualifications" defaultValue={selected?.qualifications ?? ''} />
            <Textarea name="teaching_experience" label="Teaching experience" defaultValue={selected?.teaching_experience ?? ''} />
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-600"><input name="teacher_role" type="checkbox" /> Assign teacher role to the linked account</label>
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4"><Button type="button" variant="outline" onClick={() => setModal(null)}>Cancel</Button><Button type="submit" loading={saving}>Save staff profile</Button></div>
        </form>
      </Modal>
      <Modal open={modal === 'department'} onClose={() => setModal(null)} title="Add department">
        <form className="space-y-4" onSubmit={saveDepartment}><Input name="name" label="Department name" required /><Textarea name="description" label="Description" /><div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setModal(null)}>Cancel</Button><Button type="submit" loading={saving}>Save department</Button></div></form>
      </Modal>
      <Modal open={modal === 'assignment'} onClose={() => setModal(null)} title="Assign teacher" description="Duplicate staff, section, and subject combinations are prevented by the database.">
        <form className="space-y-4" onSubmit={addAssignment}>
          <Select name="staff_profile_id" label="Teacher" required defaultValue=""><option value="" disabled>Select staff member</option>{staff.filter((person) => person.status === 'active' && person.user_id).map((person) => <option key={person.id} value={person.id}>{person.full_name ?? person.employee_id ?? 'Staff'}</option>)}</Select>
          <Select name="class_section_id" label="Class section" required defaultValue=""><option value="" disabled>Select class</option>{sections.map((section) => <option key={section.id} value={section.id}>{section.name}</option>)}</Select>
          <Select name="subject_id" label="Subject" defaultValue=""><option value="">All subjects / class teacher</option>{subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name} ({subject.code})</option>)}</Select>
          <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setModal(null)}>Cancel</Button><Button type="submit" loading={saving}>Assign teacher</Button></div>
        </form>
      </Modal>
    </div>
  );
}
