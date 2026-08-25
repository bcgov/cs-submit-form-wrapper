import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  StatusTag,
  workspaceRoleToVariant,
  workflowStateToVariant,
} from '@/src/components/StatusTag';

describe('StatusTag', () => {
  it('renders label text', () => {
    render(<StatusTag label="Owner" variant="primary" data-testid="tag" />);
    expect(screen.getByTestId('tag')).toHaveTextContent('Owner');
  });

  // The design system renders tags as a grid, so a static pill would be a tab stop and announce as
  // a grid containing a row and a cell. Pinned on purpose: when that changes upstream this fails,
  // which is the signal to drop the inert wrapper in Tag.tsx and the note in docs/page-layout.md.
  it('renders through the design system, which gives it grid semantics', () => {
    const { container } = render(<StatusTag label="Owner" data-testid="tag" />);
    expect(container.querySelector('[role="grid"]')).not.toBeNull();
  });

  it('keeps the grid out of the tab order and off the accessibility tree', () => {
    const { container } = render(<StatusTag label="Owner" data-testid="tag" />);
    const inert = container.querySelector('[inert]');
    expect(inert).not.toBeNull();
    expect(inert?.contains(container.querySelector('[role="grid"]'))).toBe(true);
  });

  it('announces the label as plain text instead', () => {
    const { container } = render(<StatusTag label="Owner" data-testid="tag" />);
    const spoken = container.querySelector('.visually-hidden');
    expect(spoken).toHaveTextContent('Owner');
    expect(spoken?.closest('[inert]')).toBeNull();
  });

  it('maps workspace roles to variants', () => {
    expect(workspaceRoleToVariant('owner')).toBe('primary');
    expect(workspaceRoleToVariant('admin')).toBe('info');
    expect(workspaceRoleToVariant('member')).toBe('neutral');
  });

  it('maps workflow states to variants', () => {
    expect(workflowStateToVariant('submitted')).toBe('success');
    expect(workflowStateToVariant('draft')).toBe('neutral');
  });
});
