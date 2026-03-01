import {
  File,
  FileArchive,
  FileAudio,
  FileCode,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileVideo,
  Folder,
} from 'lucide-react';
import type { BrowseItem } from '@server/services/s3/types';

const IMAGE_EXTENSIONS = new Set([
  'avif',
  'bmp',
  'gif',
  'heic',
  'jpeg',
  'jpg',
  'png',
  'svg',
  'tif',
  'tiff',
  'webp',
]);

const VIDEO_EXTENSIONS = new Set(['avi', 'm4v', 'mkv', 'mov', 'mp4', 'mpeg', 'mpg', 'webm']);
const AUDIO_EXTENSIONS = new Set(['aac', 'flac', 'm4a', 'mp3', 'ogg', 'wav']);
const ARCHIVE_EXTENSIONS = new Set(['7z', 'bz2', 'gz', 'rar', 'tar', 'tgz', 'zip']);
const SPREADSHEET_EXTENSIONS = new Set(['csv', 'numbers', 'ods', 'tsv', 'xls', 'xlsx']);
const CODE_EXTENSIONS = new Set([
  'c',
  'cc',
  'cpp',
  'cs',
  'css',
  'go',
  'h',
  'hpp',
  'html',
  'java',
  'js',
  'json',
  'jsx',
  'kt',
  'md',
  'php',
  'py',
  'rb',
  'rs',
  'sh',
  'sql',
  'toml',
  'ts',
  'tsx',
  'vue',
  'xml',
  'yaml',
  'yml',
]);

const TEXT_EXTENSIONS = new Set(['doc', 'docx', 'odt', 'pdf', 'rtf', 'txt']);
const CODE_LIKE_FILE_NAMES = new Set(['dockerfile', 'makefile', 'readme', 'license']);

const getFileIconByName = (fileName: string) => {
  const normalizedName = fileName.trim().toLowerCase();
  if (CODE_LIKE_FILE_NAMES.has(normalizedName)) {
    return FileCode;
  }

  const extension = normalizedName.includes('.') ? (normalizedName.split('.').pop() ?? '') : '';
  if (!extension) {
    return File;
  }

  if (IMAGE_EXTENSIONS.has(extension)) {
    return FileImage;
  }
  if (VIDEO_EXTENSIONS.has(extension)) {
    return FileVideo;
  }
  if (AUDIO_EXTENSIONS.has(extension)) {
    return FileAudio;
  }
  if (ARCHIVE_EXTENSIONS.has(extension)) {
    return FileArchive;
  }
  if (SPREADSHEET_EXTENSIONS.has(extension)) {
    return FileSpreadsheet;
  }
  if (CODE_EXTENSIONS.has(extension)) {
    return FileCode;
  }
  if (TEXT_EXTENSIONS.has(extension)) {
    return FileText;
  }

  return File;
};

export const renderBrowseItemIcon = (item: BrowseItem) => {
  const ItemIcon = item.type === 'directory' ? Folder : getFileIconByName(item.name);
  return <ItemIcon size={16} />;
};
