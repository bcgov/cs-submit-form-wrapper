import { asc, desc, sql, type Column, type SQL } from 'drizzle-orm';

export type SortToken<TField extends string> = `${TField}:asc` | `${TField}:desc`;

export const sortTokensFor = <TField extends string>(
  fields: readonly TField[],
): SortToken<TField>[] =>
  fields.flatMap((field) => [`${field}:asc`, `${field}:desc`] as SortToken<TField>[]);

interface SortableColumn {
  column: Column;
  /** Rows with no value sort last in both directions. */
  nullable?: boolean;
  /**
   * Order by the folded value, so "Budget" and "budget" sort together as the `ilike` search returns
   * them. An index for such a sort has to be on `lower(column)`.
   */
  caseInsensitive?: boolean;
}

export type SortColumns<TField extends string> = Record<TField, SortableColumn>;

/**
 * Order for one sort token, with `tiebreak` appended so a query returns rows in the same order on
 * every page request. Without it, ties are ordered by whatever the plan happens to produce and a
 * row can appear on two pages.
 */
export function orderByForSort<TField extends string>(
  columns: SortColumns<TField>,
  token: SortToken<TField>,
  tiebreak: Column,
): SQL[] {
  const separator = token.lastIndexOf(':');
  const field = token.slice(0, separator) as TField;
  const direction = token.slice(separator + 1);
  const { column, nullable, caseInsensitive } = columns[field];

  if (!nullable && !caseInsensitive) {
    return [direction === 'asc' ? asc(column) : desc(column), desc(tiebreak)];
  }

  const target = caseInsensitive ? sql`lower(${column})` : sql`${column}`;
  if (direction === 'asc') {
    return [nullable ? sql`${target} asc nulls last` : sql`${target} asc`, desc(tiebreak)];
  }
  return [nullable ? sql`${target} desc nulls last` : sql`${target} desc`, desc(tiebreak)];
}

/**
 * `ilike` pattern for a substring search. Wildcards in the term are escaped, so a name containing
 * `_` or `%` is searched for literally.
 */
export const likePattern = (term: string): string =>
  `%${term.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
