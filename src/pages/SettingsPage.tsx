import { useAuth } from '@/context/AuthContext';
import { Card, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button, Input } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { supabase } from '@/lib/supabase';
import { SCHOOL_TYPE_LABELS, type Campus } from '@/types';
import { useEffect, useState } from 'react';
import { Save, Building2, Globe, MapPin } from 'lucide-react';

export function SettingsPage() {
  const { activeSchool, profile, refresh } = useAuth();
  const { toast } = useToast();
  const [name, setName] = useState(activeSchool?.name ?? '');
  const [shortName, setShortName] = useState(activeSchool?.short_name ?? '');
  const [address, setAddress] = useState(activeSchool?.address ?? '');
  const [loading, setLoading] = useState(false);
  const [campuses, setCampuses] = useState<Campus[]>([]);
  const [campusName, setCampusName] = useState('');
  const [campusAddress, setCampusAddress] = useState('');
  const [campusLoading, setCampusLoading] = useState(false);

  useEffect(() => {
    if (!activeSchool) return;
    supabase
      .from('campuses')
      .select('*')
      .eq('school_id', activeSchool.id)
      .eq('is_active', true)
      .order('created_at', { ascending: true })
      .then(({ data }) => setCampuses((data as Campus[]) ?? []));
  }, [activeSchool]);

  if (!activeSchool) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeSchool) return;
    setLoading(true);

    const { error } = await supabase
      .from('schools')
      .update({ name, short_name: shortName, address })
      .eq('id', activeSchool.id);

    if (error) {
      toast('Failed to save settings: ' + error.message, 'error');
    } else {
      // Audit log
      await supabase.from('audit_logs').insert({
        school_id: activeSchool.id,
        actor_user_id: profile?.id,
        action: 'updated school settings',
        entity_type: 'schools',
        entity_id: activeSchool.id,
      });
      toast('School settings saved', 'success');
      refresh();
    }
    setLoading(false);
  };

  const handleAddCampus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeSchool || !campusName.trim()) {
      toast('Campus name is required', 'warning');
      return;
    }
    setCampusLoading(true);
    const { data, error } = await supabase
      .from('campuses')
      .insert({
        school_id: activeSchool.id,
        name: campusName.trim(),
        address: campusAddress.trim() || null,
        is_active: true,
      })
      .select()
      .single();

    if (error) {
      toast('Failed to add campus: ' + error.message, 'error');
    } else {
      await supabase.from('audit_logs').insert({
        school_id: activeSchool.id,
        actor_user_id: profile?.id,
        action: 'added campus',
        entity_type: 'campuses',
        entity_id: data.id,
        details: { name: campusName },
      });
      setCampuses((prev) => [...prev, data as Campus]);
      setCampusName('');
      setCampusAddress('');
      toast('Campus added', 'success');
    }
    setCampusLoading(false);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold font-display text-navy-500">School Settings</h1>
        <p className="mt-1 text-sm text-slate-500">Configure your school's profile and preferences.</p>
      </div>

      {/* Profile */}
      <Card>
        <CardHeader
          title="School Profile"
          description="Basic information about your school"
          action={<Building2 className="h-5 w-5 text-slate-400" />}
        />
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="School name" value={name} onChange={(e) => setName(e.target.value)} required />
            <Input label="Short name" value={shortName} onChange={(e) => setShortName(e.target.value)} placeholder="CFA" />
          </div>
          <Input label="Address" value={address ?? ''} onChange={(e) => setAddress(e.target.value)} />

          <div className="flex items-center gap-2">
            <Button type="submit" loading={loading}>
              <Save className="h-4 w-4" /> Save Changes
            </Button>
          </div>
        </form>
      </Card>

      <Card>
        <CardHeader
          title="Campuses"
          description="Physical sites belonging to this school"
          action={<MapPin className="h-5 w-5 text-slate-400" />}
        />
        <div className="space-y-2 mb-4">
          {campuses.length === 0 ? (
            <p className="text-sm text-slate-500">No campuses yet.</p>
          ) : (
            campuses.map((c) => (
              <div key={c.id} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2">
                <div>
                  <p className="text-sm font-medium text-navy-500">{c.name}</p>
                  {c.address && <p className="text-xs text-slate-500">{c.address}</p>}
                </div>
                <Badge variant="success">Active</Badge>
              </div>
            ))
          )}
        </div>
        <form onSubmit={handleAddCampus} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input label="Campus name" value={campusName} onChange={(e) => setCampusName(e.target.value)} placeholder="Annex Campus" />
          <Input label="Address" value={campusAddress} onChange={(e) => setCampusAddress(e.target.value)} placeholder="Optional" />
          <div className="sm:col-span-2">
            <Button type="submit" variant="outline" loading={campusLoading}>
              Add campus
            </Button>
          </div>
        </form>
      </Card>

      {/* System configuration */}
      <Card>
        <CardHeader
          title="System Configuration"
          description="Regional and academic defaults (read-only in Milestone 1)"
          action={<Globe className="h-5 w-5 text-slate-400" />}
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">School Type</label>
            <div className="h-10 flex items-center px-3 rounded-lg bg-slate-50 text-sm text-navy-500 border border-slate-200">
              {SCHOOL_TYPE_LABELS[activeSchool.type]}
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">Currency</label>
            <div className="h-10 flex items-center px-3 rounded-lg bg-slate-50 text-sm text-navy-500 border border-slate-200">
              {activeSchool.currency} (Nigerian Naira)
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">Timezone</label>
            <div className="h-10 flex items-center px-3 rounded-lg bg-slate-50 text-sm text-navy-500 border border-slate-200">
              {activeSchool.timezone}
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">Country</label>
            <div className="h-10 flex items-center px-3 rounded-lg bg-slate-50 text-sm text-navy-500 border border-slate-200">
              {activeSchool.country}
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">Phone Country Code</label>
            <div className="h-10 flex items-center px-3 rounded-lg bg-slate-50 text-sm text-navy-500 border border-slate-200">
              {activeSchool.phone_country_code}
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">Status</label>
            <div className="h-10 flex items-center px-3 rounded-lg bg-slate-50 border border-slate-200">
              <Badge variant="success">Active</Badge>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
