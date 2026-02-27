const TEXT_EXTENSIONS = new Set([
  'txt',
  'md',
  'json',
  'yaml',
  'yml',
  'csv',
  'log',
  'xml',
  'html',
  'css',
  'js',
  'ts',
  'tsx',
  'jsx',
]);

const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico']);
const AUDIO_EXTENSIONS = new Set(['mp3', 'wav', 'ogg', 'aac', 'm4a', 'flac']);
const VIDEO_EXTENSIONS = new Set(['mp4', 'webm', 'ogg', 'mov', 'm4v']);

type MediaKind = 'image' | 'audio' | 'video';

export type FileCapability = {
  canView: boolean;
  canEditText: boolean;
  previewKind: 'text' | MediaKind | 'none';
};

const getExtension = (path: string): string => {
  const fileName = path.split('/').pop() ?? path;
  const extensionIndex = fileName.lastIndexOf('.');
  if (extensionIndex <= 0) {
    return '';
  }

  return fileName.slice(extensionIndex + 1).toLowerCase();
};

const normalizeContentType = (contentType: string | null | undefined): string => {
  return (contentType ?? '').toLowerCase().split(';')[0]?.trim() ?? '';
};

export const resolveFileCapability = (
  path: string,
  contentType?: string | null
): FileCapability => {
  const extension = getExtension(path);
  const normalizedContentType = normalizeContentType(contentType);

  const isTextByExtension = TEXT_EXTENSIONS.has(extension);
  const isTextByContentType =
    normalizedContentType.startsWith('text/') ||
    normalizedContentType === 'application/json' ||
    normalizedContentType === 'application/xml' ||
    normalizedContentType === 'application/javascript' ||
    normalizedContentType === 'application/x-yaml' ||
    normalizedContentType === 'application/yaml';

  if (isTextByExtension || isTextByContentType) {
    return {
      canView: true,
      canEditText: isTextByExtension,
      previewKind: 'text',
    };
  }

  if (normalizedContentType.startsWith('image/') || IMAGE_EXTENSIONS.has(extension)) {
    return {
      canView: true,
      canEditText: false,
      previewKind: 'image',
    };
  }

  if (normalizedContentType.startsWith('audio/') || AUDIO_EXTENSIONS.has(extension)) {
    return {
      canView: true,
      canEditText: false,
      previewKind: 'audio',
    };
  }

  if (normalizedContentType.startsWith('video/') || VIDEO_EXTENSIONS.has(extension)) {
    return {
      canView: true,
      canEditText: false,
      previewKind: 'video',
    };
  }

  return {
    canView: false,
    canEditText: false,
    previewKind: 'none',
  };
};
