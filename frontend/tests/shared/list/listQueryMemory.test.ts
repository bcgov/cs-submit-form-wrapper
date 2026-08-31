import { describe, it, expect, beforeEach } from 'vitest';
import {
  FORMS_LIST_QUERY,
  forgetListQueries,
  readUrlParams,
  recallListQuery,
  rememberListQuery,
  urlHasListParams,
} from '@/src/shared/list/listQueryMemory';

describe('listQueryMemory', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('reads only the params the list owns', () => {
    const search = new URLSearchParams('workspace=ws1&unrelated=x');
    expect(readUrlParams(FORMS_LIST_QUERY, search)).toEqual({ workspace: 'ws1' });
    expect(urlHasListParams(FORMS_LIST_QUERY, search)).toBe(true);
    expect(urlHasListParams(FORMS_LIST_QUERY, new URLSearchParams('unrelated=x'))).toBe(false);
  });

  // Paging travels with the filters, so a restored view comes back on the page it was left on.
  it('owns the paging params as well as its own filters', () => {
    const search = new URLSearchParams('workspace=ws1&q=pay&sort=name:asc&page=3&pageSize=25');
    expect(readUrlParams(FORMS_LIST_QUERY, search)).toEqual({
      workspace: 'ws1',
      q: 'pay',
      sort: 'name:asc',
      page: '3',
      pageSize: '25',
    });
    expect(urlHasListParams(FORMS_LIST_QUERY, new URLSearchParams('page=2'))).toBe(true);
  });

  it('declares both directions of every sort field, including its default', () => {
    expect(FORMS_LIST_QUERY.sortOptions).toContain('name:asc');
    expect(FORMS_LIST_QUERY.sortOptions).toContain('name:desc');
    expect(FORMS_LIST_QUERY.sortOptions).toContain(FORMS_LIST_QUERY.defaultSort);
  });

  it('round-trips a remembered query', () => {
    rememberListQuery(FORMS_LIST_QUERY, { workspace: 'ws1' });
    expect(recallListQuery(FORMS_LIST_QUERY)).toEqual({ workspace: 'ws1' });
  });

  // Clearing a filter is a choice. Storing nothing would let the previous filter come back.
  it('remembers a cleared query as an answer, not as absence', () => {
    rememberListQuery(FORMS_LIST_QUERY, { workspace: 'ws1' });
    rememberListQuery(FORMS_LIST_QUERY, {});
    expect(recallListQuery(FORMS_LIST_QUERY)).toEqual({});
  });

  it('has no answer before anything is remembered', () => {
    expect(recallListQuery(FORMS_LIST_QUERY)).toBeNull();
  });

  it('forgets every list on sign-out but leaves other keys alone', () => {
    rememberListQuery(FORMS_LIST_QUERY, { workspace: 'ws1' });
    sessionStorage.setItem('soba.workspaceModalDismissed', 'true');
    forgetListQueries();
    expect(recallListQuery(FORMS_LIST_QUERY)).toBeNull();
    expect(sessionStorage.getItem('soba.workspaceModalDismissed')).toBe('true');
  });

  it('survives a corrupt stored value', () => {
    sessionStorage.setItem('soba.listQuery.forms', 'not json');
    expect(recallListQuery(FORMS_LIST_QUERY)).toBeNull();
  });
});
