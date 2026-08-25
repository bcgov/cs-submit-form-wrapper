import type { DevFormFixture } from './types';
import {
  checkboxField,
  dateAt,
  dateField,
  formSchema,
  numberField,
  pick,
  radioField,
  selectField,
  submitButton,
  textArea,
  textField,
} from './shared';

const DEPARTMENTS = [
  { label: 'Citizens Services', value: 'citizens-services' },
  { label: 'Environment', value: 'environment' },
  { label: 'Forests', value: 'forests' },
  { label: 'Health', value: 'health' },
];

const PRIORITIES = [
  { label: 'Low', value: 'low' },
  { label: 'Medium', value: 'medium' },
  { label: 'High', value: 'high' },
];

const PROJECTS = [
  'Coastal survey',
  'Permit backlog',
  'Trail maintenance',
  'Records migration',
  'Wildfire readiness',
] as const;

const NOTES = [
  'Submitted for the current intake window.',
  'Follow-up requested from the regional office.',
  'Budget figures are provisional.',
] as const;

const TITLE = 'Program application';

/** Mixed input types, to cover value coercion on submission read-back. */
export const applicationFixture: DevFormFixture = {
  code: 'application',
  schema: formSchema(TITLE, [
    textField('projectName', 'Project name'),
    selectField('department', 'Department', DEPARTMENTS),
    radioField('priority', 'Priority', PRIORITIES),
    dateField('startDate', 'Start date'),
    numberField('budget', 'Budget'),
    checkboxField('agree', 'I confirm the information is accurate'),
    textArea('notes', 'Notes'),
    submitButton(),
  ]),
  answers: (index) => ({
    projectName: `${pick(PROJECTS, index)} ${index + 1}`,
    department: pick(DEPARTMENTS, index).value,
    priority: pick(PRIORITIES, index).value,
    startDate: dateAt(index),
    budget: 5000 + index * 250,
    agree: index % 3 !== 0,
    notes: pick(NOTES, index),
  }),
};
