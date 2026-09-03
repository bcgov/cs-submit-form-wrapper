import {
  readSessionValue,
  removeSessionValues,
  writeSessionValue,
} from '@/src/shared/storage/sessionStore';

/**
 * The URL params a list owns. They are remembered and restored as one set, so a list that gains a
 * param only has to declare it here.
 */
export type ListQuerySpec = {
  resource: string;
  params: readonly string[];
};

export type ListQueryParams = Record<string, string>;

export const FORMS_LIST_QUERY: ListQuerySpec = {
  resource: 'forms',
  params: ['workspace'],
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
  for (const name of spec.params) {
    const value = search.get(name);
    if (value) params[name] = value;
  }
  return params;
}

export function urlHasListParams(spec: ListQuerySpec, search: URLSearchParams): boolean {
  return spec.params.some((name) => search.has(name));
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
