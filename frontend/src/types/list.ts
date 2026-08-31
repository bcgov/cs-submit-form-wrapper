/** Server-resolved paging. `total` counts every row the query matches, not the rows returned. */
export type ListPage = {
  offset: number;
  limit: number;
  total: number;
};

/** Paging, search and sort, as a list endpoint takes them. */
export type ListQueryArgs = {
  offset: number;
  limit: number;
  sort: string;
  q?: string;
};

export const EMPTY_LIST_PAGE: ListPage = { offset: 0, limit: 0, total: 0 };

/** Query params for a list request, with the empty search dropped. */
export const toListRequestQuery = (args: ListQueryArgs): Record<string, string | number> => ({
  offset: args.offset,
  limit: args.limit,
  sort: args.sort,
  ...(args.q ? { q: args.q } : {}),
});
