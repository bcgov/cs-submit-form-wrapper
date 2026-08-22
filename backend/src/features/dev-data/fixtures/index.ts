import { applicationFixture } from './application';
import { contactFixture } from './contact';
import { nestedFixture } from './nested';
import type { DevFormFixture } from './types';

export type { DevFormFixture } from './types';

/** Every fixture the generator can provision, in rotation order. */
export const DEV_FORM_FIXTURES: readonly DevFormFixture[] = [
  contactFixture,
  applicationFixture,
  nestedFixture,
];

/** Used by the paging anchor form, so its rows carry varied data. */
export const PAGING_FIXTURE_CODE = applicationFixture.code;

export const getFixture = (code: string): DevFormFixture => {
  const fixture = DEV_FORM_FIXTURES.find((f) => f.code === code);
  if (!fixture) {
    throw new Error(`No dev data form fixture for code '${code}'`);
  }
  return fixture;
};

/** Cycles through the set, so a workspace holds a mix. */
export const fixtureAt = (index: number): DevFormFixture =>
  DEV_FORM_FIXTURES[index % DEV_FORM_FIXTURES.length];
