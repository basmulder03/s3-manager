import type { PropsWithChildren } from 'react';
import styles from '@web/components/Panel.module.css';

interface PanelProps extends PropsWithChildren {
  title: string;
  subtitle?: string;
}

export const Panel = ({ title, subtitle, children }: PanelProps) => {
  return (
    <section className={styles.panel}>
      <header className={styles.header}>
        <h2>{title}</h2>
        {subtitle ? <p>{subtitle}</p> : null}
      </header>
      <div className={styles.content}>{children}</div>
    </section>
  );
};
