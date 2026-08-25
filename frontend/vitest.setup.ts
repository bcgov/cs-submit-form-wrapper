import '@testing-library/jest-dom';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// The design-system renders styled-jsx `<style jsx global>` nodes; React (no
// styled-jsx transform under jsdom) warns "Received `true` for a non-boolean
// attribute `jsx`/`global`". Library noise — filter just those.
const originalConsoleError = console.error;
console.error = (...args: unknown[]) => {
  const text = args.map((a) => (typeof a === 'string' ? a : String(a))).join(' ');
  if (text.includes('non-boolean attribute') && (text.includes('jsx') || text.includes('global'))) {
    return;
  }
  originalConsoleError(...args);
};

// jsdom (24) writes "Could not parse CSS stylesheet" for the design-system's
// modern injected CSS straight to the process stderr stream (below console.error
// and vitest's onConsoleLog), so filter it at the stream level. Harmless noise.
const originalStderrWrite = process.stderr.write.bind(process.stderr);
process.stderr.write = function (chunk: unknown, ...rest: unknown[]): boolean {
  if (typeof chunk === 'string' && chunk.includes('Could not parse CSS stylesheet')) {
    return true;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (originalStderrWrite as any)(chunk, ...rest);
} as typeof process.stderr.write;

// jsdom ships no ResizeObserver. Nothing under test depends on it firing, only on constructing, so
// the callback is never invoked - a test that needs resize behaviour will need a real fake.
const ignoreResize = () => undefined;
if (!('ResizeObserver' in globalThis)) {
  globalThis.ResizeObserver = class {
    observe = ignoreResize;
    unobserve = ignoreResize;
    disconnect = ignoreResize;
  } as unknown as typeof ResizeObserver;
}

// Automatically clean up after each test
afterEach(() => {
  cleanup();
});
