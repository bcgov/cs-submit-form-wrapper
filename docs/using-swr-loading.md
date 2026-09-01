# Data loading with SWR

Client-side reads go through SWR. Redux holds the Keycloak token, the auth flags and
notifications, and nothing else.

Do not call `useSWR` directly in a screen. Use `useAuthedSWR`, or a resource hook built on
it.

## Adding a read to a screen

`useFormSubmissions` is the smallest example, and it serves two screens:

```ts
const { data, isLoading, error, mutate } = useAuthedSWR(
  formId && opened ? ['form-submissions', formId] : null,
  (token) => getSobaSubmissions(token, { formId: formId as string }),
);

const submissions: SubmissionListItem[] = useMemo(
  () => (Array.isArray(data?.items) ? data.items : []),
  [data],
);
```

Three things to copy:

Return `null` for the key when the request is not ready. That replaces the old
`if (authenticated && token)` guard. Here there is no request to make without a form,
because the endpoint rejects an unscoped list, and none until the tab has been opened,
because the read needs a permission the form's designer need not hold.

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
!initStarted || initializing || !submissionId
  ? null
  : ['submit-submission', submissionId, token ? 'user' : 'anonymous'];
```

`!initStarted` is the guard that matters. Before Keycloak has run, "no token" is the
default rather than an answer, and a read started there is anonymous even for a signed-in
caller.

## Resource hooks

If two screens read the same thing, put it in a hook so the key is written once.
`['workspaces']` and `['workspaces', undefined]` are two different cache entries and two
requests.

```ts
export function useWorkspaces() {
  const { data, isLoading, error, mutate } = useAuthedSWR<WorkspaceItem[]>(
    WORKSPACES_KEY,
    async (token) => toItems((await fetchWorkspaces(token)).items),
    sessionReadConfig,
  );
  return { workspaces: data ?? EMPTY, loaded: data !== undefined, isLoading, error, mutate };
}
```

Existing hooks, in `src/shared/api/`:

- `useWorkspaces`, `useWritableWorkspaces`, `useWorkspace`, `useRefreshWorkspaces`,
  `useRefreshWorkspace`
- `useCurrentUser`, `useRefreshCurrentUser`
- `useFormDraft` (in `src/features/designer/`) for a form, its versions and the selected
  version's schema
- `useFormSubmissions` (in `src/features/designer/`) for one form's submissions, read by the
  designer tab and the submissions page
- `useSobaAdmins`, `useFeatureScopes`, `useFeatureScope` (in `src/features/admin/`)

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

When the write tells you what the row now holds, apply it to the cache instead of
refetching the list:

```ts
await upsertFeatureScope(token, body);
await mutate((current) => (current ? { ...current, items: patched(current.items) } : current), {
  revalidate: false,
});
```

Guard `current`. A key with nothing in it yet hands the updater `undefined`.

To forget a key rather than patch it, go through the cache: `mutate(key, undefined)` reads
as "revalidate", not "forget", and leaves the old value in place.

```ts
const { cache } = useSWRConfig();
cache.delete(unstable_serialize(key));
```

## Editing a loaded record

Read in the outer component and render the form only once the record is there, so the
fields can be `useState` initialized from it. Key the form on the record id. Do not mirror
each field into a second `loaded` state to diff against on save, and do not push the
record into state from an effect.

```tsx
if (isLoading) return <CenteredProgress label={dict.general.loading} />;
if (!workspace) return <InlineAlert description={dict.workspaces.loadError} ... />;
return <WorkspaceSettings key={workspace.id} workspace={workspace} />;
```

The alert matters: a form that renders without its record posts its empty fields as a new
one.

The record is read to seed a form that cannot re-seed itself, so it must not outlive the
screen. Drop it on unmount, as `useFeatureScope` does. Otherwise the next visit seeds from
whatever the cache still holds, a save or a toggle elsewhere having moved on from it, and
saving there writes the stale value straight back. Refreshing the key after your own write
is not enough on its own: it does not cover the writes made from a list.

Send only the fields that changed. The record behind the form can move while the fields
cannot, so a whole-form save carries the values this person was shown over anything edited
elsewhere since:

```ts
const patch: UpdateWorkspaceBody = {};
if (trimmedName !== seed.name) patch.name = trimmedName;
```

## Loading

- No data yet: show `CenteredProgress`, or pass `isLoading` to the table's `loading`.
- Data present while revalidating: leave the data up.
- Error: the inline alert, or the table's `error`.

A filter change is not a background refresh. The key changes, there is no data for the new
key, and the table shows its loading state. That is deliberate: the alternative is the
previous workspace's rows sitting under the new workspace's name.

Render an error in three branches, in this order:

```ts
if (isSessionExpired(loadError)) return dict.general.sessionExpired;
if (isForbidden(loadError)) return dict.general.noAccess;
return dict.somewhere.loadError;
```

Never fall through to `Error.message`. It is the backend's string, untranslated, and it
reaches the user as `Request failed (403)`.

The two are not interchangeable. `isForbidden` is 403 only, which is what the API answers a
permission refusal with. A 401 an authenticated caller cannot refresh past is the session
being refused, and `sobaFetch` has already turned it into a `SessionExpiredError`.

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

## List filters in the URL

The forms list keeps its workspace filter in `?workspace=<id>`. If you add a filter to a
list, follow the same shape.

Resolve an id from the URL before it reaches a request. It can name something the user
cannot see:

```ts
const selectedWorkspaceId =
  workspaceParam && workspaces.some((w) => w.id === workspaceParam) ? workspaceParam : undefined;
```

Hold the key at `null` while the list you resolve against is still loading. Resolving too
early scopes the request to nothing.

An id that never resolves reads unscoped, and the screen says so: the picker returns to all
workspaces and a notice explains that the filter was not applied, with a Clear action. Do
not leave the table asserting a filter it does not have, and do not show an empty table
instead, which asserts there is nothing to see. Use the same message for unknown and
forbidden, so the page does not confirm which ids exist.

Forget a rejected id rather than remembering it. It is not a view worth restoring, and the
memory would otherwise hand it back on every arrival and raise the notice again.

Write filter changes with `history.replaceState`, not `router.replace`. A router
navigation re-runs the page's server component, which re-reads the features and build
metadata for what is only a client-side change. Next keeps `useSearchParams` in sync with
`replaceState`.

`src/shared/list/listQueryMemory.ts` remembers a list's query per tab, so leaving and
coming back returns it as the user left it. Declare the params your list owns in a
`ListQuerySpec`. Links from inside the app carry `?from=nav` (use `navLink()`); a URL
without it is a bookmark or someone else's link and means the unfiltered list. A URL that
names a scope counts as a choice wherever it came from. A bare one does not touch the
memory.

## Screens with their own loading

`FormioV5SubmissionFillClient` and `StartSubmission`.

The fill client holds answers the user has typed that no server has seen, and Form.io
resets the live webform when the submission prop is not deep-equal to what is on screen. A
revalidating cache over it discards work. `StartSubmission` is a fire-once idempotent POST.

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

Search, page size, page and sort are still resolved client-side over a capped fetch and are
not in the URL. They move when the list endpoints can answer them: offset paging with a
total, per-resource sort options, and search on the endpoints that lack it.

How much of a screen changes then depends on where its key and fetcher live. Put them in a
resource hook, as `useWorkspaces` and `useFormDraft` do, and the screen does not move at
all. `FormList` is the last list screen still calling `useAuthedSWR` inline, so it will be
edited directly.
