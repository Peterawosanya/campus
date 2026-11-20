import { forwardRef, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, className, id, ...props }, ref) => {
    const inputId = id ?? props.name;
    return (
      <div className="space-y-1.5">
        {label && (
          <label htmlFor={inputId} className="block text-sm font-medium text-navy-500">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={cn(
            'w-full h-10 rounded-lg border bg-white px-3 text-sm text-navy-500 placeholder:text-slate-400 transition-colors focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-transparent',
            error ? 'border-error-300 focus:ring-error-400' : 'border-slate-300',
            className,
          )}
          {...props}
        />
        {error ? (
          <p className="text-xs text-error-500">{error}</p>
        ) : hint ? (
          <p className="text-xs text-slate-500">{hint}</p>
        ) : null}
      </div>
    );
  },
);
Input.displayName = 'Input';

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, className, id, children, ...props }, ref) => {
    const selectId = id ?? props.name;
    return (
      <div className="space-y-1.5">
        {label && (
          <label htmlFor={selectId} className="block text-sm font-medium text-navy-500">
            {label}
          </label>
        )}
        <select
          ref={ref}
          id={selectId}
          className={cn(
            'w-full h-10 rounded-lg border bg-white px-3 text-sm text-navy-500 transition-colors focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-transparent',
            error ? 'border-error-300 focus:ring-error-400' : 'border-slate-300',
            className,
          )}
          {...props}
        >
          {children}
        </select>
        {error && <p className="text-xs text-error-500">{error}</p>}
      </div>
    );
  },
);
Select.displayName = 'Select';

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, className, id, ...props }, ref) => {
    const textareaId = id ?? props.name;
    return (
      <div className="space-y-1.5">
        {label && (
          <label htmlFor={textareaId} className="block text-sm font-medium text-navy-500">
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={textareaId}
          className={cn(
            'w-full rounded-lg border bg-white px-3 py-2 text-sm text-navy-500 placeholder:text-slate-400 transition-colors focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-transparent min-h-[80px] resize-y',
            error ? 'border-error-300 focus:ring-error-400' : 'border-slate-300',
            className,
          )}
          {...props}
        />
        {error && <p className="text-xs text-error-500">{error}</p>}
      </div>
    );
  },
);
Textarea.displayName = 'Textarea';
