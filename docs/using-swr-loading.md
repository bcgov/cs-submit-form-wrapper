# Data loading with SWR

Client-side reads go through SWR. Redux holds the Keycloak token, the auth flags and
notifications, and nothing else.

Do not call `useSWR` directly in a screen. Use `useAuthedSWR`, or a resource hook built on
it.

## Adding a read to a screen

`SubmissionList` is the smallest example:

```tsx
const listQuery = useListQuery(SUBMISSIONS_LIST_QUERY);

const {
  data,
  isLoading,
  error: loadError,
} = useAuthedSWR(
  formId
    ? ['submissions', formId, listQuery.offset, listQuery.pageSize, listQuery.sort, listQuery.q]
    : null,
  (token) =>
    getSobaSubmissions(token, {
      offset: listQuery.offset,
      limit: listQuery.pageSize,
      sort: listQuery.sort,
      q: listQuery.q,
      formId: formId as string,
    }),
);

const submissions: SubmissionListItem[] = useMemo(
  () => (Array.isArray(data?.items) ? data.items : []),
  [data],
);
```

Three things to copy:

Return `null` for the key when the request is not ready. That replaces the old
`if (authenticated && token)` guard. Here there is no request to make without a form,
because the endpoint rejects an unscoped list.

Everything that changes the rows is in the key. A page, sort or search change is a
different request, not a different slice of one.

Take the token as a fetcher argument. Never put it in the key. See below.

Guard the shape of the response. `parseJson` casts the body unchecked, so a malformed 200
can put a non-array where you expect a list.

## The token is never in the key

The app asks Keycloak to refresh the token every 30 seconds. If the token were part of the
key, every mounted screen would miss the cache and refetch on each rotation, and the
session would drop out of "ready" long enough for the access guard to unmount whatever is
on screen.

`useAuthedSWR` handles this. It gates on the token but does not key on it:

```ts
const ready = authenticated && !!token;

return useSWR<T>(
  ready && key ? key : null,
  () => {
    const current = store.getState().keycloak.token;
    if (!current) throw new SessionExpiredError();
    return fetcher(current);
  },
  config,
);
```

Signed in but still waiting for a token is not ready either. `sobaFetch` would send the
call with no Authorization header rather than wait, and get a 401.

For the submit surface use `useMaybeAuthedSWR`, which allows an anonymous read. Its key
must say which identity it is, or signing in gets served the anonymous reader's copy:

```ts
initializing || !submissionId
  ? null
  : ['submit-submission', submissionId, token ? 'user' : 'anonymous'];
```

## Resource hooks

If two screens read the same thing, put it in a hook so the key is written once.
`['workspaces']` and `['workspaces', undefined]` are two different cache entries and two
requests.

```ts
export function useWorkspaces() {
  const { data, isLoading, error, mutate } = useAuthedSWR<WorkspaceItem[]>(
    WORKSPACES_KEY,
    async (token) => toItems((await fetchWorkspaces(token, PICKER_QUERY)).items),
    sessionReadConfig,
  );
  return { workspaces: data ?? EMPTY, loaded: data !== undefined, isLoading, error, mutate };
}
```

A picker is not a list. It asks for one page at the endpoint's cap, because a permission gate
reading page one would be wrong rather than merely short, and a user with more than the cap sees a
truncated picker.

Existing hooks, in `src/shared/api/`:

- `useWorkspaces`, `useWritableWorkspaces`, `useRefreshWorkspaces`
- `useCurrentUser`, `useRefreshCurrentUser`
- `useFormDraft` (in `src/features/designer/`) for a form, its versions and the selected
  version's schema

## Config

`src/shared/api/swrConfig.ts` is mounted once by `AppProviders`. You should not need to
change it.

`sessionReadConfig` turns off focus, reconnect and stale revalidation. Use it for a read
where a refetch at an arbitrary moment would be wrong:

- `/me` and the workspace lists, because the route policy reads them. A refetch answering
  with an empty list would redirect a signed-in user to onboarding mid-session.
- The designer's schema, because `FormDesigner` takes its model once at mount and a
  refetch must not reach the builder.

Everything else can revalidate normally.

## Writes

Do the write as a plain awaited call, then mutate the affected key:

```ts
await updateWorkspace(token, workspaceId, body);
await refreshWorkspaces();
router.push(`/${locale}/workspaces`);
```

Do not reach for `useSWRMutation`.

## Loading

- No data yet: show `CenteredProgress`, or pass `isLoading` to the table's `loading`.
- Data present while revalidating: leave the data up.
- Error: the inline alert, or the table's `error`.

A filter change is not a background refresh. The key changes, there is no data for the new
key, and the table shows its loading state. That is deliberate: the alternative is the
previous workspace's rows sitting under the new workspace's name.

Keep the session-expired branch when you render an error:

```ts
if (isSessionExpired(loadError)) return dict.general.sessionExpired;
```

Without it the user gets the raw `Error.message`.

## Session and routing

`useAppSession` composes `/me` and the two workspace lists. `AppAccessGuard` reads it.

- `sessionReady`: all three answered, none errored.
- `sessionFailed`: any of them errored.
- `sessionLoadedOnce`: all three have data. SWR keeps the last data across a failed
  revalidation, so this stays true through a background failure and resets only when the
  session ends. It works only because the token is not in the key.

Once bootstrapped, a failed reload must not replace the route. Swapping children for the
spinner unmounts the route, and a form being filled loses its answers.

`resolveRedirect` does nothing until `initStarted`. Before Keycloak has run,
`authenticated` is `false` by default, and acting on it sends a deep link to the landing
page and drops its query string.

## List queries in the URL

Search, filters, sort, page and page size are resolved by the server and carried in the
URL. `useListQuery(spec)` owns that: it reads them, validates them, and returns the
`offset`, `limit`, `sort` and `q` a list request takes, plus the setters a screen wires to
the table. A screen holds no list state of its own.

The spec in `src/shared/list/listQueryMemory.ts` declares what a list owns: its filters,
the sort tokens its endpoint accepts, and the default sort. A list that gains a filter
declares it there and nothing else changes.

Two values are checked before they can reach a request. A sort the endpoint does not
declare falls back to the list default. A page size outside the offered options falls back
to the default, because the API rejects one it does not allow and the table would be left
empty with no way back.

The page resets whenever the rows underneath it change: a new filter, sort or search term.
Page 4 of one query is not page 4 of another.

`q` reaches the URL after the user stops typing, or immediately via `commitSearch` when the user
presses Enter or the Search button. Keying on every keystroke is a request per character. The term
is trimmed on the way out: the API trims and then rejects an empty one, so a whitespace-only term
is a cleared search, not a search for a space.

Paged reads pass `listReadConfig`. SWR drops `data` when the key changes, and the table draws its
paging controls from the total in that data, so without it the footer unmounts mid-request and
takes the keyboard focus with it. `isLoading` still reports the in-flight page, so screens read
progress from it as usual.

Resolve an id from the URL before it reaches a request. It can name something the user
cannot see:

```ts
const selectedWorkspaceId =
  workspaceParam && workspaces.some((w) => w.id === workspaceParam) ? workspaceParam : undefined;
```

Hold the key at `null` until you can resolve it, or an unresolved filter falls through to
an unscoped read and shows rows from everywhere. An unresolvable id gets the unfiltered
table and a notice with a Clear action. Use the same message for unknown and forbidden, so
the page does not confirm which ids exist.

Write filter changes with `history.replaceState`, not `router.replace`. A router
navigation re-runs the page's server component, which re-reads the features and build
metadata for what is only a client-side change. Next keeps `useSearchParams` in sync with
`replaceState`.

`listQueryMemory` also remembers a list's query per tab, so leaving and coming back returns
it as the user left it. Links from inside the app carry `?from=nav` (use `navLink()`); a
URL without it is a bookmark or someone else's link and means the unfiltered list. A URL
that names a query counts as a choice wherever it came from. A bare one does not touch the
memory.

## Screens with their own loading

`FormioV5SubmissionFillClient`, `StartSubmission` and `WorkspaceForm`.

The fill client holds answers the user has typed that no server has seen, and Form.io
resets the live webform when the submission prop is not deep-equal to what is on screen. A
revalidating cache over it discards work. `StartSubmission` is a fire-once idempotent POST.
`WorkspaceForm` reads one workspace through a plain effect; it has no reason to stay that
way beyond nobody needing it yet.

## Testing

Give every test its own cache. Without a fresh one, the second test in a file is served
the first one's data and never calls the fetcher it is asserting on.

```tsx
<SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0, shouldRetryOnError: false }}>
```

`shouldRetryOnError: false` matters beyond isolation: a failed fetch otherwise schedules a
retry that fires during the next test, after cleanup.

Render with a real store and real hooks, and mock the API module:

```tsx
<Provider store={store}>
  <SWRConfig value={...}>
    <FormList />
  </SWRConfig>
</Provider>
```

Do not mock `@/lib/store` wholesale. It keeps passing while asserting nothing once a screen
stops reading Redux.

## Two things to know before you change routing

`useSearchParams` needs no Suspense boundary here, because nothing under `app/[lang]` is
prerendered: the segment has no `generateStaticParams`, and the layout awaits two
`no-store` fetches. Adding either would turn the client-side-rendering bailout into a build
failure on every list page.

Pickers are not lists. `useWorkspaces` asks for a single page at the endpoint's cap because
a permission gate reading page one would be wrong, not just short. A user in more
workspaces than that cap sees a truncated picker.
