'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import {
  isNavArrival,
  listQueryParams,
  NAV_MARKER,
  readUrlParams,
  recallListQuery,
  rememberListQuery,
  urlHasListParams,
  type ListQueryParams,
  type ListQuerySpec,
} from './listQueryMemory';

export const PAGE_SIZE_OPTIONS = [5, 10, 25, 50];
export const DEFAULT_PAGE_SIZE = 10;
/** Mirrors the API's offset cap. A page past it is rejected, which would leave the table in error. */
const MAX_LIST_OFFSET = 100_000;

export interface ListQueryControls {
  /** The list's own filters, as the URL carries them. */
  filters: ListQueryParams;
  q: string;
  sort: string;
  page: number;
  pageSize: number;
  offset: number;
  /** Search box value. Typing alone changes nothing; it reaches `q` on submit. */
  searchInput: string;
  setSearchInput: (value: string) => void;
  /** Search for whatever the box currently holds. */
  commitSearch: () => void;
  setFilters: (next: ListQueryParams) => void;
  /** Drop the filters and the search term together, keeping sort and page size. */
  clear: () => void;
  setSort: (token: string) => void;
  setPage: (page: number) => void;
  setPageSize: (size: number) => void;
}

const toPage = (raw: string | undefined, pageSize: number): number => {
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1) return 1;
  return Math.min(parsed, Math.floor(MAX_LIST_OFFSET / pageSize) + 1);
};

/**
 * A stale remembered or hand-edited size would be rejected by the API and leave the table empty,
 * so anything outside the offered options falls back to the default.
 */
const toPageSize = (raw: string | undefined, options: number[]): number => {
  const parsed = Number(raw);
  if (options.includes(parsed)) return parsed;
  return options.includes(DEFAULT_PAGE_SIZE) ? DEFAULT_PAGE_SIZE : options[0];
};

/**
 * Search, sort, filters and paging for a server-resolved list, carried in the URL and remembered
 * per tab. Everything the request needs comes back resolved, so a screen never holds list state of
 * its own.
 */
export function useListQuery(
  spec: ListQuerySpec,
  pageSizeOptions: number[] = PAGE_SIZE_OPTIONS,
): ListQueryControls {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Only a link from inside the app asks for the list as the user left it. A bare URL is a bookmark
  // or someone else's link, and means the unfiltered list. Read during render, not from an effect:
  // an effect would let the first request go out unscoped and land the wrong rows first.
  // Not keyed on mount, because clicking the nav link while already on this page does not remount.
  const arrivalQuery = useMemo(
    () =>
      isNavArrival(searchParams) && !urlHasListParams(spec, searchParams)
        ? recallListQuery(spec)
        : null,
    [spec, searchParams],
  );

  // The URL wins as soon as it says anything, so a cleared filter stays cleared rather than reading
  // as "nothing set, restore again".
  const current = useMemo<ListQueryParams>(
    () =>
      urlHasListParams(spec, searchParams)
        ? readUrlParams(spec, searchParams)
        : (arrivalQuery ?? {}),
    [spec, searchParams, arrivalQuery],
  );

  const filters = useMemo(() => {
    const own: ListQueryParams = {};
    for (const name of spec.filters) {
      if (current[name]) own[name] = current[name];
    }
    return own;
  }, [spec, current]);

  const q = current.q ?? '';
  const sort = spec.sortOptions.includes(current.sort) ? current.sort : spec.defaultSort;
  const pageSize = toPageSize(current.pageSize, pageSizeOptions);
  const page = toPage(current.page, pageSize);

  // What the URL should say, defaults omitted. Written from here rather than from `current`, so a
  // value that was rejected on the way in is not written back on the next change.
  const resolved = useMemo<ListQueryParams>(
    () => ({
      ...filters,
      ...(q ? { q } : {}),
      ...(sort === spec.defaultSort ? {} : { sort }),
      ...(page > 1 ? { page: String(page) } : {}),
      ...(pageSize === DEFAULT_PAGE_SIZE ? {} : { pageSize: String(pageSize) }),
    }),
    [filters, q, sort, page, pageSize, spec.defaultSort],
  );

  const write = useCallback(
    (next: ListQueryParams) => {
      const params = new URLSearchParams(searchParams.toString());
      // Consumed on arrival; leaving it in would make a copied URL restore the reader's own view.
      params.delete(NAV_MARKER);
      const set: ListQueryParams = {};
      for (const name of listQueryParams(spec)) {
        if (next[name]) {
          params.set(name, next[name]);
          set[name] = next[name];
        } else {
          params.delete(name);
        }
      }
      const qs = params.toString();
      // Next keeps useSearchParams in sync with replaceState. A router navigation would re-run the
      // page's server component for what is only a client-side query change.
      window.history.replaceState(null, '', qs ? `${pathname}?${qs}` : pathname);
      // Recorded from the choice, not from the URL: reading it back would race the replaceState
      // above and record the pre-change query.
      rememberListQuery(spec, set);
    },
    [spec, searchParams, pathname],
  );

  // A different scope means a different set of rows, so the page number no longer refers to
  // anything the user chose.
  const apply = useCallback(
    (changes: ListQueryParams) => write({ ...resolved, page: '', ...changes }),
    [write, resolved],
  );

  // Each distinct URL is handled once. Re-running on an in-page change would undo a filter the user
  // just cleared, because a cleared filter and a fresh arrival both look like a URL with no params.
  const handledSearch = useRef<string | null>(null);
  useEffect(() => {
    const search = searchParams.toString();
    if (handledSearch.current === search) return;
    const firstArrival = handledSearch.current === null;
    handledSearch.current = search;

    // Writing drops the nav marker, so it never survives into a URL the user might copy.
    if (arrivalQuery) {
      write(arrivalQuery);
      return;
    }
    if (isNavArrival(searchParams)) {
      write(readUrlParams(spec, searchParams));
      return;
    }
    // A link that names a query is a choice, wherever it came from. A bare one is a visit, and must
    // not erase the view the user set for this tab. Later in-page changes record themselves.
    if (firstArrival && urlHasListParams(spec, searchParams)) {
      rememberListQuery(spec, resolved);
    }
  }, [spec, arrivalQuery, searchParams, write, resolved]);

  const [searchInput, setSearchInput] = useState(q);
  const committedSearch = useRef(q);

  // The URL changed the search out from under the box (back button, a link, a cleared filter).
  useEffect(() => {
    if (q !== committedSearch.current) {
      committedSearch.current = q;
      setSearchInput(q);
    }
  }, [q]);

  const commitSearch = useCallback(() => {
    if (searchInput === committedSearch.current) return;
    committedSearch.current = searchInput;
    apply({ q: searchInput.trim() });
  }, [searchInput, apply]);

  return {
    filters,
    q,
    sort,
    page,
    pageSize,
    offset: (page - 1) * pageSize,
    searchInput,
    setSearchInput,
    commitSearch,
    setFilters: useCallback(
      (next: ListQueryParams) => {
        const cleared: ListQueryParams = {};
        for (const name of spec.filters) cleared[name] = '';
        apply({ ...cleared, ...next });
      },
      [spec, apply],
    ),
    clear: useCallback(() => {
      const cleared: ListQueryParams = { q: '' };
      for (const name of spec.filters) cleared[name] = '';
      committedSearch.current = '';
      setSearchInput('');
      apply(cleared);
    }, [spec, apply]),
    setSort: useCallback((token: string) => apply({ sort: token }), [apply]),
    setPage: useCallback(
      (next: number) => write({ ...resolved, page: next > 1 ? String(next) : '' }),
      [write, resolved],
    ),
    setPageSize: useCallback((size: number) => apply({ pageSize: String(size) }), [apply]),
  };
}
