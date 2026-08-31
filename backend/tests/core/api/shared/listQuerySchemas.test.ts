import { z } from 'zod';
import {
  ListFormsQuerySchema,
  ListFormVersionsQuerySchema,
} from '../../../../src/core/api/forms/schema';
import { ListMembersQuerySchema } from '../../../../src/core/api/members/schema';
import { ListSubmissionsQuerySchema } from '../../../../src/core/api/submissions/schema';
import { ListWorkspacesQuerySchema } from '../../../../src/core/api/workspaces/schema';
import { ListSobaAdminsQuerySchema } from '../../../../src/core/api/admin/schema';

function expectParseFailure<T extends z.ZodTypeAny>(schema: T, input: unknown): void {
  expect(schema.safeParse(input).success).toBe(false);
}

function expectParseSuccess<T extends z.ZodTypeAny>(schema: T, input: unknown): z.infer<T> {
  const result = schema.safeParse(input);
  expect(result.success).toBe(true);
  if (!result.success) throw new Error('expected parse success');
  return result.data;
}

describe('ListMembersQuerySchema', () => {
  it('requires workspaceId', () => {
    expectParseFailure(ListMembersQuerySchema, { limit: 20 });
  });

  it('accepts workspaceId', () => {
    expectParseSuccess(ListMembersQuerySchema, { workspaceId: 'ws-1', limit: 20 });
  });
});

describe('ListFormsQuerySchema', () => {
  it('accepts workspaceId alone', () => {
    const data = expectParseSuccess(ListFormsQuerySchema, { workspaceId: 'ws-1' });
    expect(data.workspaceId).toBe('ws-1');
  });

  it('accepts formId alone', () => {
    const data = expectParseSuccess(ListFormsQuerySchema, { formId: 'form-1' });
    expect(data.formId).toBe('form-1');
  });

  it('accepts workspaceId and formId together', () => {
    expectParseSuccess(ListFormsQuerySchema, { workspaceId: 'ws-1', formId: 'form-1' });
  });
});

describe('ListFormVersionsQuerySchema', () => {
  it('accepts each anchor alone', () => {
    expectParseSuccess(ListFormVersionsQuerySchema, { workspaceId: 'ws-1' });
    expectParseSuccess(ListFormVersionsQuerySchema, { formId: 'form-1' });
    expectParseSuccess(ListFormVersionsQuerySchema, { formVersionId: 'fv-1' });
  });

  it('accepts multiple anchors together', () => {
    expectParseSuccess(ListFormVersionsQuerySchema, {
      workspaceId: 'ws-1',
      formId: 'form-1',
      formVersionId: 'fv-1',
    });
  });
});

describe('ListSubmissionsQuerySchema', () => {
  it('rejects no scope anchor', () => {
    expectParseFailure(ListSubmissionsQuerySchema, {});
    expectParseFailure(ListSubmissionsQuerySchema, { limit: 20, workflowState: 'draft' });
  });

  it('accepts each anchor alone', () => {
    expectParseSuccess(ListSubmissionsQuerySchema, { workspaceId: 'ws-1' });
    expectParseSuccess(ListSubmissionsQuerySchema, { formId: 'form-1' });
    expectParseSuccess(ListSubmissionsQuerySchema, { formVersionId: 'fv-1' });
    expectParseSuccess(ListSubmissionsQuerySchema, { submissionId: 'sub-1' });
  });

  it('accepts multiple resource id filters together', () => {
    expectParseSuccess(ListSubmissionsQuerySchema, {
      workspaceId: 'ws-1',
      formId: 'form-1',
      formVersionId: 'fv-1',
      submissionId: 'sub-1',
    });
  });

  it('takes workflow state as a filter and refuses it as a sort', () => {
    const data = expectParseSuccess(ListSubmissionsQuerySchema, {
      formId: 'form-1',
      workflowState: 'submitted',
    });
    expect(data.workflowState).toBe('submitted');
    expectParseFailure(ListSubmissionsQuerySchema, {
      formId: 'form-1',
      sort: 'workflowState:asc',
    });
  });
});

// Every list pages the same way, so the same query mistakes have to fail on all of them.
describe.each([
  ['forms', ListFormsQuerySchema, { workspaceId: 'ws-1' }, 'createdAt:desc', 'name:asc', true],
  [
    'form versions',
    ListFormVersionsQuerySchema,
    { formId: 'form-1' },
    'versionNo:desc',
    'state:asc',
    false,
  ],
  [
    'submissions',
    ListSubmissionsQuerySchema,
    { formId: 'form-1' },
    'updatedAt:desc',
    'formName:asc',
    true,
  ],
  ['workspaces', ListWorkspacesQuerySchema, {}, 'name:asc', 'kind:desc', true],
  [
    'members',
    ListMembersQuerySchema,
    { workspaceId: 'ws-1' },
    'displayLabel:asc',
    'role:desc',
    true,
  ],
  ['platform admins', ListSobaAdminsQuerySchema, {}, 'displayLabel:asc', 'source:asc', true],
])('%s list paging', (_name, schema, anchor, defaultSort, otherSort, hasSearch) => {
  it('defaults to the first page and the declared default sort', () => {
    const data = expectParseSuccess(schema, anchor);
    expect(data.offset).toBe(0);
    expect(data.limit).toBe(20);
    expect(data.sort).toBe(defaultSort);
  });

  it('coerces offset and limit from the query string', () => {
    const data = expectParseSuccess(schema, { ...anchor, offset: '50', limit: '25' });
    expect(data.offset).toBe(50);
    expect(data.limit).toBe(25);
  });

  it('accepts another declared sort', () => {
    expect(expectParseSuccess(schema, { ...anchor, sort: otherSort }).sort).toBe(otherSort);
  });

  it('rejects a sort the list does not declare', () => {
    expectParseFailure(schema, { ...anchor, sort: 'nothing:asc' });
  });

  it('rejects a negative offset and a limit past the cap', () => {
    expectParseFailure(schema, { ...anchor, offset: -1 });
    expectParseFailure(schema, { ...anchor, limit: 101 });
  });

  // Answering a cursor request with page one looks like success and restarts a caller's paging loop.
  it('rejects a leftover cursor', () => {
    expectParseFailure(schema, { ...anchor, cursor: 'eyJtIjoiaWQifQ' });
    expectParseFailure(schema, { ...anchor, cursor: '' });
  });

  // Form versions declares no search, so only the lists that do are asserted here. The term is
  // trimmed, so a whitespace-only one is not a search and the client must not send it.
  if (hasSearch) {
    it('rejects a whitespace-only search term', () => {
      expectParseFailure(schema, { ...anchor, q: '   ' });
    });
  }
});
