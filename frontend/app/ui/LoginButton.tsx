'use client';

import { Button } from '@bcgov/design-system-react-components';
import { useKeycloak } from '@/lib/hooks/useKeycloak';
import { useDictionary } from '@/app/[lang]/Providers';

interface LoginButtonProps {
  readonly label?: string;
  readonly 'data-testid'?: string;
  readonly variant?: 'link' | 'secondary' | 'primary' | 'tertiary';
}

export function LoginButton({
  label = 'Login',
  'data-testid': testId = 'login-button',
  variant = 'primary',
}: LoginButtonProps) {
  const { login } = useKeycloak();
  const dict = useDictionary();

  return (
    <Button
      id="login-button"
      type="button"
      variant={variant}
      data-testid={testId}
      onPress={() => login()}
    >
      {label === 'Login' ? dict.general.login : label}
    </Button>
  );
}
