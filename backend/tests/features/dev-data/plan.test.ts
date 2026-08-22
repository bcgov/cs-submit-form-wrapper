import {
  buildPlan,
  DEV_PREFIX,
  DEV_SUBJECT_PREFIX,
  plannedSubmissionState,
  SIZE_NAMES,
  SIZES,
  type PlannedWorkspace,
  type SizeName,
} from '../../../src/features/dev-data/plan';
import { DEV_FORM_FIXTURES } from '../../../src/features/dev-data/fixtures';

describe('dev data plan', () => {
  it('defaults to the large size', () => {
    expect(buildPlan().size).toBe('large');
    expect(buildPlan()).toEqual(buildPlan('large'));
  });

  it('splits the target user roles 12/3/3/3 at the large size', () => {
    const tally = roleTally(buildPlan('large').workspaces);
    expect(tally).toEqual({ owner: 12, admin: 3, member: 3, viewer: 3, none: 3 });
  });

  describe.each(SIZE_NAMES)('%s', (size: SizeName) => {
    const plan = buildPlan(size);
    const max = SIZES[size];
    const allForms = formsOf(plan.workspaces);
    const allSubmissions = submissionsOf(plan.workspaces);
    const anchored = (anchor: string) => anchoredWorkspace(plan.workspaces, anchor);

    it('is deterministic', () => {
      expect(buildPlan(size)).toEqual(buildPlan(size));
    });

    it('scales users and workspaces to the size', () => {
      expect(plan.users).toHaveLength(max);
      expect(plan.workspaces.length).toBeGreaterThan(max);
      expect(plan.workspaces.filter((w) => w.targetUserRole)).toHaveLength(max);
    });

    it('gives the target user every role, and workspaces they are not in', () => {
      const tally = roleTally(plan.workspaces);
      for (const role of ['owner', 'admin', 'member', 'viewer', 'none']) {
        expect(tally[role]).toBeGreaterThan(0);
      }
      // Owner stays the common case at every size.
      expect(tally.owner).toBeGreaterThanOrEqual(tally.admin);
    });

    it('fills each anchor to the size, so its list spans two pages', () => {
      expect(anchored('pagingForms').forms).toHaveLength(max);
      expect(anchored('pagingMembers').members).toHaveLength(max);
      expect(anchored('pagingSubmissions').forms[0].submissions).toHaveLength(max);
    });

    it('gives the target user a group carrying form permissions wherever they are not owner', () => {
      // Form access comes only from group roles, so a workspace role on its own grants nothing.
      for (const workspace of plan.workspaces) {
        if (!workspace.targetUserRole || workspace.ownerUserIndex == null) {
          expect(workspace.targetGroup).toBeNull();
          continue;
        }
        expect(workspace.targetGroup).not.toBeNull();
        expect(workspace.targetGroup!.roleCodes.length).toBeGreaterThan(0);
      }
    });

    it('puts every role the target holds on a workspace that has forms', () => {
      const formsByRole: Record<string, number> = {};
      for (const w of plan.workspaces) {
        const key = w.targetUserRole ?? 'none';
        formsByRole[key] = (formsByRole[key] ?? 0) + w.forms.length;
      }
      for (const role of ['owner', 'admin', 'member', 'viewer']) {
        expect(formsByRole[role]).toBeGreaterThan(0);
      }
    });

    it('gives every workspace at least one dev member, so member lists are never empty', () => {
      for (const workspace of plan.workspaces) {
        expect(workspace.members.length).toBeGreaterThan(0);
      }
    });

    it('never plans an empty group, and plans at least one with two members', () => {
      const groups = plan.workspaces.flatMap((w) => w.groups);
      expect(groups.length).toBeGreaterThan(0);
      for (const group of groups) {
        expect(group.memberUserIndexes.length).toBeGreaterThan(0);
      }
      expect(groups.some((g) => g.memberUserIndexes.length >= 2)).toBe(true);
    });

    it('plans two public workspaces, both holding forms', () => {
      const publics = plan.workspaces.filter((w) => w.audience === 'public');
      expect(publics).toHaveLength(2);
      for (const workspace of publics) {
        expect(workspace.forms.length).toBeGreaterThan(0);
      }
    });

    it('keeps ordinary collections smaller than the anchored ones', () => {
      for (const workspace of plan.workspaces) {
        if (workspace.anchor === 'pagingForms') continue;
        expect(workspace.forms.length).toBeLessThan(max);
      }
    });

    it('never plans a form in a workspace whose disclaimer is not accepted', () => {
      for (const workspace of plan.workspaces) {
        if (!workspace.disclaimerAccepted) expect(workspace.forms).toHaveLength(0);
      }
      expect(plan.workspaces.some((w) => !w.disclaimerAccepted)).toBe(true);
    });

    it('never plans a submission against an unpublished form', () => {
      for (const form of allForms) {
        if (!form.published) expect(form.submissions).toHaveLength(0);
      }
      expect(allForms.some((f) => !f.published)).toBe(true);
    });

    it('only leaves unpublished forms unprovisioned, and does leave some', () => {
      for (const form of allForms) {
        if (form.published) expect(form.provisioned).toBe(true);
      }
      expect(allForms.some((f) => !f.provisioned)).toBe(true);
    });

    it('plans anonymous submissions only where the audience is public', () => {
      const anonymous = allSubmissions.filter((s) => s.submission.submitter.kind === 'anonymous');
      expect(anonymous.length).toBeGreaterThan(0);
      for (const { workspace } of anonymous) {
        expect(workspace.audience).toBe('public');
      }
    });

    it('covers every audience mode and every submission end state', () => {
      expect(new Set(plan.workspaces.map((w) => w.audience))).toEqual(
        new Set(['public', 'protected', 'none']),
      );
      expect(new Set(allSubmissions.map((s) => plannedSubmissionState(s.submission)))).toEqual(
        new Set(['opened', 'draft', 'submitted']),
      );
    });

    it('uses every form fixture', () => {
      expect(new Set(allForms.map((f) => f.fixtureCode))).toEqual(
        new Set(DEV_FORM_FIXTURES.map((f) => f.code)),
      );
    });

    it('marks every named row and keeps names unique where the schema demands it', () => {
      const names = plan.workspaces.map((w) => w.name);
      expect(names.every((n) => n.startsWith(DEV_PREFIX))).toBe(true);
      expect(new Set(names).size).toBe(names.length);

      for (const workspace of plan.workspaces) {
        const formNames = workspace.forms.map((f) => f.name);
        expect(formNames.every((n) => n.startsWith(DEV_PREFIX))).toBe(true);
        expect(new Set(formNames).size).toBe(formNames.length);

        const groupNames = workspace.groups.map((g) => g.name);
        expect(new Set(groupNames).size).toBe(groupNames.length);
      }
    });

    it('never lists the owning dev user as a member as well', () => {
      for (const workspace of plan.workspaces) {
        const memberIndexes = workspace.members.map((m) => m.userIndex);
        expect(new Set(memberIndexes).size).toBe(memberIndexes.length);
        if (workspace.ownerUserIndex != null) {
          expect(memberIndexes).not.toContain(workspace.ownerUserIndex);
        }
      }
    });

    it('only owns workspaces with dev users that exist', () => {
      for (const workspace of plan.workspaces) {
        if (workspace.ownerUserIndex == null) continue;
        expect(workspace.ownerUserIndex).toBeGreaterThanOrEqual(0);
        expect(workspace.ownerUserIndex).toBeLessThan(plan.users.length);
      }
    });

    it("puts only workspace members into that workspace's groups", () => {
      for (const workspace of plan.workspaces) {
        const memberIndexes = new Set(workspace.members.map((m) => m.userIndex));
        for (const userIndex of workspace.groups.flatMap((g) => g.memberUserIndexes)) {
          expect(memberIndexes.has(userIndex)).toBe(true);
        }
      }
    });

    it('never attributes a submission to the target where they are not a member', () => {
      for (const { workspace, submission } of allSubmissions) {
        if (submission.submitter.kind !== 'target') continue;
        expect(workspace.targetUserRole).not.toBeNull();
      }
    });

    it('attributes dev-user submissions only to members of the owning workspace', () => {
      for (const { workspace, submission } of allSubmissions) {
        if (submission.submitter.kind !== 'devUser') continue;
        expect(workspace.members.map((m) => m.userIndex)).toContain(submission.submitter.userIndex);
      }
    });

    it('gives every dev user a marked label, a namespaced subject, and a login provider', () => {
      const subjects = plan.users.map((u) => u.subject);
      expect(new Set(subjects).size).toBe(subjects.length);
      for (const user of plan.users) {
        expect(user.displayLabel.startsWith(DEV_PREFIX)).toBe(true);
        expect(user.subject.startsWith(DEV_SUBJECT_PREFIX)).toBe(true);
        expect(['azureidir', 'bceidbusiness']).toContain(user.identityProviderCode);
      }
      expect(new Set(plan.users.map((u) => u.identityProviderCode)).size).toBe(2);
    });
  });
});

// Function declarations, not const arrows: describe.each runs its body at collection time.
function formsOf(workspaces: PlannedWorkspace[]) {
  return workspaces.flatMap((w) => w.forms);
}

function submissionsOf(workspaces: PlannedWorkspace[]) {
  return workspaces.flatMap((w) =>
    w.forms.flatMap((f) => submissionsWithWorkspace(w, f.submissions)),
  );
}

function submissionsWithWorkspace(
  workspace: PlannedWorkspace,
  submissions: PlannedWorkspace['forms'][number]['submissions'],
) {
  return submissions.map((submission) => ({ workspace, submission }));
}

function anchoredWorkspace(workspaces: PlannedWorkspace[], anchor: string): PlannedWorkspace {
  const found = workspaces.filter((w) => w.anchor === anchor);
  expect(found).toHaveLength(1);
  return found[0];
}

function roleTally(workspaces: PlannedWorkspace[]): Record<string, number> {
  return workspaces.reduce<Record<string, number>>((acc, w) => {
    const key = w.targetUserRole ?? 'none';
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
}
