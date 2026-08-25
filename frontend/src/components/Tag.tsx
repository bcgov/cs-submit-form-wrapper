'use client';

import { useId } from 'react';
import { TagGroup, TagList } from '@bcgov/design-system-react-components';

export type TagColor = 'yellow' | 'blue' | 'bcBlue' | 'grey' | 'green';

const TAG_COLORS: Record<TagColor, 'yellow' | 'blue' | 'bc-blue' | 'grey' | 'green'> = {
  yellow: 'yellow',
  blue: 'blue',
  bcBlue: 'bc-blue',
  grey: 'grey',
  green: 'green',
};

type TagProps = {
  text: string;
  color?: TagColor;
  shape?: 'rectangular' | 'circular';
  /**
   * Read out before the text. Set it where nothing else names the tag; leave it off inside a table
   * cell, where the column header already does.
   */
  label?: string;
  'data-testid'?: string;
};

/**
 * Label pill. The design system renders tags as a grid, so a static label would be a tab stop and
 * announce as a grid containing a row and a cell. `inert` keeps it out of the tab order and off the
 * accessibility tree; the span carries the text. Drop both when the design system stops using grid
 * semantics - StatusTag's grid test fails when that happens.
 */
export function Tag({
  text,
  color = 'grey',
  shape = 'rectangular',
  label,
  'data-testid': testId,
}: Readonly<TagProps>) {
  const id = useId();

  return (
    <>
      <span className="visually-hidden">{label ? `${label}: ${text}` : text}</span>
      <div inert>
        <TagGroup aria-label={label ?? text} data-testid={testId}>
          <TagList
            items={[
              {
                id,
                textValue: text,
                color: TAG_COLORS[color],
                tagStyle: shape,
                size: 'small',
                children: text,
              },
            ]}
          />
        </TagGroup>
      </div>
    </>
  );
}
