'use client';

import { Select } from '@bcgov/design-system-react-components';

export type WorkspaceSelectorItem = { id: string; name: string; kind: string };

export function WorkspaceSelector({
  workspaces,
  activeWorkspaceId,
  label,
  onChange,
  size = 'small',
}: Readonly<{
  workspaces: WorkspaceSelectorItem[];
  activeWorkspaceId: string | null;
  label: string;
  size?: 'small' | 'medium';
  onChange: (key: string | number | null) => void;
}>) {
  return (
    <Select
      size={size}
      id="workspace-select"
      data-testid="workspace-select"
      aria-label={label}
      className="mr-2"
      selectedKey={activeWorkspaceId || null}
      onSelectionChange={onChange}
      items={workspaces.map((ws) => ({ id: ws.id, label: `${ws.name} (${ws.kind})` }))}
    />
  );
}
