import { cn, initials } from '@/lib/utils';

interface AvatarProps {
  firstName: string;
  lastName: string;
  src?: string | null;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const sizes = {
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-12 w-12 text-base',
  xl: 'h-16 w-16 text-lg',
};

export function Avatar({ firstName, lastName, src, size = 'md', className }: AvatarProps) {
  if (src) {
    return (
      <img
        src={src}
        alt={`${firstName} ${lastName}`}
        className={cn('rounded-full object-cover', sizes[size], className)}
      />
    );
  }
  return (
    <div
      className={cn(
        'rounded-full flex items-center justify-center bg-primary-100 text-primary-700 font-semibold flex-shrink-0',
        sizes[size],
        className,
      )}
    >
      {initials(firstName, lastName)}
    </div>
  );
}
