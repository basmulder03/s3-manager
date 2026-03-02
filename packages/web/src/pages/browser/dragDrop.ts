export const INTERNAL_MOVE_DRAG_TYPE = 'application/x-s3-manager-move-path';

export type FileWithRelativePath = File & { webkitRelativePath?: string };

type DataTransferItemWithEntry = DataTransferItem & {
  webkitGetAsEntry?: () => FileSystemEntryLike | null;
};

type FileSystemEntryLike = {
  name: string;
  isFile: boolean;
  isDirectory: boolean;
};

type FileSystemFileEntryLike = FileSystemEntryLike & {
  isFile: true;
  file: (
    successCallback: (file: File) => void,
    errorCallback?: (error: DOMException) => void
  ) => void;
};

type FileSystemDirectoryReaderLike = {
  readEntries: (
    successCallback: (entries: FileSystemEntryLike[]) => void,
    errorCallback?: (error: DOMException) => void
  ) => void;
};

type FileSystemDirectoryEntryLike = FileSystemEntryLike & {
  isDirectory: true;
  createReader: () => FileSystemDirectoryReaderLike;
};

const readDirectoryEntries = async (
  reader: FileSystemDirectoryReaderLike
): Promise<FileSystemEntryLike[]> => {
  const entries: FileSystemEntryLike[] = [];

  while (true) {
    const chunk = await new Promise<FileSystemEntryLike[]>((resolve, reject) => {
      reader.readEntries(resolve, reject);
    });

    if (chunk.length === 0) {
      break;
    }

    entries.push(...chunk);
  }

  return entries;
};

const fileFromEntry = async (
  entry: FileSystemFileEntryLike,
  relativePath: string
): Promise<FileWithRelativePath> => {
  const file = await new Promise<File>((resolve, reject) => {
    entry.file(resolve, reject);
  });

  const normalizedRelativePath = relativePath.replace(/^\/+/, '');
  if (normalizedRelativePath.length > 0) {
    Object.defineProperty(file, 'webkitRelativePath', {
      configurable: true,
      value: normalizedRelativePath,
    });
  }

  return file as FileWithRelativePath;
};

export const cloneDroppedFile = (file: File): File => {
  return new globalThis.File([file], file.name, {
    type: file.type,
    lastModified: file.lastModified,
  });
};

const collectFilesFromEntry = async (
  entry: FileSystemEntryLike,
  parentPath: string
): Promise<FileWithRelativePath[]> => {
  if (entry.isFile) {
    const fileEntry = entry as FileSystemFileEntryLike;
    const relativePath = parentPath ? `${parentPath}/${entry.name}` : entry.name;
    return [await fileFromEntry(fileEntry, relativePath)];
  }

  if (!entry.isDirectory) {
    return [];
  }

  const directoryEntry = entry as FileSystemDirectoryEntryLike;
  const nextParentPath = parentPath ? `${parentPath}/${entry.name}` : entry.name;
  const reader = directoryEntry.createReader();
  const childEntries = await readDirectoryEntries(reader);
  const nestedFiles = await Promise.all(
    childEntries.map((childEntry) => collectFilesFromEntry(childEntry, nextParentPath))
  );

  return nestedFiles.flat();
};

export const extractFilesFromDroppedEntries = async (
  dataTransfer: DataTransfer
): Promise<{ files: FileWithRelativePath[]; hasDirectoryEntry: boolean }> => {
  const rawEntryItems = Array.from(dataTransfer.items ?? []).map(
    (item) => (item as DataTransferItemWithEntry).webkitGetAsEntry?.() ?? null
  );
  const entryItems: FileSystemEntryLike[] = [];
  for (const entry of rawEntryItems) {
    if (entry) {
      entryItems.push(entry as FileSystemEntryLike);
    }
  }

  if (entryItems.length === 0) {
    return { files: [], hasDirectoryEntry: false };
  }

  const hasDirectoryEntry = entryItems.some((entry) => entry.isDirectory);
  const fileLists = await Promise.all(entryItems.map((entry) => collectFilesFromEntry(entry, '')));
  const files = fileLists.flat();
  return { files, hasDirectoryEntry };
};
