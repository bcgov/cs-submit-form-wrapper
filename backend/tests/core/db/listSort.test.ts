import { sql, type SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { likePattern, orderByForSort, sortTokensFor } from '../../../src/core/db/listSort';
import { submissions, forms } from '../../../src/core/db/schema';

const dialect = new PgDialect();

const toSql = (parts: SQL[]): string =>
  dialect.sqlToQuery(sql.join(parts, sql`, `)).sql.toLowerCase();

const SORT_COLUMNS = {
  formName: { column: forms.name },
  submittedAt: { column: submissions.submittedAt, nullable: true },
  updatedAt: { column: submissions.updatedAt },
};

describe('sortTokensFor', () => {
  it('declares both directions for every field', () => {
    expect(sortTokensFor(['name', 'status'])).toEqual([
      'name:asc',
      'name:desc',
      'status:asc',
      'status:desc',
    ]);
  });
});

describe('orderByForSort', () => {
  it('orders ascending or descending on the named column', () => {
    expect(toSql(orderByForSort(SORT_COLUMNS, 'formName:asc', submissions.id))).toContain(
      '"name" asc',
    );
    expect(toSql(orderByForSort(SORT_COLUMNS, 'formName:desc', submissions.id))).toContain(
      '"name" desc',
    );
  });

  it('appends the tiebreak so ties cannot straddle two pages', () => {
    expect(toSql(orderByForSort(SORT_COLUMNS, 'updatedAt:desc', submissions.id))).toContain(
      '"id" desc',
    );
  });

  it('sorts rows with no value last in both directions', () => {
    expect(toSql(orderByForSort(SORT_COLUMNS, 'submittedAt:desc', submissions.id))).toContain(
      'desc nulls last',
    );
    expect(toSql(orderByForSort(SORT_COLUMNS, 'submittedAt:asc', submissions.id))).toContain(
      'asc nulls last',
    );
  });

  it('leaves a non-nullable column to the default null ordering', () => {
    expect(toSql(orderByForSort(SORT_COLUMNS, 'updatedAt:asc', submissions.id))).not.toContain(
      'nulls last',
    );
  });
});

describe('likePattern', () => {
  it('wraps the term for a contains match', () => {
    expect(likePattern('report')).toBe('%report%');
  });

  it('escapes wildcards so they are matched literally', () => {
    expect(likePattern('50%_off')).toBe('%50\\%\\_off%');
  });
});
