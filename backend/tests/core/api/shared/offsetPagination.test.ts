import { z } from 'zod';
import {
  makeSortEnum,
  offsetQueryFields,
  rejectedCursorField,
  MAX_LIST_OFFSET,
} from '../../../../src/core/api/shared/offsetPagination';

describe('makeSortEnum', () => {
  const schema = makeSortEnum(['name', 'status']);

  it('accepts a declared token', () => {
    expect(schema.parse('status:desc')).toBe('status:desc');
  });

  it('rejects an undeclared field and an undeclared direction', () => {
    expect(schema.safeParse('createdAt:desc').success).toBe(false);
    expect(schema.safeParse('name:sideways').success).toBe(false);
  });
});

describe('offsetQueryFields', () => {
  const schema = z.object(offsetQueryFields);

  it('defaults to the first page', () => {
    expect(schema.parse({})).toEqual({ offset: 0, limit: 20 });
  });

  it('coerces the query string values', () => {
    expect(schema.parse({ offset: '40', limit: '25' })).toEqual({ offset: 40, limit: 25 });
  });

  it('rejects a negative offset and a limit outside the allowed range', () => {
    expect(schema.safeParse({ offset: -1 }).success).toBe(false);
    expect(schema.safeParse({ limit: 0 }).success).toBe(false);
    expect(schema.safeParse({ limit: 101 }).success).toBe(false);
  });

  it('rejects an offset past the cap', () => {
    expect(schema.safeParse({ offset: MAX_LIST_OFFSET }).success).toBe(true);
    expect(schema.safeParse({ offset: MAX_LIST_OFFSET + 1 }).success).toBe(false);
  });
});

describe('rejectedCursorField', () => {
  const schema = z.object({ cursor: rejectedCursorField });

  it('accepts a request that sends no cursor', () => {
    expect(schema.safeParse({}).success).toBe(true);
  });

  it('rejects a cursor with a message naming the replacement', () => {
    const result = schema.safeParse({ cursor: 'eyJtIjoiaWQifQ' });
    expect(result.success).toBe(false);
    if (result.success) throw new Error('expected parse failure');
    expect(result.error.issues[0].message).toContain('offset and limit');
  });
});
