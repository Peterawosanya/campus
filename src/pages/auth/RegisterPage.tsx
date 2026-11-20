import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/components/ui/Toast';
import { Input, Button, Select } from '@/components/ui';
import { GraduationCap, Loader2, ArrowLeft } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { SchoolType } from '@/types';

export function RegisterPage() {
  const { signUp } = useAuth();
  const { toast } = useToast();
  const [step, setStep] = useState<'account' | 'school'>('account');
  const [loading, setLoading] = useState(false);

  // Account fields
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // School fields
  const [schoolName, setSchoolName] = useState('');
  const [shortName, setShortName] = useState('');
  const [schoolType, setSchoolType] = useState<SchoolType>('both');
  const [address, setAddress] = useState('');

  const handleAccountSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstName || !lastName || !email || password.length < 6) {
      toast('Please fill all fields. Password must be at least 6 characters.', 'warning');
      return;
    }
    setStep('school');
  };

  const handleSchoolSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!schoolName) {
      toast('School name is required.', 'warning');
      return;
    }
    setLoading(true);

    const { error: signUpError } = await signUp(email, password, firstName, lastName);
    if (signUpError) {
      toast(signUpError, 'error');
      setLoading(false);
      return;
    }

    // Get current user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast('Account created but school setup failed. Please contact support.', 'error');
      setLoading(false);
      return;
    }

    const { data: school, error: schoolErr } = await supabase
      .from('schools')
      .insert({
        name: schoolName,
        short_name: shortName || null,
        type: schoolType,
        address: address || null,
        country: 'Nigeria',
        currency: 'NGN',
        timezone: 'Africa/Lagos',
        phone_country_code: '+234',
        created_by: user.id,
      })
      .select()
      .single();

    if (schoolErr || !school) {
      toast('School creation failed: ' + (schoolErr?.message ?? 'Unknown error'), 'error');
      setLoading(false);
      return;
    }

    const { error: onboardErr } = await supabase.rpc('complete_school_onboarding', {
      p_school_id: school.id,
    });

    if (onboardErr) {
      toast('School created but onboarding failed: ' + onboardErr.message, 'error');
      setLoading(false);
      return;
    }

    toast('School registered successfully! Welcome to CampusOS.', 'success');
    setLoading(false);

    // Force a page reload so auth context picks up the new membership
    window.location.href = '/';
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-3 mb-8">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-500">
            <GraduationCap className="h-6 w-6 text-white" />
          </div>
          <span className="text-xl font-bold font-display text-navy-500">CampusOS</span>
        </div>

        <div className="rounded-2xl bg-white border border-slate-200 shadow-card p-8">
          {/* Step indicator */}
          <div className="flex items-center gap-2 mb-6">
            <div className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${step === 'account' ? 'bg-primary-500 text-white' : 'bg-success-500 text-white'}`}>
              {step === 'school' ? '✓' : '1'}
            </div>
            <div className={`h-0.5 flex-1 ${step === 'school' ? 'bg-primary-500' : 'bg-slate-200'}`} />
            <div className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${step === 'school' ? 'bg-primary-500 text-white' : 'bg-slate-200 text-slate-400'}`}>
              2
            </div>
          </div>

          {step === 'account' ? (
            <>
              <h2 className="text-xl font-bold font-display text-navy-500">Create your account</h2>
              <p className="mt-1 text-sm text-slate-500">Step 1 of 2 — Your personal details</p>

              <form onSubmit={handleAccountSubmit} className="mt-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <Input label="First name" name="firstName" value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
                  <Input label="Last name" name="lastName" value={lastName} onChange={(e) => setLastName(e.target.value)} required />
                </div>
                <Input label="Email" type="email" name="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                <Input label="Password" type="password" name="password" value={password} onChange={(e) => setPassword(e.target.value)} required hint="Minimum 6 characters" />

                <Button type="submit" className="w-full" size="lg">Continue</Button>
              </form>
            </>
          ) : (
            <>
              <button
                onClick={() => setStep('account')}
                className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-navy-500 mb-4 transition-colors"
              >
                <ArrowLeft className="h-4 w-4" /> Back
              </button>
              <h2 className="text-xl font-bold font-display text-navy-500">Register your school</h2>
              <p className="mt-1 text-sm text-slate-500">Step 2 of 2 — School details</p>

              <form onSubmit={handleSchoolSubmit} className="mt-6 space-y-4">
                <Input label="School name" name="schoolName" value={schoolName} onChange={(e) => setSchoolName(e.target.value)} required placeholder="Cedarfield Academy" />
                <Input label="Short name (optional)" name="shortName" value={shortName} onChange={(e) => setShortName(e.target.value)} placeholder="CFA" />
                <Select label="School type" value={schoolType} onChange={(e) => setSchoolType(e.target.value as SchoolType)}>
                  <option value="primary">Primary School</option>
                  <option value="secondary">Secondary School</option>
                  <option value="both">Primary & Secondary</option>
                </Select>
                <Input label="Address (optional)" name="address" value={address} onChange={(e) => setAddress(e.target.value)} />

                <Button type="submit" className="w-full" size="lg" disabled={loading}>
                  {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Create school & sign in'}
                </Button>
              </form>
            </>
          )}

          <p className="mt-6 text-center text-sm text-slate-500">
            Already have an account?{' '}
            <a href="/" className="font-medium text-primary-600 hover:text-primary-700">Sign in</a>
          </p>
        </div>
      </div>
    </div>
  );
}
