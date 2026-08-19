import { z } from 'zod';
import {
  ListFormsQuerySchema,
  ListFormVersionsQuerySchema,
} from '../../../../src/core/api/forms/schema';
import { ListMembersQuerySchema } from '../../../../src/core/api/members/schema';
import { ListSubmissionsQuerySchema } from '../../../../src/core/api/submissions/schema';

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
});
