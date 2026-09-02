import {
  readSessionValue,
  removeSessionValues,
  writeSessionValue,
} from '@/src/shared/storage/sessionStore';

/**
 * A list's URL params: the filters it owns plus the paging set every list carries. They are
 * remembered and restored as one set, so a list that gains a filter only has to declare it here.
 */
export type ListQuerySpec = {
  resource: string;
  filters: readonly string[];
  /** Sort tokens the endpoint accepts. Anything else in the URL falls back to the default. */
  sortOptions: readonly string[];
  defaultSort: string;
};

export type ListQueryParams = Record<string, string>;

/** Paging, search and sort, resolved by the server on every list. */
export const SHARED_LIST_PARAMS = ['q', 'sort', 'page', 'pageSize'] as const;

export const listQueryParams = (spec: ListQuerySpec): string[] => [
  ...spec.filters,
  ...SHARED_LIST_PARAMS,
];

/** Both directions of every field the endpoint declares. */
const sortOptionsFor = (fields: readonly string[]): string[] =>
  fields.flatMap((field) => [`${field}:asc`, `${field}:desc`]);

const SUBMISSION_SORT_FIELDS = ['formName', 'submittedAt', 'createdAt', 'updatedAt'] as const;
const UPDATED_DESC = 'updatedAt:desc';

export const FORMS_LIST_QUERY: ListQuerySpec = {
  resource: 'forms',
  filters: ['workspace'],
  sortOptions: sortOptionsFor(['name', 'status', 'createdAt', 'updatedAt']),
  defaultSort: 'createdAt:desc',
};

export const WORKSPACES_LIST_QUERY: ListQuerySpec = {
  resource: 'workspaces',
  filters: [],
  sortOptions: sortOptionsFor(['name', 'kind', 'status', 'updatedAt']),
  defaultSort: 'name:asc',
};

/** The submissions tab inside the designer. Same shape, its own remembered query. */
export const FORM_SUBMISSIONS_LIST_QUERY: ListQuerySpec = {
  resource: 'formSubmissions',
  filters: [],
  sortOptions: sortOptionsFor(SUBMISSION_SORT_FIELDS),
  defaultSort: UPDATED_DESC,
};

/** The version history tab inside the designer. */
export const FORM_VERSIONS_LIST_QUERY: ListQuerySpec = {
  resource: 'formVersions',
  filters: [],
  sortOptions: sortOptionsFor(['versionNo', 'state', 'createdAt', 'updatedAt']),
  defaultSort: 'versionNo:desc',
};

export const SUBMISSIONS_LIST_QUERY: ListQuerySpec = {
  resource: 'submissions',
  filters: [],
  sortOptions: sortOptionsFor(['formName', 'submittedAt', 'createdAt', 'updatedAt']),
  defaultSort: 'updatedAt:desc',
};

export const SOBA_ADMINS_LIST_QUERY: ListQuerySpec = {
  resource: 'sobaAdmins',
  filters: [],
  sortOptions: sortOptionsFor(['displayLabel', 'source', 'syncedAt']),
  defaultSort: 'displayLabel:asc',
};

export const FEATURE_SCOPES_LIST_QUERY: ListQuerySpec = {
  resource: 'featureScopes',
  filters: [],
  sortOptions: sortOptionsFor(['featureCode', 'scopeType', 'status', 'createdAt', 'updatedAt']),
  defaultSort: UPDATED_DESC,
};

export const DOCGEN_AUDITS_LIST_QUERY: ListQuerySpec = {
  resource: 'docgenAudits',
  filters: [],
  sortOptions: sortOptionsFor(['createdAt', 'outcome', 'durationMs']),
  defaultSort: 'createdAt:desc',
};

const KEY_PREFIX = 'soba.listQuery.';
const keyFor = (spec: ListQuerySpec) => `${KEY_PREFIX}${spec.resource}`;

/**
 * Marks a link inside the app, whose destination is "the list as I left it". A bare URL is someone
 * else's link or a bookmark and means the unfiltered list, so the two have to be distinguishable.
 * Stripped from the URL on arrival.
 */
export const NAV_MARKER = 'from';
const NAV_MARKER_VALUE = 'nav';

export const navLink = (href: string) => `${href}?${NAV_MARKER}=${NAV_MARKER_VALUE}`;

export function isNavArrival(search: URLSearchParams): boolean {
  return search.get(NAV_MARKER) === NAV_MARKER_VALUE;
}

/** This list's params as the URL currently carries them. */
export function readUrlParams(spec: ListQuerySpec, search: URLSearchParams): ListQueryParams {
  const params: ListQueryParams = {};
  for (const name of listQueryParams(spec)) {
    const value = search.get(name);
    if (value) params[name] = value;
  }
  return params;
}

export function urlHasListParams(spec: ListQuerySpec, search: URLSearchParams): boolean {
  return listQueryParams(spec).some((name) => search.has(name));
}

export function rememberListQuery(spec: ListQuerySpec, params: ListQueryParams): void {
  writeSessionValue(keyFor(spec), params);
}

/**
 * `null` when this tab has never answered for the list, which is not the same as a remembered
 * empty query: clearing a filter is a choice and must not be overridden by the last one before it.
 */
export function recallListQuery(spec: ListQuerySpec): ListQueryParams | null {
  return readSessionValue<ListQueryParams>(keyFor(spec));
}

export function forgetListQueries(): void {
  removeSessionValues((key) => key.startsWith(KEY_PREFIX));
}
