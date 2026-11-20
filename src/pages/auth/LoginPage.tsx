import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/components/ui/Toast';
import { Input, Button } from '@/components/ui';
import { GraduationCap, Loader2 } from 'lucide-react';

export function LoginPage() {
  const { signIn } = useAuth();
  const { toast } = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    setLoading(true);
    const { error } = await signIn(email, password);
    setLoading(false);
    if (error) {
      toast(error, 'error');
    } else {
      toast('Welcome back to CampusOS', 'success');
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left panel */}
      <div className="hidden lg:flex lg:w-1/2 bg-navy-500 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-20 w-72 h-72 rounded-full bg-primary-400 blur-3xl" />
          <div className="absolute bottom-20 right-20 w-96 h-96 rounded-full bg-primary-500 blur-3xl" />
        </div>
        <div className="relative z-10 flex flex-col justify-between p-12 text-white">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-500">
              <GraduationCap className="h-6 w-6 text-white" />
            </div>
            <span className="text-xl font-bold font-display">CampusOS</span>
          </div>

          <div className="max-w-md">
            <h1 className="text-4xl font-bold font-display leading-tight text-balance">
              One school. One connected platform.
            </h1>
            <p className="mt-4 text-lg text-navy-100 leading-relaxed">
              CampusOS brings school operations, academic management, communication and intelligent insights together — simplifying administration, supporting teachers, and engaging parents.
            </p>
            <div className="mt-8 grid grid-cols-2 gap-4">
              {[
                { label: 'Student Management', value: 'Unified' },
                { label: 'Academic Workflow', value: 'End-to-end' },
                { label: 'Role-Based Access', value: '8 roles' },
                { label: 'Data Isolation', value: 'Per school' },
              ].map((item) => (
                <div key={item.label} className="rounded-xl bg-white/5 border border-white/10 p-4">
                  <p className="text-xs text-navy-200 uppercase tracking-wide">{item.label}</p>
                  <p className="mt-1 text-lg font-semibold">{item.value}</p>
                </div>
              ))}
            </div>
          </div>

          <p className="text-sm text-navy-200">
            Built for Nigerian primary & secondary schools
          </p>
        </div>
      </div>

      {/* Right panel — form */}
      <div className="flex-1 flex items-center justify-center p-6 bg-slate-50">
        <div className="w-full max-w-sm">
          <div className="lg:hidden flex items-center gap-3 mb-8">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-500">
              <GraduationCap className="h-6 w-6 text-white" />
            </div>
            <span className="text-xl font-bold font-display text-navy-500">CampusOS</span>
          </div>

          <h2 className="text-2xl font-bold font-display text-navy-500">Sign in to your account</h2>
          <p className="mt-2 text-sm text-slate-500">
            Enter your credentials to access your school dashboard.
          </p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-4">
            <Input
              label="Email address"
              type="email"
              name="email"
              placeholder="you@school.edu.ng"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
            <Input
              label="Password"
              type="password"
              name="password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />

            <Button type="submit" className="w-full" size="lg" disabled={loading}>
              {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Sign in'}
            </Button>
          </form>

          <div className="mt-6 rounded-lg border border-primary-100 bg-primary-50 p-4">
            <p className="text-xs font-semibold text-primary-700 uppercase tracking-wide">Cedarfield Academy (fictional demo)</p>
            <p className="mt-1 text-xs text-primary-800">Password for all demo accounts: <span className="font-medium">cedarfield2026</span></p>
            <div className="mt-2 space-y-1 text-xs text-primary-800">
              <p><span className="font-medium">Platform:</span> platform@cedarfield.edu.ng</p>
              <p><span className="font-medium">Owner:</span> owner@cedarfield.edu.ng</p>
              <p><span className="font-medium">Admin:</span> admin@cedarfield.edu.ng</p>
              <p><span className="font-medium">Academic:</span> academic@cedarfield.edu.ng</p>
              <p><span className="font-medium">Bursar:</span> bursar@cedarfield.edu.ng</p>
              <p><span className="font-medium">Teacher:</span> teacher@cedarfield.edu.ng</p>
              <p><span className="font-medium">Parent:</span> parent@cedarfield.edu.ng</p>
              <p><span className="font-medium">Student:</span> student@cedarfield.edu.ng</p>
            </div>
          </div>

          <p className="mt-6 text-center text-sm text-slate-500">
            Need to register a new school?{' '}
            <a href="/register" className="font-medium text-primary-600 hover:text-primary-700">
              Create account
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
