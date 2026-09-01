import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import type { useKeycloak as useKeycloakHook } from '@/lib/hooks/useKeycloak';

// Use a mutable keycloakState so tests can set it per-case.
let keycloakState: Partial<ReturnType<typeof useKeycloakHook>> = {
  authenticated: false,
  initializing: true,
};
vi.mock('@/lib/hooks/useKeycloak', () => ({
  useKeycloak: () => keycloakState,
}));

vi.mock('@/app/[lang]/Providers', () => ({
  useDictionary: () => ({
    locale: 'en',
    form: {},
    general: { loading: 'Loading…', loginRequired: 'Login Required' },
  }),
}));

import makeStore from '@/lib/store';
import FormDesigner from '@/src/features/designer/ui/FormDesigner';

let store: ReturnType<typeof makeStore>;

function renderDesigner() {
  return render(
    <Provider store={store}>
      <FormDesigner onUpdateModel={() => {}} initialModel={null} />
    </Provider>,
  );
}

describe('FormDesigner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    store = makeStore();
  });

  it('shows the loading indicator when initializing', () => {
    keycloakState = { authenticated: false, initializing: true };
    renderDesigner();
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('shows login required when not authenticated', () => {
    keycloakState = { authenticated: false, initializing: false };
    renderDesigner();
    expect(screen.getByText('Login Required')).toBeInTheDocument();
  });
});
