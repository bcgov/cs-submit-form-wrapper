'use client';
import { Button } from '@bcgov/design-system-react-components';
import { useDictionary } from '../[lang]/Providers';
import { LoginButton } from './LoginButton';

export default function LandingPage() {
  const dict = useDictionary();

  return (
    <div className="ml-5">
      <div className="h2 mt-5">
        {dict.general.welcomeTo} {dict.general.title}
      </div>
      <p className="mt-5">{dict.general.description}</p>
      <div className="h5 mt-5">
        {dict.general.access} {dict.general.title}
      </div>
      <div className="mt-5">
        <LoginButton
          label={dict.general.login}
          data-testid="mainarea-login-button"
          variant="primary"
        />
      </div>
      <div className="h5 mt-5">{dict.general.needHelp}</div>
      <div className="mt-5">
        {dict.general.teamsChannel}:&nbsp;
        <a
          href="https://teams.microsoft.com/dl/launcher/launcher.html?url=%2F_%23%2Fl%2Fchannel%2F19%3A34b9d4b4deb54eebaa9be8bc1ccf02f7%40thread.tacv2%2FCHEFS%2520(Exchange%2520Lab%2520Team)%3FgroupId%3Dbef8086f-20c7-43a4-bd07-29ce764e818c%26tenantId%3D6fdb5200-3d0d-4a8a-b036-d3685e359adc&type=channel&deeplinkId=a6b2ccc9-8051-40b6-b102-32f3ec2d9102&directDl=true&msLaunch=true&enableMobilePage=true&suppressPrompt=true"
          target="_blank"
          rel="noopener noreferrer"
        >
          {dict.general.teamsChannelLink}
        </a>
      </div>
    </div>
  );
}
