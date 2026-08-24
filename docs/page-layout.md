# Page layout

Every page renders through `PageLayout`, so padding, content width, the heading block and page
notices are the same everywhere. The page supplies content; the layout decides arrangement.

## Adding a page

```tsx
<PageLayout headingId="things-heading" heading={dict.general.things}>
  <ThingList />
</PageLayout>
```

Do not add a `<section>`, padding, a width or a heading of your own. `headingId` is what the
section's `aria-labelledby` points at, so it has to match the heading that actually renders.

## Widths

- `narrow`, 45rem: prose. Help, feedback, meta, onboarding.
- `default`, 75rem: lists, forms, the Form.io render and fill pages.
- `wide`, 90rem: the designer.

Set with `width="narrow"`. The value lands in `--page-max-width` rather than a class, so a
form-level width can drive the same property later without changing the component.

## Headings

Pass `heading` from the page whenever the title is known on the server, which is nearly always.

When the title is only known after data loads, the page still passes the best value it has and the
client component replaces it:

```tsx
usePageHeading({ heading: form.name, eyebrow: workspace.name });
```

Strings, not markup: the layout renders the eyebrow tag. Last caller wins, and unmounting restores
the page's own value. Call it before any early return, like every other hook.

The eyebrow row is reserved on every page that shows a title, so titles sit on the same line
whether or not there is a tag.

## Notices

Four kinds. Pick by what the notice is, not by how it looks.

Page state, a condition that holds while the page still works:

```tsx
usePageNotices([
  needsDisclaimer && { id: 'disclaimer', variant: 'warning', body: dict.form.disclaimerRequired },
]);
```

Data, not markup, so the layout owns position, spacing, the `page-notice-<id>` test id and
announcement. Falsy entries drop out, so the call site stays a flat list of conditions. Add
`action: { label, onPress }` for a notice that needs a button.

Blocking, where the page cannot be used at all: return early from the component with your own
alert. Not a page notice.

In context, where the notice explains the control beside it: render it inline where it belongs.

Result of an action: use `useNotificationStore`, which shows a toast.

## Announcement

The notices region is always in the DOM and starts empty, with `aria-live="polite"`. Notices that
appear later are announced; the ones present on load are not. `danger` also carries `role="alert"`.
There is nothing to set per notice.
