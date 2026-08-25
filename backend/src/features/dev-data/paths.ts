import { relative, resolve } from 'node:path';
import { ValidationError } from '../../core/errors';

/**
 * Confines a path taken from the command line to the working directory. The owner file and the
 * manifest are the only files this tool writes, and neither has a reason to reach outside the
 * project.
 */
export function resolveProjectPath(input: string): string {
  const root = process.cwd();
  const full = resolve(root, input);
  const within = relative(root, full);

  if (within.startsWith('..') || !full.startsWith(root)) {
    throw new ValidationError(`'${input}' is outside ${root}; use a path inside the project`);
  }
  return full;
}
