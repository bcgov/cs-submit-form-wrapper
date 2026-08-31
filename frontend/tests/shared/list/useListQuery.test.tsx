import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

const { search } = vi.hoisted(() => ({ search: { value: '' } }));
vi.mock('next/navigation', async () => {
  const actual = await vi.importActual<unknown>('next/navigation');
  return {
    ...(actual as Record<string, unknown>),
    usePathname: () => '/en/forms',
    useSearchParams: () => new URLSearchParams(search.value),
  };
});

import { FORMS_LIST_QUERY, recallListQuery } from '@/src/shared/list/listQueryMemory';
import { useListQuery } from '@/src/shared/list/useListQuery';

/** The query string the hook last wrote to the URL. */
const writtenQuery = (replaceState: ReturnType<typeof vi.spyOn>) => {
  const url = replaceState.mock.calls.at(-1)?.[2];
  return typeof url === 'string' ? (url.split('?')[1] ?? '') : '';
};

describe('useListQuery', () => {
  beforeEach(() => {
    sessionStorage.clear();
    search.value = '';
    vi.restoreAllMocks();
  });

  it('starts on the first page with the list default sort', () => {
    const { result } = renderHook(() => useListQuery(FORMS_LIST_QUERY));
    expect(result.current).toMatchObject({
      page: 1,
      pageSize: 10,
      offset: 0,
      q: '',
      sort: FORMS_LIST_QUERY.defaultSort,
    });
  });

  it('turns the page and page size in the URL into an offset', () => {
    search.value = 'page=4&pageSize=25';
    const { result } = renderHook(() => useListQuery(FORMS_LIST_QUERY));
    expect(result.current.offset).toBe(75);
    expect(result.current.pageSize).toBe(25);
  });

  // A size the API would reject leaves the table empty with no way back, so it never leaves here.
  it('refuses a page size that is not one of the offered options', () => {
    search.value = 'pageSize=999';
    const { result } = renderHook(() => useListQuery(FORMS_LIST_QUERY));
    expect(result.current.pageSize).toBe(10);
  });

  it('refuses a sort the list does not declare', () => {
    search.value = 'sort=secrets:asc';
    const { result } = renderHook(() => useListQuery(FORMS_LIST_QUERY));
    expect(result.current.sort).toBe(FORMS_LIST_QUERY.defaultSort);
  });

  it('refuses a page number that is not a positive integer', () => {
    search.value = 'page=-2';
    const { result } = renderHook(() => useListQuery(FORMS_LIST_QUERY));
    expect(result.current.page).toBe(1);
  });

  // Page 4 of one sort is not page 4 of another, so a changed query starts again from the top.
  it('drops the page when the sort changes', async () => {
    search.value = 'page=4';
    const replaceState = vi.spyOn(window.history, 'replaceState');
    const { result } = renderHook(() => useListQuery(FORMS_LIST_QUERY));

    act(() => result.current.setSort('name:asc'));

    const written = new URLSearchParams(writtenQuery(replaceState));
    expect(written.get('sort')).toBe('name:asc');
    expect(written.has('page')).toBe(false);
  });

  it('keeps the rest of the query when only the page changes', () => {
    search.value = 'workspace=ws1&sort=name:asc';
    const replaceState = vi.spyOn(window.history, 'replaceState');
    const { result } = renderHook(() => useListQuery(FORMS_LIST_QUERY));

    act(() => result.current.setPage(3));

    const written = new URLSearchParams(writtenQuery(replaceState));
    expect(written.get('page')).toBe('3');
    expect(written.get('workspace')).toBe('ws1');
    expect(written.get('sort')).toBe('name:asc');
  });

  // One request per pause in typing. Keying on every keystroke would be a request per character.
  it('holds the typed term back until typing stops', async () => {
    const replaceState = vi.spyOn(window.history, 'replaceState');
    const { result } = renderHook(() => useListQuery(FORMS_LIST_QUERY));

    act(() => result.current.setSearchInput('pay'));
    expect(result.current.q).toBe('');
    expect(replaceState).not.toHaveBeenCalled();

    await waitFor(() => expect(new URLSearchParams(writtenQuery(replaceState)).get('q')).toBe('pay'));
  });

  // The button exists so the user does not have to wait out the debounce.
  it('commits the typed term immediately when asked', () => {
    const replaceState = vi.spyOn(window.history, 'replaceState');
    const { result } = renderHook(() => useListQuery(FORMS_LIST_QUERY));

    act(() => result.current.setSearchInput('pay'));
    act(() => result.current.commitSearch());

    expect(new URLSearchParams(writtenQuery(replaceState)).get('q')).toBe('pay');
  });

  // The API trims then rejects an empty term, so sending a space would 400 the list.
  it('treats a whitespace-only term as a cleared search', async () => {
    const replaceState = vi.spyOn(window.history, 'replaceState');
    const { result } = renderHook(() => useListQuery(FORMS_LIST_QUERY));

    act(() => result.current.setSearchInput('   '));
    act(() => result.current.commitSearch());

    expect(new URLSearchParams(writtenQuery(replaceState)).has('q')).toBe(false);
  });

  it('trims a term that has content', () => {
    const replaceState = vi.spyOn(window.history, 'replaceState');
    const { result } = renderHook(() => useListQuery(FORMS_LIST_QUERY));

    act(() => result.current.setSearchInput('  pay  '));
    act(() => result.current.commitSearch());

    expect(new URLSearchParams(writtenQuery(replaceState)).get('q')).toBe('pay');
  });

  // The offset the page implies has to stay inside what the API accepts.
  it('holds the page inside the API offset cap', () => {
    search.value = 'page=100000&pageSize=50';
    const { result } = renderHook(() => useListQuery(FORMS_LIST_QUERY));
    expect(result.current.offset).toBeLessThanOrEqual(100_000);
  });

  // Remembering the raw params would restore the rejected value on every later nav arrival.
  it('remembers the validated query, not what the URL claimed', () => {
    search.value = 'workspace=ws1&sort=secrets:asc&pageSize=999';
    renderHook(() => useListQuery(FORMS_LIST_QUERY));

    expect(recallListQuery(FORMS_LIST_QUERY)).toEqual({ workspace: 'ws1' });
  });

  it('remembers only the values it wrote, not the ones it cleared', () => {
    search.value = 'workspace=ws1&page=2';
    const { result } = renderHook(() => useListQuery(FORMS_LIST_QUERY));

    act(() => result.current.setFilters({}));

    expect(recallListQuery(FORMS_LIST_QUERY)).toEqual({});
  });
});
