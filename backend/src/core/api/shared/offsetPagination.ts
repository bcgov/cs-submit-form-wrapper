import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import { sortTokensFor } from '../../db/listSort';

extendZodWithOpenApi(z);

const MAX_LIST_LIMIT = 100;
const DEFAULT_LIST_LIMIT = 20;
/** Past this the caller is scanning, not paging, and the count behind it scans too. */
export const MAX_LIST_OFFSET = 100_000;

/**
 * Offset paging for the interactive lists. A row can repeat or be skipped when the underlying data
 * changes between two page requests. Within one response the rows and the total come from a single
 * snapshot. `pagination.ts` holds the cursor helpers a change feed would need; nothing serves one.
 */
export const OFFSET_DRIFT_NOTE =
  'Offset paging: a row can repeat or be missed if data changes between page requests.';

export const offsetQueryFields = {
  // Documented nullable because the generator infers it from the coercion: null coerces to 0, which
  // `min(0)` accepts. Over HTTP the value is always a string, so null never reaches it.
  offset: z.coerce.number().int().min(0).max(MAX_LIST_OFFSET).default(0),
  limit: z.coerce.number().int().min(1).max(MAX_LIST_LIMIT).default(DEFAULT_LIST_LIMIT),
};

/**
 * These endpoints paged by cursor before. Answering a cursor request with page one would look like
 * success and silently restart a caller's paging loop. Declared as a string rather than `never` so
 * the generated document still has a type for it.
 */
export const rejectedCursorField = z
  .string()
  .optional()
  .refine((value) => value === undefined, {
    message: 'cursor paging is not supported on this endpoint; use offset and limit',
  })
  .openapi({
    deprecated: true,
    description: 'Rejected. These endpoints page by offset and limit.',
  });

export const OffsetPageSchema = z
  .object({
    offset: z.number().int().min(0),
    limit: z.number().int().min(1),
    total: z.number().int().min(0),
  })
  .openapi('Core_OffsetPage');

export const searchQueryField = z.string().trim().min(1).optional();

/** The sort options a list declares, as `field:asc` / `field:desc`. */
export const makeSortEnum = <TField extends string>(fields: readonly TField[]) =>
  z.enum(sortTokensFor(fields));
