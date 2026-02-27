import type { ButtonHTMLAttributes, PropsWithChildren } from 'react';
import styles from '@web/components/ui/Button.module.css';

interface ButtonProps extends PropsWithChildren<ButtonHTMLAttributes<HTMLButtonElement>> {
  variant?: 'default' | 'muted' | 'danger';
}

export const Button = ({
  variant = 'default',
  className = '',
  children,
  ...props
}: ButtonProps) => {
  const variantClass =
    variant === 'muted' ? styles.muted : variant === 'danger' ? styles.danger : '';

  return (
    <button
      type="button"
      className={`${styles.button} ${variantClass} ${className}`.trim()}
      {...props}
    >
      {children}
    </button>
  );
};
