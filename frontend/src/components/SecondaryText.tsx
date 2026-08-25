'use client';

import { Text } from '@bcgov/design-system-react-components';

type SecondaryTextProps = {
  children: React.ReactNode;
  /** `span` for text beside a control, `p` for a line of its own. */
  elementType?: 'span' | 'p';
  size?: 'small' | 'medium';
  'data-testid'?: string;
};

/**
 * Secondary body text. Server pages cannot import the design system directly, so this wrapper is
 * how they reach it.
 */
export function SecondaryText({
  children,
  elementType = 'span',
  size = 'small',
  'data-testid': testId,
}: Readonly<SecondaryTextProps>) {
  return (
    <Text size={size} color="secondary" elementType={elementType} data-testid={testId}>
      {children}
    </Text>
  );
}
