'use client';

import { Tag, type TagColor } from './Tag';

export type StatusTagVariant = 'primary' | 'info' | 'neutral' | 'success';

const VARIANT_COLORS: Record<StatusTagVariant, TagColor> = {
  primary: 'bcBlue',
  info: 'blue',
  neutral: 'grey',
  success: 'green',
};

type StatusTagProps = {
  label: string;
  variant?: StatusTagVariant;
  'data-testid'?: string;
};

/**
 * Status/role pill for table cells. Shared by workspace roles and submission workflow states so
 * they look identical across list pages.
 */
export function StatusTag({
  label,
  variant = 'neutral',
  'data-testid': testId,
}: Readonly<StatusTagProps>) {
  return (
    <Tag text={label} color={VARIANT_COLORS[variant]} shape="circular" data-testid={testId} />
  );
}

export function workspaceRoleToVariant(role?: string): StatusTagVariant {
  const normalized = (role || '').toLowerCase();
  if (normalized === 'owner') return 'primary';
  if (normalized === 'admin') return 'info';
  return 'neutral';
}

export function workflowStateToVariant(state?: string): StatusTagVariant {
  return (state || '').toLowerCase() === 'submitted' ? 'success' : 'neutral';
}
