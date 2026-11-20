import { useAuth } from '@/context/AuthContext';
import { Card, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Avatar } from '@/components/ui/Avatar';
import { Button, Input } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { ROLE_LABELS, type SchoolRole } from '@/types';
import { formatDate } from '@/lib/utils';
import { Shield, Check, Users } from 'lucide-react';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

const ALL_ROLES: SchoolRole[] = [
  'platform_admin',
  'school_owner',
  'school_admin',
  'academic_admin',
  'bursar',
  'teacher',
  'parent',
  'student',
];

const roleBadgeVariant: Record<string, 'navy' | 'primary' | 'success' | 'warning' | 'error' | 'neutral'> = {
  platform_admin: 'error',
  school_owner: 'navy',
  school_admin: 'primary',
  academic_admin: 'success',
  bursar: 'warning',
  teacher: 'neutral',
  parent: 'neutral',
  student: 'neutral',
};

export function UsersRolesPage() {
  const { activeSchool, memberships, profile, refresh } = useAuth();
  const { toast } = useToast();
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteFirstName, setInviteFirstName] = useState('');
  const [inviteLastName, setInviteLastName] = useState('');
  const [inviteRole, setInviteRole] = useState<SchoolRole>('teacher');
  const [loading, setLoading] = useState(false);
  const [members, setMembers] = useState<typeof memberships>(memberships);

  async function loadMembers() {
    if (!activeSchool) return;
    const { data } = await supabase
      .from('school_memberships')
      .select('*, schools(*), user_profiles!inner(first_name, last_name, email)')
      .eq('school_id', activeSchool.id)
      .eq('is_active', true)
      .order('joined_at', { ascending: true });
    setMembers(data ?? []);
  }

  useEffect(() => {
    loadMembers();
  }, [activeSchool]);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeSchool || !inviteEmail || !inviteFirstName || !inviteLastName) {
      toast('Please fill all fields', 'warning');
      return;
    }

    setLoading(true);

    // Check if user exists by email in user_profiles
    const { data: existingUser } = await supabase
      .from('user_profiles')
      .select('id')
      .eq('email', inviteEmail)
      .maybeSingle();

    if (!existingUser) {
      toast('No account found with that email. The person must register first, then you can assign them a role.', 'warning');
      setLoading(false);
      return;
    }

    const { data: existingMembership } = await supabase
      .from('school_memberships')
      .select('id')
      .eq('school_id', activeSchool.id)
      .eq('user_id', existingUser.id)
      .eq('role', inviteRole)
      .maybeSingle();

    if (existingMembership) {
      toast('This person already has that role at this school.', 'warning');
      setLoading(false);
      return;
    }

    // Create membership
    const { error } = await supabase.from('school_memberships').insert({
      school_id: activeSchool.id,
      user_id: existingUser.id,
      role: inviteRole,
      is_active: true,
      invited_by: profile?.id,
    });

    if (error) {
      toast('Failed to assign role: ' + error.message, 'error');
      setLoading(false);
      return;
    }

    // Audit log
    await supabase.from('audit_logs').insert({
      school_id: activeSchool.id,
      actor_user_id: profile?.id,
      action: 'assigned role',
      entity_type: 'school_memberships',
      details: { email: inviteEmail, role: inviteRole },
    });

    toast(`${inviteFirstName} ${inviteLastName} added as ${ROLE_LABELS[inviteRole]}`, 'success');
    setInviteEmail('');
    setInviteFirstName('');
    setInviteLastName('');
    setInviteRole('teacher');
    setLoading(false);
    loadMembers();
    refresh();
  };

  if (!activeSchool) return null;

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold font-display text-navy-500">Users & Roles</h1>
        <p className="mt-1 text-sm text-slate-500">Manage who has access to {activeSchool.name} and their permissions.</p>
      </div>

      {/* Current members */}
      <Card>
        <CardHeader
          title="School Members"
          description={`${members.length} active member${members.length === 1 ? '' : 's'}`}
          action={<Users className="h-5 w-5 text-slate-400" />}
        />
        <div className="space-y-2">
          {members.map((m) => {
            const memberProfile = (m as unknown as { user_profiles?: { first_name: string; last_name: string } }).user_profiles;
            return (
              <div key={m.id} className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-slate-50 transition-colors">
                <Avatar
                  firstName={memberProfile?.first_name ?? 'U'}
                  lastName={memberProfile?.last_name ?? ''}
                  size="sm"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-navy-500 truncate">
                    {memberProfile?.first_name} {memberProfile?.last_name}
                  </p>
                  <p className="text-xs text-slate-500">Joined {formatDate(m.joined_at)}</p>
                </div>
                <Badge variant={roleBadgeVariant[m.role]}>{ROLE_LABELS[m.role]}</Badge>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Invite form */}
      <Card>
        <CardHeader
          title="Add Member"
          description="Assign a role to an existing CampusOS user by their email."
          action={<Shield className="h-5 w-5 text-slate-400" />}
        />
        <form onSubmit={handleInvite} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="First name"
              name="inviteFirstName"
              value={inviteFirstName}
              onChange={(e) => setInviteFirstName(e.target.value)}
              required
            />
            <Input
              label="Last name"
              name="inviteLastName"
              value={inviteLastName}
              onChange={(e) => setInviteLastName(e.target.value)}
              required
            />
          </div>
          <Input
            label="Email address"
            type="email"
            name="inviteEmail"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            placeholder="person@school.edu.ng"
            required
            hint="The person must already have a CampusOS account with this email."
          />
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-navy-500">Role</label>
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as SchoolRole)}
              className="w-full h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm text-navy-500 focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-transparent"
            >
              {ALL_ROLES.filter((r) => r !== 'platform_admin').map((role) => (
                <option key={role} value={role}>
                  {ROLE_LABELS[role]}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit" loading={loading}>
            <Check className="h-4 w-4" /> Add Member
          </Button>
        </form>
      </Card>
    </div>
  );
}
