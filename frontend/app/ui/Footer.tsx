'use client';

import { Footer as BCFooter } from '@bcgov/design-system-react-components';

/**
 * BC Gov footer.
 *
 * The BC Design System ships a fully-styled, accessible BC Gov footer
 * (logo, link list, land acknowledgement, copyright), so we use it directly
 * instead of maintaining our own markup + CSS module.
 *
 * It is re-exported from this Client Component because the design system is
 * built on React Aria; importing it straight into the (Server Component) layout
 * would pull React Aria into the server module graph and break the build.
 * The `<Footer>` prop API (`hideAcknowledgement`, `contact`, `links`, …) is
 * unchanged, so existing usage continues to work.
 */

const Footer = (props: React.ComponentProps<typeof BCFooter>) => {
  const defaultCopyrightText = `© ${new Date().getUTCFullYear()} Government of British Columbia.`;
  
  const customCopyright = (
    <>
      {props.copyright || defaultCopyrightText}
      <span style={{ float: 'right' }}>Version {process.env.NEXT_PUBLIC_APP_VERSION || 'dev'}</span>
    </>
  ) as unknown as string;

  return <BCFooter {...props} copyright={customCopyright} />;
};

export { Footer };
