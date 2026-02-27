const BYTE_UNITS = ['bytes', 'KB', 'MB', 'GB', 'TB', 'PB'] as const;

export const formatBytes = (value: number): string => {
  if (!Number.isFinite(value) || value <= 0) {
    return '0 bytes';
  }

  if (value < 1024) {
    const rounded = Math.round(value);
    return `${rounded} ${rounded === 1 ? 'byte' : 'bytes'}`;
  }

  const exponent = Math.min(Math.floor(Math.log(value) / Math.log(1024)), BYTE_UNITS.length - 1);
  const scaled = value / 1024 ** exponent;
  const decimals = scaled >= 100 ? 0 : scaled >= 10 ? 1 : 2;
  return `${scaled.toFixed(decimals)} ${BYTE_UNITS[exponent]}`;
};
