import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { WorkspaceSelector } from '@/app/ui/WorkspaceSelector';

const workspaces = [
  { id: 'ws1', name: 'Alpha', kind: 'team' },
  { id: 'ws2', name: 'Beta', kind: 'personal' },
];

describe('WorkspaceSelector', () => {
  it('renders the selected workspace and the other options', () => {
    render(
      <WorkspaceSelector
        workspaces={workspaces}
        selectedWorkspaceId="ws1"
        label="Select Workspace"
        onChange={() => {}}
      />,
    );
    // BCDS Select renders a hidden native <select> plus a visible trigger, both of which
    // carry the selected item's "name (kind)" label — so the label appears more than once.
    expect(screen.getAllByText('Alpha (team)').length).toBeGreaterThan(0);
    // The other workspace is present as a selectable option.
    expect(screen.getAllByText('Beta (personal)').length).toBeGreaterThan(0);
  });

  it('offers the all-workspaces option only when given a label for it', () => {
    const { rerender } = render(
      <WorkspaceSelector
        workspaces={workspaces}
        selectedWorkspaceId={null}
        label="Select Workspace"
        onChange={() => {}}
      />,
    );
    expect(screen.queryByText('Every Workspace')).not.toBeInTheDocument();

    rerender(
      <WorkspaceSelector
        workspaces={workspaces}
        selectedWorkspaceId={null}
        label="Select Workspace"
        allLabel="Every Workspace"
        onChange={() => {}}
      />,
    );
    expect(screen.getAllByText('Every Workspace').length).toBeGreaterThan(0);
  });
});
