import type { DevFormFixture } from './types';
import {
  dataGrid,
  emailFor,
  emailField,
  formSchema,
  panel,
  pick,
  selectField,
  submitButton,
  textField,
  twoColumns,
} from './shared';

const REGIONS = [
  { label: 'Vancouver Island', value: 'vancouver-island' },
  { label: 'Lower Mainland', value: 'lower-mainland' },
  { label: 'Interior', value: 'interior' },
  { label: 'North', value: 'north' },
];

const ORGS = [
  'Harbour Works Ltd.',
  'Cedar Valley Co-op',
  'Northern Supply Co.',
  'Inlet Consulting',
] as const;

const CONTACT_NAMES = ['Rae Okonjo', 'Sam Delacroix', 'Jo Whitecalf', 'Kit Ferreira'] as const;

const TITLE = 'Organization registration';

/** Nested containers: panel, columns, and a data grid. */
export const nestedFixture: DevFormFixture = {
  code: 'nested',
  schema: formSchema(TITLE, [
    panel('applicantPanel', 'Applicant', [
      twoColumns(
        'applicantColumns',
        [textField('legalName', 'Legal name')],
        [selectField('region', 'Region', REGIONS)],
      ),
    ]),
    dataGrid('contacts', 'Contacts', [
      textField('contactName', 'Name'),
      emailField('contactEmail', 'Email'),
    ]),
    submitButton(),
  ]),
  answers: (index) => ({
    legalName: pick(ORGS, index),
    region: pick(REGIONS, index).value,
    // Row count varies with the index, so grids of different sizes exist.
    contacts: buildContactRows(index),
  }),
};

function buildContactRows(index: number): Array<Record<string, string>> {
  const rowCount = 1 + (index % 3);
  return Array.from({ length: rowCount }, (_unused, row) => {
    const contactName = pick(CONTACT_NAMES, index + row);
    return { contactName, contactEmail: emailFor(contactName, index + row) };
  });
}
