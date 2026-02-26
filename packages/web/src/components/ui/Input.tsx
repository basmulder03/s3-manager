import { forwardRef } from 'react';
import type { InputHTMLAttributes } from 'react';

type InputProps = InputHTMLAttributes<HTMLInputElement>;

export const Input = forwardRef<HTMLInputElement, InputProps>(({ className = '', ...props }, ref) => {
  return <input ref={ref} className={`ui-input ${className}`.trim()} {...props} />;
});

Input.displayName = 'Input';
