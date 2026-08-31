import type { RouteKind } from './appRoutePolicy';

// One const per repeated kind so the map below doesn't duplicate the literal per segment
// (keeps SonarCloud's string-duplication rule satisfied).
const WORKSPACE_APP: RouteKind = 'workspace-app';
const WORKSPACES: RouteKind = 'workspaces';
const PUBLIC: RouteKind = 'public';

/**
 * Single source of truth mapping each top-level route segment (the folder directly under
 * `app/[lang]/`) to how the access guard treats it. This lives next to the routes it
 * describes: when you add an `app/[lang]/<segment>` route, add its entry here in the same
 * change so the guard never drifts from the actual route tree.
 *
 * Any segment not listed here falls through to `'public'`.
 */
export const ROUTE_KIND_BY_SEGMENT: Readonly<Record<string, RouteKind>> = {
  onboarding: 'onboarding', // app/[lang]/onboarding
  // Platform administration: signed-in but not workspace-scoped, so it is treated like the
  // workspace chooser (session required, no active workspace needed). The page itself and the
  // backend `/admin/*` routes gate on the `soba_admin` role.
  admin: WORKSPACES, // app/[lang]/admin
  forms: WORKSPACE_APP, // app/[lang]/forms
  designer: WORKSPACE_APP, // app/[lang]/designer
  // Public fill/submit route: reachable without signing in; the backend authorizes against the
  // form's Form submitters audience (a non-public form returns 401 and the renderer shows an error).
  form: PUBLIC, // app/[lang]/form/[formId]
  // Public fill route for an already-opened submission (resume by id); same audience authorization.
  submit: PUBLIC, // app/[lang]/submit/[submissionId]
  submissions: WORKSPACE_APP, // app/[lang]/submissions (staff management table)
  // Single-submission view: public so an anonymous submitter sees their confirmation; the backend
  // authorizes the read against the form's audience (public-form submissions are public data).
  submission: PUBLIC, // app/[lang]/submission/[submissionId]
  workspaces: WORKSPACES, // app/[lang]/workspaces
  workspace: WORKSPACES, // app/[lang]/workspace
  // Diagnostic feature-support page; public (renders without auth, gated on the `meta` feature).
  meta: PUBLIC, // app/[lang]/meta
};
