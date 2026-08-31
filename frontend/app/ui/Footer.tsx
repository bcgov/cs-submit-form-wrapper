'use client';

import { Footer as BCFooter } from '@bcgov/design-system-react-components';
import { useDictionary } from '../[lang]/Providers';
import styles from './Footer.module.css';

/**
 * BC Gov footer.
 *
 * The BC Design System ships a fully-styled, accessible BC Gov footer
 * (logo, link list, land acknowledgement, copyright), so we use it directly
 * instead of maintaining our own markup + CSS module.
 *
 * It is wrapped in this Client Component because the design system is built on
 * React Aria; importing it straight into the (Server Component) layout would pull
 * React Aria into the server module graph and break the build.
 *
 * `copyright` is intercepted so the app version can sit on the same line. The rest of
 * the prop API (`hideAcknowledgement`, `contact`, `links`, …) is unchanged.
 */

type FooterProps = React.ComponentProps<typeof BCFooter> & {
  /** Semver for display, e.g. `2.0.0-beta.1+abc1234`. Hidden when the version is unknown. */
  version?: string;
};

const Footer = ({ version, ...props }: FooterProps) => {
  const dict = useDictionary();
  const copyright =
    props.copyright ?? `© ${new Date().getUTCFullYear()} Government of British Columbia.`;

  // The space between the spans looks redundant next to the flex gap, but it is what separates
  // the two strings in textContent for screen readers and test assertions.
  const content = (
    <span className={styles.copyright}>
      <span>{copyright}</span>{' '}
      {version ? (
        <span data-testid="app-version">
          {dict.general.version} {version}
        </span>
      ) : null}
    </span>
  );

  // BCDS types `copyright` as a string but renders it as a child node, so an element works at
  // runtime. Cast until the upstream prop widens to ReactNode.
  return <BCFooter {...props} copyright={content as unknown as string} />;
};

export { Footer };
