import { describe, it, expect } from 'vitest';
import { codeItems, codeLabel } from '@/src/shared/util/codeList';

const MINISTRIES = { HLTH: 'Health (HLTH)', FOR: 'Forests (FOR)' };

describe('codeLabel', () => {
  it('resolves a known code', () => {
    expect(codeLabel(MINISTRIES, 'HLTH')).toBe('Health (HLTH)');
  });

  // A row written before the dictionary existed holds a display name. Showing it beats "Unknown".
  it('returns the stored value when the dictionary does not know it', () => {
    expect(codeLabel(MINISTRIES, 'Ministry of Health')).toBe('Ministry of Health');
  });

  it('reports nothing stored', () => {
    expect(codeLabel(MINISTRIES, null)).toBeNull();
    expect(codeLabel(MINISTRIES, '')).toBeNull();
  });
});

describe('codeItems', () => {
  it('offers the dictionary', () => {
    expect(codeItems(MINISTRIES, 'HLTH')).toEqual([
      { id: 'HLTH', label: 'Health (HLTH)' },
      { id: 'FOR', label: 'Forests (FOR)' },
    ]);
  });

  // Without this the select renders its placeholder and the row looks unset.
  it('adds the stored value when it is not in the dictionary', () => {
    expect(codeItems(MINISTRIES, 'Ministry of Health')).toContainEqual({
      id: 'Ministry of Health',
      label: 'Ministry of Health',
    });
  });

  it('adds nothing for a workspace being created', () => {
    expect(codeItems(MINISTRIES, undefined)).toHaveLength(2);
  });
});
