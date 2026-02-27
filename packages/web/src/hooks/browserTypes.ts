import type { BrowseItem } from '@server/services/s3/types';

export type RenameModalState = {
  sourcePath: string;
  currentName: string;
  nextName: string;
};

export type MoveModalState = {
  sourcePath: string;
  destinationPath: string;
};

export type DeleteModalState = {
  items: BrowseItem[];
};

export type PropertiesModalState = {
  path: string;
  loading: boolean;
  saving: boolean;
  error: string;
  dirty: boolean;
  details: null | {
    name: string;
    key: string;
    size: number;
    contentType: string;
    lastModified: string | null;
    etag: string | null;
    storageClass: string;
    metadata: Record<string, string>;
    cacheControl?: string;
    contentDisposition?: string;
    contentEncoding?: string;
    contentLanguage?: string;
    expires?: string;
    versionId?: string;
    serverSideEncryption?: string;
  };
  draft: null | {
    contentType: string;
    storageClass: string;
    cacheControl: string;
    contentDisposition: string;
    contentEncoding: string;
    contentLanguage: string;
    expires: string;
    metadata: Array<{
      id: string;
      key: string;
      value: string;
    }>;
  };
};

type FilePreviewBase = {
  path: string;
  contentType: string;
  etag: string | null;
  loading: boolean;
  error: string;
};

type TextFilePreview = FilePreviewBase & {
  mode: 'text';
  content: string;
  originalContent: string;
  editable: boolean;
  canToggleEdit: boolean;
};

type MediaFilePreview = FilePreviewBase & {
  mode: 'image' | 'audio' | 'video';
  mediaUrl: string;
};

export type FilePreviewModalState = TextFilePreview | MediaFilePreview;
