import { DEV_FORM_FIXTURES, fixtureAt, getFixture } from '../../../src/features/dev-data/fixtures';
import { normalizeSchema } from '../../../src/plugins/formio-v5/normalizeSchema';

type Node = Record<string, unknown>;

const isNode = (v: unknown): v is Node => v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * Data keys at a schema level. Input components contribute their key, layout containers contribute
 * their children's keys, and a data grid contributes only its own: its children are row keys.
 */
function dataKeysOf(components: unknown): string[] {
  if (!Array.isArray(components)) return [];
  return components.filter(isNode).flatMap(keysForComponent);
}

function keysForComponent(component: Node): string[] {
  const key = typeof component.key === 'string' ? component.key : null;
  if (component.input !== true || !key) return childKeysOf(component);
  // A data grid's children are row keys, not form-level ones.
  return component.type === 'datagrid' ? [key] : [key, ...childKeysOf(component)];
}

function childKeysOf(component: Node): string[] {
  const columns = Array.isArray(component.columns) ? component.columns : [];
  return [
    ...dataKeysOf(component.components),
    ...columns.filter(isNode).flatMap((column) => dataKeysOf(column.components)),
  ];
}

/** Find a component by key anywhere in the tree. */
function findComponent(components: unknown, key: string): Node | null {
  if (!Array.isArray(components)) return null;
  for (const component of components) {
    if (!isNode(component)) continue;
    if (component.key === key) return component;
    const nested = findComponent(component.components, key);
    if (nested) return nested;
  }
  return null;
}

const buttonKeys = (components: unknown): string[] => {
  if (!Array.isArray(components)) return [];
  return components
    .filter((c) => isNode(c) && c.type === 'button')
    .map((c) => (c as Node).key as string);
};

describe('dev data form fixtures', () => {
  it.each(DEV_FORM_FIXTURES.map((f) => [f.code, f] as const))(
    '%s: answers cover exactly the schema data keys',
    (_code, fixture) => {
      const components = fixture.schema.components;
      const expected = dataKeysOf(components).filter((k) => !buttonKeys(components).includes(k));

      expect([...new Set(Object.keys(fixture.answers(0)))].sort()).toEqual(
        [...new Set(expected)].sort(),
      );
    },
  );

  it.each(DEV_FORM_FIXTURES.map((f) => [f.code, f] as const))(
    '%s: answers are deterministic for the same index',
    (_code, fixture) => {
      expect(fixture.answers(7)).toEqual(fixture.answers(7));
      expect(fixture.answers(7)).not.toEqual(fixture.answers(8));
    },
  );

  it.each(DEV_FORM_FIXTURES.map((f) => [f.code, f] as const))(
    '%s: schema survives the engine normalizer unchanged',
    (_code, fixture) => {
      // The engine normalizes on import/export; a fixture that changes shape here carries
      // fields the builder would drop.
      expect(normalizeSchema(fixture.schema)).toEqual(fixture.schema);
    },
  );

  it("nested fixture data grid rows use the grid's own child keys", () => {
    const nested = getFixture('nested');
    const grid = findComponent(nested.schema.components, 'contacts');
    const rowKeys = dataKeysOf(grid?.components).sort();
    const rows = nested.answers(1).contacts as Array<Record<string, unknown>>;

    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(Object.keys(row).sort()).toEqual(rowKeys);
    }
  });

  it('cycles through every fixture', () => {
    const codes = DEV_FORM_FIXTURES.map((_f, i) => fixtureAt(i).code);
    expect(new Set(codes).size).toBe(DEV_FORM_FIXTURES.length);
    expect(fixtureAt(DEV_FORM_FIXTURES.length).code).toBe(fixtureAt(0).code);
  });

  it('throws for an unknown fixture code', () => {
    expect(() => getFixture('nope')).toThrow(/nope/);
  });
});
