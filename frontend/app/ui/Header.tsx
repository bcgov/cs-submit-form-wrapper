'use client';
import { useEffect } from 'react';
import { useKeycloak } from '@/lib/useKeycloak';
import { useDictionary } from '../[lang]/Providers';

function Header() {
  const dict = useDictionary();
  const { authenticated, idTokenParsed, login, init } = useKeycloak();

  useEffect(() => {
    // initialize Keycloak on client mount
    init();
  }, [init]);

  const handleLogin = () => {
    // login is a bound callback that dispatches the login thunk
    login();
  };

  const loginButton = () => {
    if (authenticated) {
      return <>{`${dict.general.loggedAs} ${idTokenParsed?.display_name}`}</>;
    }
    return (
    <button type="button" className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded" onClick={handleLogin}>{dict.general.login}</button>
    )
  }

  return (
    <ul className="flex px-4">
      <li className="mr-6 w-1/2 my-auto">
        <a href={'/'+dict.locale+'/'}>
          <button type="button" className="inline-block text-xl font-bold">{dict.header.list}</button>
        </a>
        <a href={"/"+dict.locale+"/builder"}>
          <button type="button" className="inline-block text-xl font-bold">{dict.header.builder}</button>
        </a>
      </li>
      <li className="mr-6 w-1/4">
        <h1 className="text-2xl font-bold">{dict.general.title}</h1>
      </li>
      <li className="mr-6 w-1/4 my-auto">
        {loginButton()}
      </li>
    </ul>
  );
}

export default Header;
export { Header };