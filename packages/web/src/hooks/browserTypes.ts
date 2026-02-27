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
  error: string;
  details: null | {
    name: string;
    key: string;
    size: number;
    contentType: string;
    lastModified: string | null;
    etag: string | null;
    storageClass: string;
    metadata: Record<string, string>;
  };
};
