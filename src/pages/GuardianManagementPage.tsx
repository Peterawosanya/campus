import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Link2, Plus, Search, Users } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState, LoadingSpinner } from '@/components/ui/EmptyState';
import { Input, Select } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';

type Guardian = { id: string; full_name: string; email: string | null; phone: string; address: string | null; account_status: string };
type Student = { id: string; student_id: string; first_name: string; last_name: string };
type LinkRecord = { id: string; guardian_id: string; student_id: string; relationship: string; is_primary: boolean; is_emergency_contact: boolean };

export function GuardianManagementPage() {
  const { activeSchool, activeRoles } = useAuth();
  const { toast } = useToast();
  const [guardians, setGuardians] = useState<Guardian[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [links, setLinks] = useState<LinkRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<'add' | 'link' | 'edit' | null>(null);
  const [selectedGuardian, setSelectedGuardian] = useState<Guardian | null>(null);
  const [query, setQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const canEdit = activeRoles.some((role) => ['platform_admin', 'school_owner', 'school_admin', 'academic_admin'].includes(role));

  const load = useCallback(async () => {
    if (!activeSchool) return;
    setLoading(true);
    const [guardianResult, studentResult, linksResult] = await Promise.all([
      supabase.from('guardians').select('id, full_name, email, phone, address, account_status').eq('school_id', activeSchool.id).order('full_name'),
      supabase.from('students').select('id, student_id, first_name, last_name').eq('school_id', activeSchool.id).order('last_name'),
      supabase.from('student_guardians').select('id, guardian_id, student_id, relationship, is_primary, is_emergency_contact').eq('school_id', activeSchool.id),
    ]);
    if (guardianResult.error) toast(guardianResult.error.message, 'error');
    if (studentResult.error) toast(studentResult.error.message, 'error');
    if (linksResult.error) toast(linksResult.error.message, 'error');
    setGuardians((guardianResult.data ?? []) as Guardian[]);
    setStudents((studentResult.data ?? []) as Student[]);
    setLinks((linksResult.data ?? []) as LinkRecord[]);
    setLoading(false);
  }, [activeSchool, toast]);

  useEffect(() => { void load(); }, [load]);

  const saveGuardian = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeSchool) return;
    const values = Object.fromEntries(new FormData(event.currentTarget).entries());
    setSaving(true);
    const result = selectedGuardian
      ? await supabase.from('guardians').update(values).eq('id', selectedGuardian.id).eq('school_id', activeSchool.id)
      : await supabase.from('guardians').insert({ ...values, school_id: activeSchool.id });
    setSaving(false);
    if (result.error) { toast(result.error.message, 'error'); return; }
    toast(selectedGuardian ? 'Guardian updated.' : 'Guardian added.', 'success');
    setModal(null);
    setSelectedGuardian(null);
    await load();
  };

  const linkGuardian = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeSchool) return;
    const values = Object.fromEntries(new FormData(event.currentTarget).entries());
    const isPrimary = values.is_primary === 'on';
    const isEmergency = values.is_emergency_contact === 'on';
    setSaving(true);
    const result = await supabase.from('student_guardians').insert({
      school_id: activeSchool.id,
      guardian_id: values.guardian_id,
      student_id: values.student_id,
      relationship: values.relationship,
      is_primary: isPrimary,
      is_emergency_contact: isEmergency,
    });
    setSaving(false);
    if (result.error) { toast(result.error.message, 'error'); return; }
    toast('Guardian linked to student.', 'success');
    setModal(null);
    await load();
  };

  const unlink = async (link: LinkRecord) => {
    if (!activeSchool || !window.confirm('Unlink this guardian from the student? This does not delete the guardian account.')) return;
    const { error } = await supabase.from('student_guardians').delete().eq('id', link.id).eq('school_id', activeSchool.id);
    if (error) toast(error.message, 'error');
    else { toast('Guardian unlinked.', 'success'); await load(); }
  };

  const shown = guardians.filter((guardian) => `${guardian.full_name} ${guardian.email ?? ''} ${guardian.phone}`.toLowerCase().includes(query.toLowerCase()));
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div><Link to="/students" className="text-sm font-medium text-primary-700 hover:underline">← Students</Link><h1 className="mt-2 text-2xl font-bold font-display text-navy-500">Guardian directory</h1><p className="mt-1 text-sm text-slate-500">One guardian record can be linked to multiple students.</p></div>
        {canEdit && <div className="flex gap-2"><Button variant="outline" onClick={() => setModal('link')}><Link2 className="h-4 w-4" /> Link guardian</Button><Button onClick={() => { setSelectedGuardian(null); setModal('add'); }}><Plus className="h-4 w-4" /> Add guardian</Button></div>}
      </div>
      <Card><div className="relative max-w-md"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search guardians" className="h-10 w-full rounded-lg border border-slate-300 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400" /></div></Card>
      <Card noPadding>
        {loading ? <LoadingSpinner /> : shown.length === 0 ? <EmptyState icon={<Users className="h-7 w-7" />} title="No guardians found" description="Add a guardian or adjust your search." /> : (
          <div className="overflow-x-auto"><table className="w-full min-w-[700px]">
            <thead><tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase text-slate-500">{['Guardian', 'Email', 'Phone', 'Linked children', 'Relationship', 'Account status', ''].map((heading) => <th key={heading} className="px-4 py-3 font-semibold">{heading}</th>)}</tr></thead>
            <tbody className="divide-y divide-slate-100">{shown.map((guardian) => {
              const guardianLinks = links.filter((link) => link.guardian_id === guardian.id);
              const children = guardianLinks.map((link) => students.find((student) => student.id === link.student_id)).filter((student): student is Student => Boolean(student));
              return <tr key={guardian.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 text-sm font-medium text-navy-500">{guardian.full_name}</td><td className="px-4 py-3 text-sm text-slate-600">{guardian.email ?? '—'}</td><td className="px-4 py-3 text-sm text-slate-600">{guardian.phone}</td>
                <td className="px-4 py-3 text-sm text-navy-500">{children.length ? children.map((child) => <Link key={child.id} to={`/students/${child.id}`} className="mr-2 text-primary-700 hover:underline">{child.first_name} {child.last_name}</Link>) : 'None'}</td>
                <td className="px-4 py-3 text-sm text-slate-600">{[...new Set(guardianLinks.map((link) => link.relationship))].join(', ') || '—'}</td>
                <td className="px-4 py-3 text-sm capitalize text-slate-600">{guardian.account_status.replace(/_/g, ' ')}</td>
                <td className="px-4 py-3 text-right">{canEdit && <Button size="sm" variant="outline" onClick={() => { setSelectedGuardian(guardian); setModal('edit'); }}>Edit</Button>}</td>
              </tr>;
            })}</tbody>
          </table>
          <div className="border-t border-slate-100 p-4">{links.map((link) => {
            const guardian = guardians.find((item) => item.id === link.guardian_id);
            const student = students.find((item) => item.id === link.student_id);
            if (!guardian || !student) return null;
            return <div key={link.id} className="flex items-center justify-between py-1 text-xs text-slate-500">
              <span>{guardian.full_name} → {student.first_name} {student.last_name}{link.is_primary ? ' · primary' : ''}{link.is_emergency_contact ? ' · emergency' : ''}</span>
              {canEdit && <button className="text-error-500 hover:underline" onClick={() => void unlink(link)}>Unlink</button>}
            </div>;
          })}</div>
          </div>
        )}
      </Card>
      <Modal open={modal === 'add' || modal === 'edit'} onClose={() => setModal(null)} title={selectedGuardian ? 'Edit guardian' : 'Add guardian'}>
        <form className="space-y-4" onSubmit={saveGuardian}>
          <Input name="full_name" label="Full name" required defaultValue={selectedGuardian?.full_name ?? ''} />
          <Input name="phone" label="Phone" required defaultValue={selectedGuardian?.phone ?? ''} />
          <Input name="email" label="Email" type="email" defaultValue={selectedGuardian?.email ?? ''} />
          <Input name="address" label="Address" defaultValue={selectedGuardian?.address ?? ''} />
          <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setModal(null)}>Cancel</Button><Button type="submit" loading={saving}>Save guardian</Button></div>
        </form>
      </Modal>
      <Modal open={modal === 'link'} onClose={() => setModal(null)} title="Link guardian to student" description="Select existing records; this will not create a duplicate guardian.">
        <form className="space-y-4" onSubmit={linkGuardian}>
          <Select name="guardian_id" label="Guardian" required defaultValue=""><option value="" disabled>Select guardian</option>{guardians.map((guardian) => <option key={guardian.id} value={guardian.id}>{guardian.full_name} · {guardian.phone}</option>)}</Select>
          <Select name="student_id" label="Student" required defaultValue=""><option value="" disabled>Select student</option>{students.map((student) => <option key={student.id} value={student.id}>{student.student_id} · {student.first_name} {student.last_name}</option>)}</Select>
          <Input name="relationship" label="Relationship" required defaultValue="Parent" />
          <div className="flex gap-4 text-sm text-slate-600"><label className="flex items-center gap-2"><input name="is_primary" type="checkbox" /> Primary contact</label><label className="flex items-center gap-2"><input name="is_emergency_contact" type="checkbox" /> Emergency contact</label></div>
          <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setModal(null)}>Cancel</Button><Button type="submit" loading={saving}>Link guardian</Button></div>
        </form>
      </Modal>
    </div>
  );
}
