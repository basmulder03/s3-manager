import type { ButtonHTMLAttributes, PropsWithChildren } from 'react';

interface ButtonProps extends PropsWithChildren<ButtonHTMLAttributes<HTMLButtonElement>> {
  variant?: 'default' | 'muted';
}

export const Button = ({ variant = 'default', className = '', children, ...props }: ButtonProps) => {
  return (
    <button
      type="button"
      className={`ui-button ${variant === 'muted' ? 'ui-button-muted' : ''} ${className}`.trim()}
      {...props}
    >
      {children}
    </button>
  );
};
