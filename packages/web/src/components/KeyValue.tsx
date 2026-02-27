import styles from '@web/components/KeyValue.module.css';

interface KeyValueProps {
  label: string;
  value: string;
}

export const KeyValue = ({ label, value }: KeyValueProps) => {
  return (
    <div className={styles.item}>
      <span>{label}</span>
      <code>{value}</code>
    </div>
  );
};
