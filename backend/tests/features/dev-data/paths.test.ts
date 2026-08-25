import { resolve } from 'node:path';
import { resolveProjectPath } from '../../../src/features/dev-data/paths';
import { ValidationError } from '../../../src/core/errors';

describe('paths taken from the command line', () => {
  it('resolves a relative path against the working directory', () => {
    expect(resolveProjectPath('.devdata-owner')).toBe(resolve(process.cwd(), '.devdata-owner'));
    expect(resolveProjectPath('tmp/manifest.json')).toBe(
      resolve(process.cwd(), 'tmp/manifest.json'),
    );
  });

  it.each(['../outside.json', '../../etc/passwd', 'a/../../outside.json', '/etc/passwd', '/tmp/x'])(
    'refuses %s',
    (input) => {
      expect(() => resolveProjectPath(input)).toThrow(ValidationError);
    },
  );

  it('accepts an absolute path that is already inside the project', () => {
    const inside = resolve(process.cwd(), 'manifest.json');
    expect(resolveProjectPath(inside)).toBe(inside);
  });
});
