/**
 * Component builders and value helpers for the fixtures. No widget keys: the schema normalizer
 * strips any widget that is not an object.
 */

type Component = Record<string, unknown>;

interface Choice {
  label: string;
  value: string;
}

export const textField = (key: string, label: string): Component => ({
  type: 'textfield',
  key,
  label,
  input: true,
  tableView: true,
});

export const emailField = (key: string, label: string): Component => ({
  type: 'email',
  key,
  label,
  input: true,
  tableView: true,
});

export const phoneField = (key: string, label: string): Component => ({
  type: 'phoneNumber',
  key,
  label,
  input: true,
  tableView: true,
});

export const numberField = (key: string, label: string): Component => ({
  type: 'number',
  key,
  label,
  input: true,
  tableView: true,
});

export const textArea = (key: string, label: string): Component => ({
  type: 'textarea',
  key,
  label,
  input: true,
  rows: 3,
  autoExpand: false,
  tableView: true,
});

export const checkboxField = (key: string, label: string): Component => ({
  type: 'checkbox',
  key,
  label,
  input: true,
  defaultValue: false,
  tableView: false,
});

export const dateField = (key: string, label: string): Component => ({
  type: 'datetime',
  key,
  label,
  input: true,
  format: 'yyyy-MM-dd',
  enableTime: false,
  tableView: false,
});

export const selectField = (key: string, label: string, choices: Choice[]): Component => ({
  type: 'select',
  key,
  label,
  input: true,
  dataSrc: 'values',
  data: { values: choices },
  tableView: true,
});

export const radioField = (key: string, label: string, choices: Choice[]): Component => ({
  type: 'radio',
  key,
  label,
  input: true,
  values: choices,
  tableView: true,
});

export const panel = (key: string, title: string, components: Component[]): Component => ({
  type: 'panel',
  key,
  title,
  label: title,
  input: false,
  collapsible: false,
  components,
});

export const twoColumns = (key: string, left: Component[], right: Component[]): Component => ({
  type: 'columns',
  key,
  input: false,
  tableView: false,
  columns: [
    { width: 6, size: 'md', currentWidth: 6, components: left },
    { width: 6, size: 'md', currentWidth: 6, components: right },
  ],
});

export const dataGrid = (key: string, label: string, components: Component[]): Component => ({
  type: 'datagrid',
  key,
  label,
  input: true,
  reorder: false,
  addAnother: 'Add another',
  tableView: false,
  components,
});

export const submitButton = (): Component => ({
  type: 'button',
  key: 'submit',
  label: 'Submit',
  action: 'submit',
  disableOnInvalid: true,
  input: true,
  tableView: false,
});

/** The definition shape the engine expects. */
export const formSchema = (title: string, components: Component[]): Record<string, unknown> => ({
  display: 'form',
  type: 'form',
  title,
  components,
});

/** Same index, same value. */
export const pick = <T>(pool: readonly T[], index: number): T => pool[index % pool.length];

/** Fixed, so generated dates do not depend on when the generator ran. */
const BASE_DATE_MS = Date.UTC(2026, 0, 5);
const DAY_MS = 86_400_000;

/** ISO timestamp index days after the base date. */
export const dateAt = (index: number): string =>
  new Date(BASE_DATE_MS + index * DAY_MS).toISOString();

/** Obviously fake email built from a name and index. */
export const emailFor = (name: string, index: number): string =>
  `${name.toLowerCase().replace(/[^a-z]/g, '')}${index}@example.test`;
