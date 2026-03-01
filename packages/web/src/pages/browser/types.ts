import type { LucideIcon } from 'lucide-react';

export type SortKey =
  | 'name'
  | 'size'
  | 'modified'
  | 'type'
  | 'key'
  | 'etag'
  | 'versionId'
  | 'serverSideEncryption'
  | 'contentType'
  | 'storageClass'
  | 'cacheControl'
  | 'contentDisposition'
  | 'contentEncoding'
  | 'contentLanguage'
  | 'expires';

export type SortDirection = 'asc' | 'desc';

export interface SortRule {
  key: SortKey;
  direction: SortDirection;
}

export type QueryOperator = ':' | '=' | '>' | '>=' | '<' | '<=';

export type QueryClause = {
  negate: boolean;
} & (
  | {
      kind: 'text';
      value: string;
    }
  | {
      kind: 'field';
      field: string;
      operator: QueryOperator;
      value: string;
    }
);

export type OverviewColumnKey =
  | 'showKey'
  | 'showSize'
  | 'showModified'
  | 'showEtag'
  | 'showVersionId'
  | 'showServerSideEncryption'
  | 'showContentType'
  | 'showStorageClass'
  | 'showCacheControl'
  | 'showContentDisposition'
  | 'showContentEncoding'
  | 'showContentLanguage'
  | 'showExpires';

export type OverviewColumnVisibility = Record<OverviewColumnKey, boolean> & {
  showName: boolean;
  showMetadata: boolean;
};

export interface OverviewColumnDefinition {
  key: OverviewColumnKey;
  label: string;
  requiresProperties: boolean;
}

export interface ShortcutDefinition {
  id: string;
  action: string;
  shortcuts: string[][];
  Icon: LucideIcon;
}

export interface ContextMenuAction {
  id: string;
  label: string;
  hint?: string;
  isDanger?: boolean;
  isDisabled?: boolean;
  submenuActions?: ContextMenuAction[];
  onSelect: () => void;
}

export interface FilterHelpEntry {
  id: string;
  query: string;
  whatItDoes: string;
  howItWorks: string;
  examples: string[];
}
