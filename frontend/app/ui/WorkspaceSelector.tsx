'use client';

import { Select } from '@bcgov/design-system-react-components';

export type WorkspaceSelectorItem = { id: string; name: string; kind: string };

export function WorkspaceSelector({
  workspaces,
  selectedWorkspaceId,
  label,
  onChange,
  size = 'small',
  allowAll = false,
}: Readonly<{
  workspaces: WorkspaceSelectorItem[];
  selectedWorkspaceId: string | null;
  label: string;
  size?: 'small' | 'medium';
  allowAll?: boolean;
  onChange: (key: string | number | null) => void;
}>) {
  return (
    <Select
      size={size}
      id="workspace-select"
      data-testid="workspace-select"
      label={label}
      aria-label={label}
      className="mr-2"
      selectedKey={selectedWorkspaceId || (allowAll ? 'all' : null)}
      onSelectionChange={(key) => onChange(key === 'all' ? null : key)}
      items={[
        ...(allowAll ? [{ id: 'all', label: 'All Workspaces' }] : []),
        ...workspaces.map((ws) => ({ id: ws.id, label: `${ws.name} (${ws.kind})` })),
      ]}
    />
  );
}
