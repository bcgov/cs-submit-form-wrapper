import { useEffect, useState } from 'react';
import { FormBuilder, FormioProvider } from '@formio/react';
import './App.css';
import './index.css';
import Keycloak, { type KeycloakTokenParsed } from 'keycloak-js';

function App() {
  const [token, setToken] = useState('');
  const [parsedToken, setParsedToken] = useState<KeycloakTokenParsed>({});
  const setIsDark = (isDark: boolean) => {
    if (isDark) {
      document.documentElement.setAttribute('data-bs-theme', 'dark');
    } else {
      document.documentElement.setAttribute('data-bs-theme', 'light');
    }
  };
  const loginButton = () => {
    if (token !== '') {
      return <div>Logged in as {parsedToken.display_name}</div>;
    }
    return (
      <button
        onClick={() => {
          keycloak.login();
        }}
      >
        Login
      </button>
    );
  };

  const keycloak = new Keycloak({
    url: import.meta.env.VITE_KEYCLOAK_URL,
    realm: import.meta.env.VITE_KEYCLOAK_REALM,
    clientId: import.meta.env.VITE_KEYCLOAK_CLIENT_ID,
  });

  const formioUrl = import.meta.env.VITE_FORMIO_BASE_URL;

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');

    setIsDark(mq.matches);

    // This callback will fire if the perferred color scheme changes without a reload
    mq.addEventListener('change', (evt) => setIsDark(evt.matches));

    keycloak
      .init({
        onLoad: 'check-sso',
        silentCheckSsoRedirectUri: `${location.origin}/silent-check-sso.html`,
      })
      .then((authenticated) => {
        if (authenticated) {
          console.log('User is authenticated', authenticated, keycloak);
          if (keycloak.token) {
            setToken(keycloak.token);
          }
          if (keycloak.tokenParsed) {
            setParsedToken(keycloak.tokenParsed);
          }
        } else {
          setToken('');
        }
        return true;
      })
      .catch((error) => {
        setToken('');
      });
  }, []);

  return (
    <>
      <div>{loginButton()}</div>
      <div>
        <h1>SOBA</h1>
        <FormioProvider baseUrl={formioUrl}>
          <FormBuilder />
        </FormioProvider>
      </div>
    </>
  );
}

export default App;
