import { Panel, UploadPanel } from '@web/components';

interface UploadPageProps {
  selectedPath: string;
  onUploadComplete: () => void;
}

export const UploadPage = ({ selectedPath, onUploadComplete }: UploadPageProps) => {
  return (
    <Panel title="Uploader" subtitle="Uses typed upload cookbook with direct/multipart fallback">
      <UploadPanel selectedPath={selectedPath} onUploadComplete={onUploadComplete} />
    </Panel>
  );
};
