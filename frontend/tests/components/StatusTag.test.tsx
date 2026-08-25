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

  it('is a label, not an interactive grid', () => {
    const { container } = render(<StatusTag label="Owner" data-testid="tag" />);
    expect(container.querySelector('[role="grid"]')).toBeNull();
    expect(container.querySelector('[tabindex]')).toBeNull();
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
