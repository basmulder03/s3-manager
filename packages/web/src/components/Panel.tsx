import type { PropsWithChildren } from 'react';

interface PanelProps extends PropsWithChildren {
  title: string;
  subtitle?: string;
}

export const Panel = ({ title, subtitle, children }: PanelProps) => {
  return (
    <section className="panel">
      <header className="panel-header">
        <h2>{title}</h2>
        {subtitle ? <p>{subtitle}</p> : null}
      </header>
      <div className="panel-content">{children}</div>
    </section>
  );
};
