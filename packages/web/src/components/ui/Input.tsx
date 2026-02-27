import { forwardRef } from 'react';
import type { InputHTMLAttributes } from 'react';
import styles from '@web/components/ui/Input.module.css';

type InputProps = InputHTMLAttributes<HTMLInputElement>;

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className = '', ...props }, ref) => {
    return <input ref={ref} className={`${styles.input} ${className}`.trim()} {...props} />;
  }
);

Input.displayName = 'Input';
