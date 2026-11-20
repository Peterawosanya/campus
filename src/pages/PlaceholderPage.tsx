import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import type { ReactNode } from 'react';

interface PlaceholderPageProps {
  title: string;
  description: string;
  icon: ReactNode;
  milestone?: string;
}

export function PlaceholderPage({ title, description, icon, milestone }: PlaceholderPageProps) {
  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold font-display text-navy-500">{title}</h1>
        <p className="mt-1 text-sm text-slate-500">{description}</p>
      </div>

      <Card className="border-dashed border-2 border-slate-200 bg-slate-50/50">
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-50 text-primary-500">
            {icon}
          </div>
          <h3 className="text-base font-semibold text-navy-500">{title}</h3>
          <p className="mt-1 text-sm text-slate-500 max-w-md">
            This module is part of {milestone ?? 'an upcoming milestone'} and will be fully implemented with database persistence, forms, and workflows.
          </p>
          {milestone && (
            <Badge variant="primary" className="mt-4">
              {milestone}
            </Badge>
          )}
        </div>
      </Card>
    </div>
  );
}
