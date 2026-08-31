import type { DevFormFixture } from './types';
import {
  emailFor,
  emailField,
  formSchema,
  phoneField,
  pick,
  submitButton,
  textField,
} from './shared';

const FIRST_NAMES = ['Ada', 'Grace', 'Alan', 'Katherine', 'Linus', 'Radia', 'Barbara'] as const;
const LAST_NAMES = [
  'Lovelace',
  'Hopper',
  'Turing',
  'Johnson',
  'Torvalds',
  'Perlman',
  'Liskov',
] as const;

const TITLE = 'Contact request';

/** Four plain inputs. Used for most generated forms. */
export const contactFixture: DevFormFixture = {
  code: 'contact',
  schema: formSchema(TITLE, [
    textField('firstName', 'First name'),
    textField('lastName', 'Last name'),
    emailField('email', 'Email'),
    phoneField('phone', 'Phone'),
    submitButton(),
  ]),
  answers: (index) => {
    const firstName = pick(FIRST_NAMES, index);
    const lastName = pick(LAST_NAMES, index);
    return {
      firstName,
      lastName,
      email: emailFor(`${firstName}.${lastName}`, index),
      phone: `(250) 555-${String(1000 + (index % 9000)).padStart(4, '0')}`,
    };
  },
};
