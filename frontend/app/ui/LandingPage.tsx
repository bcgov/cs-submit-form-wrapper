'use client';
import { useDictionary } from '../[lang]/Providers';
import { LoginButton } from './LoginButton';
import { Heading, Link } from '@bcgov/design-system-react-components';
import { TEAMS_LINK } from '@/src/shared/constants';

export default function LandingPage() {
  const dict = useDictionary();

  return (
    <div className="ml-5">
      <Heading level={2} isUnstyled className="mt-5">
        {dict.general.welcomeTo} {dict.general.titleAsService}
      </Heading>
      <p className="mt-5">{dict.general.description}</p>
      <Heading level={5} isUnstyled className="mt-5">
        {dict.general.access} {dict.general.acronym}
      </Heading>
      <div className="mt-5">
        <LoginButton
          label={dict.general.login}
          data-testid="mainarea-login-button"
          variant="primary"
        />
      </div>
      <Heading level={5} isUnstyled className="mt-5">
        {dict.general.needHelp}
      </Heading>
      <div className="mt-5">
        {dict.general.teamsChannel}:&nbsp;
        <Link href={TEAMS_LINK} target="_blank" rel="noopener noreferrer">
          {dict.general.teamsChannelLink}
        </Link>
      </div>
    </div>
  );
}
