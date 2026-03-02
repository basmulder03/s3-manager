export const formatDate = (value: string | null): string => {
  if (!value) {
    return '-';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
};

export const getObjectKeyFromPath = (path: string): string => {
  const parts = path.split('/');
  return parts.slice(1).join('/') || path;
};

export const attachRelativePathToFile = (file: File, relativePath: string): File => {
  try {
    Object.defineProperty(file, 'webkitRelativePath', {
      configurable: true,
      value: relativePath,
    });
    return file;
  } catch {
    return file;
  }
};

export const collectFilesFromDirectoryHandle = async (
  directoryHandle: { values: () => AsyncIterable<unknown> },
  parentPath = ''
): Promise<File[]> => {
  const files: File[] = [];

  for await (const entry of directoryHandle.values()) {
    const entryRecord = entry as {
      kind?: string;
      name?: string;
      getFile?: () => Promise<File>;
      values?: () => AsyncIterable<unknown>;
    };

    if (entryRecord.kind === 'file' && typeof entryRecord.getFile === 'function') {
      const file = await entryRecord.getFile();
      const relativePath = parentPath
        ? `${parentPath}/${entryRecord.name ?? file.name}`
        : (entryRecord.name ?? file.name);
      files.push(attachRelativePathToFile(file, relativePath));
      continue;
    }

    if (entryRecord.kind === 'directory' && typeof entryRecord.values === 'function') {
      const nextParentPath = parentPath
        ? `${parentPath}/${entryRecord.name ?? ''}`
        : (entryRecord.name ?? '');
      const nestedFiles = await collectFilesFromDirectoryHandle(
        { values: entryRecord.values.bind(entryRecord) },
        nextParentPath
      );
      files.push(...nestedFiles);
    }
  }

  return files;
};
