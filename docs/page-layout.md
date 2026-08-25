# Page layout

Every page renders through `PageLayout`, so padding, content width, the heading block and page
notices are the same everywhere. The page supplies content; the layout decides arrangement.

## Adding a page

```tsx
<PageLayout headingId="things-heading" heading={dict.general.things}>
  <ThingList />
</PageLayout>
```

Do not add a `<section>`, padding, a width or a heading of your own. `heading` is required, so the
section's `aria-labelledby` always resolves. Page padding belongs to `main`, so error and
session-failure states that never reach a `PageLayout` are inset too.

## Widths

- `narrow`, 45rem: prose. Help, feedback, meta, onboarding.
- `default`, 75rem: lists, forms, the Form.io render and fill pages.
- `wide`, 90rem: the designer.

Set with `width="narrow"`. The value lands in `--page-max-width`, set inline on the page element,
so nothing inherited can override it - a form-level width will need its own container inside the
page rather than reaching this one.

## Headings

Pass `heading` from the page whenever the title is known on the server, which is nearly always.

When the title is only known after data loads, the page still passes the best value it has and the
client component replaces it:

```tsx
usePageHeading({ heading: form.name, eyebrow: workspace.name });
```

Strings, not markup: the layout renders the eyebrow tag. Omitting `heading` leaves the page's own
in place, so a caller can supply only an eyebrow, or nothing until its data arrives. Registrants are
keyed, so one unmounting cannot blank another's. Call it before any early return, like every other
hook.

The eyebrow row is reserved on every page, so titles sit on the same line whether or not there is a
tag.

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

Notices register from an effect, so every one of them lands after the first paint and is announced -
there is no quiet "already on the page" case. `danger` carries `role="alert"`, everything else
`role="status"`. There is nothing to set per notice.
