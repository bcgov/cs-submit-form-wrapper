# Server-paged lists

Search, filters, sort and paging are resolved by the server. The URL carries that query.
A screen does not keep its own copy, except the search box, which reaches the URL on
submit rather than as the user types.

Offset paging can repeat or skip a row if the data changes between two page requests. That is
fine for these tables. Within one response, `items` and `total` come from a single snapshot.

## Adding a list

Backend, in the repo:

1. Declare the sort fields and the column map (`THING_SORT_FIELDS`, `THING_SORT_COLUMNS`).
2. Run the page query and the count in one `readListPage` call, with the same `where`.

Backend, in the route schema:

3. Spread `offsetQueryFields`, reject `cursor` with `rejectedCursorField`, and build `sort`
   from `makeSortEnum`.

Frontend:

4. Add a spec to `frontend/src/shared/list/listQueryMemory.ts`.
5. Read the page with `useAuthedSWR` and `listReadConfig`. Put every value the request uses in
   the SWR key.
6. Wire `useListQuery` into `DataTable`. Set `sortField` on each column that should sort.
7. If something links into this list, build the href with `listLink`. If a screen returns to
   it, use `navLink`.

## Backend

### Sort fields

```ts
export const THING_SORT_FIELDS = ['name', 'status', 'createdAt'] as const;
export type ThingListSortField = (typeof THING_SORT_FIELDS)[number];
export type ThingListSort = SortToken<ThingListSortField>;

const THING_SORT_COLUMNS: SortColumns<ThingListSortField> = {
  name: { column: things.name, caseInsensitive: true },
  status: { column: things.status },
  createdAt: { column: things.createdAt },
};
```

`caseInsensitive` orders by `lower(column)`, which matches `ilike` search. Use it for text a
person typed. Skip it for codes and enums, which have an index on the raw column that folding would not use.

`nullable: true` puts empty values last in both directions. Without it, sorting submissions by
`submittedAt` ascending would open on rows that have never been submitted.

### Reading a page

```ts
return readListPage(async (tx) => {
  const items = await tx
    .select({ ... })
    .from(things)
    .where(where)
    .orderBy(...orderByForSort(THING_SORT_COLUMNS, input.sort, things.id))
    .limit(input.limit)
    .offset(input.offset);
  const totals = await tx.select({ total: count() }).from(things).where(where);
  return { items, total: totals[0]?.total ?? 0 };
});
```

`readListPage` is a repeatable-read, read-only transaction, so the count describes the rows in
the same snapshot. `orderByForSort` appends the id as a tiebreak; without it, rows that share a
sort value can swap pages.

An empty `workspaceIds` array still means the caller holds the permission nowhere, not "all
workspaces". Return `{ items: [], total: 0 }` without querying.

### The query schema

```ts
export const ListThingsQuerySchema = z.object({
  ...offsetQueryFields,
  cursor: rejectedCursorField,
  q: searchQueryField.openapi({ description: 'Matches anywhere in the name.' }),
  sort: makeSortEnum(THING_SORT_FIELDS).default('createdAt:desc'),
});
```

`offsetQueryFields` is `offset` (0 to 100000) and `limit` (1 to 100, default 20). `searchQueryField`
trims and rejects the empty string, so the client must omit `q` rather than send spaces. Respond
with `{ items, page, filters, sort }` and echo every filter you accepted.

`sort` is an enum of `field:asc` / `field:desc`. `q` goes through `likePattern` into `ilike`,
which binds as a parameter and treats `%`, `_` and `\` as literals. A `cursor` param is a 400:
answering it with page one would look like success and restart a caller that still pages that way.

## Frontend

### The spec

Add it next to the others in `listQueryMemory.ts`. `sortOptionsFor` is already in that file.

```ts
export const THINGS_LIST_QUERY: ListQuerySpec = {
  resource: 'things',
  filters: ['status'],
  sortOptions: sortOptionsFor(['name', 'status', 'createdAt']),
  defaultSort: 'createdAt:desc',
};
```

`resource` is the URL prefix (`things.page`, `things.sort`) and the per-tab memory key. Keep
`sortOptions` identical to the endpoint enum: a token the backend does not declare is a 400.

`defaultSort` should be a column that has `sortField`, so the header can show the current order
and reverse it. If the table is ordered by `createdAt` but no column declares that field, every
header reports `aria-sort="none"`.

### The screen

```tsx
const listQuery = useListQuery(THINGS_LIST_QUERY);
const { things, total, isLoading, error } = useThings({
  offset: listQuery.offset,
  limit: listQuery.pageSize,
  sort: listQuery.sort,
  q: listQuery.q,
});
```

Pass `listReadConfig` into the SWR hook (see `docs/using-swr-loading.md`). Name every request
value in the key. A value in the fetcher but not the key serves one query's rows under another.

Give the table the read's `error`. Without it a failed load renders the empty message, which
says there is nothing there.

```tsx
{ key: 'name', label: dict.things.columns.name, sortField: 'name', render: ... }
```

Pass `sort={listQuery.sort}` and `onSortChange={listQuery.setSort}`. A column without
`sortField` is not a sort control, even if the table is sorted by that field.

Filters apply as soon as they change. Search applies on submit: `commitSearch`, which the Search
button and Enter both call. The term is trimmed; whitespace only clears the search rather than
sending a value the API would reject.

After a write the server accepted, re-read the page (`mutate` / `refresh`). Patching `items`
in cache leaves the total and the sort order stale: a deleted row still counts, and an edited
one may belong on a different page.

A filter in the URL can name an id the user cannot see. Resolve it against their own list
before it reaches the request, and hold the SWR key at `null` until that list has loaded.
Resolving too early scopes the request to nothing. An id that never resolves should read
unscoped, with a notice and a clear action, not an empty table, which claims there is nothing
to see. Use one message for an id that does not exist and one the user cannot see, so the page
cannot be used to find out which ids are real. Forget a rejected id so the next nav arrival does
not replay it.

Write query changes with `history.replaceState`, not `router.replace`. A router navigation
re-runs the page's server component for a client-side query change. Next keeps
`useSearchParams` in sync with `replaceState`.

### Linking to a list

Params are named `{resource}.{name}`. A hand-written `?workspace=ws1` is ignored.

```ts
listLink(`/${locale}/forms`, FORMS_LIST_QUERY, { workspace: workspaceId })
navLink(`/${locale}/workspaces`)
```

`listLink` writes the spec's names (`forms.workspace=<id>`). Use it when the destination should
open already scoped. It does not set `from=nav`; the params in the URL are the query.

`navLink` adds `?from=nav` and restores what this tab last remembered. Use it when an
in-app arrival should mean the list as this tab left it: the forms and workspaces items in
the sidebar, the post-login forms landing, and returning from workspace or feature-scope
edit. A URL without the marker is a bookmark or someone else's link, and loads the
unfiltered list. A URL that already names a query is a choice either way.

### Two lists on one route

Because the names include the resource, `formVersions.page` and `formSubmissions.page` do not
collide. The designer keeps both tabs mounted once they have been opened, so this is not
hypothetical: a shared `page` let the shorter table clamp to its last page and write that
back over the other.

## Testing

Give each test its own SWR cache; see `docs/using-swr-loading.md`.

Mock `page: { offset, limit, total }`. `DataTable` only draws paging when `total` is set, so a
cursor-shaped mock tests a table with no footer.

For a link into a list, build it with `listLink` or read it back with `readUrlParams`. Pinning
`?workspace=ws1` will pass while the list on the other end ignores it.
