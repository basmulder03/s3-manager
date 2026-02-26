import type { ButtonHTMLAttributes, PropsWithChildren } from 'react';

interface ButtonProps extends PropsWithChildren<ButtonHTMLAttributes<HTMLButtonElement>> {
  variant?: 'default' | 'muted' | 'danger';
}

export const Button = ({ variant = 'default', className = '', children, ...props }: ButtonProps) => {
  const variantClass =
    variant === 'muted' ? 'ui-button-muted' : variant === 'danger' ? 'ui-button-danger' : '';

  return (
    <button
      type="button"
      className={`ui-button ${variantClass} ${className}`.trim()}
      {...props}
    >
      {children}
    </button>
  );
};
