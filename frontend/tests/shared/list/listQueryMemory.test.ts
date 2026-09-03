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
