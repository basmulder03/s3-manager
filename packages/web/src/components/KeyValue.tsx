interface KeyValueProps {
  label: string;
  value: string;
}

export const KeyValue = ({ label, value }: KeyValueProps) => {
  return (
    <div className="key-value">
      <span>{label}</span>
      <code>{value}</code>
    </div>
  );
};
