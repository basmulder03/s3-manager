import type { QueryClause, QueryOperator } from '@web/pages/browser/types';

export const tokenizeFilterQuery = (input: string): string[] => {
  const tokens: string[] = [];
  const matcher = /"([^"\\]*(?:\\.[^"\\]*)*)"|'([^'\\]*(?:\\.[^'\\]*)*)'|\S+/g;
  let match: RegExpExecArray | null;

  while ((match = matcher.exec(input)) !== null) {
    const token = (match[1] ?? match[2] ?? match[0] ?? '').trim();
    if (token.length > 0) {
      tokens.push(token);
    }
  }

  return tokens;
};

export const parseSizeLiteralBytes = (value: string): number | null => {
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  const match = normalized.match(/^(\d+(?:\.\d+)?)(b|bytes?|kb|kib|mb|mib|gb|gib|tb|tib)?$/);
  if (!match) {
    return null;
  }

  const amount = Number.parseFloat(match[1] ?? '');
  if (!Number.isFinite(amount)) {
    return null;
  }

  const unit = match[2] ?? 'b';
  const multiplierByUnit: Record<string, number> = {
    b: 1,
    byte: 1,
    bytes: 1,
    kb: 1024,
    kib: 1024,
    mb: 1024 ** 2,
    mib: 1024 ** 2,
    gb: 1024 ** 3,
    gib: 1024 ** 3,
    tb: 1024 ** 4,
    tib: 1024 ** 4,
  };

  const multiplier = multiplierByUnit[unit];
  if (!multiplier) {
    return null;
  }

  return Math.round(amount * multiplier);
};

export const parseFilterClauses = (query: string): QueryClause[] => {
  const tokens = tokenizeFilterQuery(query);

  return tokens.map<QueryClause>((token) => {
    const trimmed = token.trim();
    const negate = trimmed.startsWith('!') || trimmed.startsWith('-');
    const raw = negate ? trimmed.slice(1).trim() : trimmed;

    if (!raw) {
      return {
        kind: 'text',
        value: '',
        negate,
      };
    }

    const comparisonMatch = raw.match(/^([a-zA-Z][a-zA-Z0-9_.-]*)(<=|>=|=|<|>)(.+)$/);
    if (comparisonMatch) {
      const [, field, operator, value] = comparisonMatch;
      return {
        kind: 'field',
        field: field?.toLowerCase() ?? '',
        operator: (operator as QueryOperator) ?? ':',
        value: value?.trim() ?? '',
        negate,
      };
    }

    const colonIndex = raw.indexOf(':');
    if (colonIndex > 0) {
      const field = raw.slice(0, colonIndex).trim().toLowerCase();
      const value = raw.slice(colonIndex + 1).trim();
      if (field.length > 0) {
        return {
          kind: 'field',
          field,
          operator: ':',
          value,
          negate,
        };
      }
    }

    return {
      kind: 'text',
      value: raw,
      negate,
    };
  });
};

export const normalizeFieldName = (field: string): string =>
  field.replace(/[-_]/g, '').toLowerCase();

export const normalizeText = (value: string): string => value.trim().toLowerCase();

export const doesStringMatch = (
  actual: string,
  expected: string,
  operator: QueryOperator
): boolean => {
  const normalizedActual = normalizeText(actual);
  const normalizedExpected = normalizeText(expected);
  if (!normalizedExpected) {
    return true;
  }

  if (operator === '=') {
    return normalizedActual === normalizedExpected;
  }

  return normalizedActual.includes(normalizedExpected);
};
