import { useEffect, useState } from 'react';
import { ScrollView } from 'react-native';

import { apiFetch } from '../lib/api';
import FolderTree from './FolderTree';

interface FolderPanelProps {
  folder: string;
  onFolderChange: (folder: string) => void;
  onClose: () => void;
}

export default function FolderPanel({
  folder,
  onFolderChange,
  onClose,
}: FolderPanelProps) {
  const [folders, setFolders] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    apiFetch('/api/photos/meta')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        setFolders(data.folders ?? []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <ScrollView style={{ flex: 1 }}>
      <FolderTree
        folders={folders}
        selected={folder}
        onSelect={(next) => {
          onFolderChange(next);
          onClose();
        }}
      />
    </ScrollView>
  );
}
