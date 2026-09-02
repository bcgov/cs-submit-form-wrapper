import React, { act } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { SWRConfig } from 'swr';

const {
  mockFetchSobaAdmins,
  mockAddSobaAdmin,
  mockRemoveSobaAdmin,
  mockAddNotification,
  mockRefreshCurrentUser,
  DIRECT_ADMIN_ID,
} = vi.hoisted(() => ({
  mockFetchSobaAdmins: vi.fn(),
  mockAddSobaAdmin: vi.fn(),
  mockRemoveSobaAdmin: vi.fn(),
  mockAddNotification: vi.fn(),
  mockRefreshCurrentUser: vi.fn(),
  DIRECT_ADMIN_ID: '11111111-1111-4111-8111-111111111111',
}));

vi.mock('@/lib/hooks/useKeycloak', () => ({
  useKeycloak: () => ({ authenticated: true, token: 'token', initializing: false }),
}));

vi.mock('@/src/shared/api/useCurrentUser', () => ({
  useCurrentUser: () => ({ data: { actor: { id: DIRECT_ADMIN_ID } } }),
  useRefreshCurrentUser: () => mockRefreshCurrentUser,
}));

vi.mock('@/lib/hooks/useNotificationStore', () => ({
  useNotificationStore: () => ({ addNotification: mockAddNotification }),
}));

vi.mock('@/src/shared/api/sobaApiAdmin', () => ({
  fetchSobaAdmins: (...args: unknown[]) => mockFetchSobaAdmins(...args),
  addSobaAdmin: (...args: unknown[]) => mockAddSobaAdmin(...args),
  removeSobaAdmin: (...args: unknown[]) => mockRemoveSobaAdmin(...args),
}));

vi.mock('@/app/[lang]/Providers', () => ({
  useDictionary: () => ({
    locale: 'en',
    general: { loading: 'Loading…', cancel: 'Cancel', search: 'Search' },
    dataTable: { itemName: 'items', pageOf: 'of {totalPages} page(s)' },
    modal: { dialogActions: 'Dialog actions' },
    admin: {
      truncated: 'Showing the first {limit}. Narrow the filters to see the rest.',
      admins: {
        removeConfirmTitle: 'Remove platform administrator',
        removeConfirmMessage: '{user} loses platform administration access immediately.',
        heading: 'Platform administrators',
        intro: 'Users listed here can administer the whole platform.',
        userIdLabel: 'User ID',
        add: 'Add',
        remove: 'Remove',
        idpManaged: 'Managed by identity provider',
        unknownUser: 'Unknown user',
        empty: 'No platform administrators found.',
        loadError: 'Failed to load platform administrators.',
        addSuccess: 'Platform administrator added.',
        addError: 'Failed to add platform administrator.',
        removeSuccess: 'Platform administrator removed.',
        removeError: 'Failed to remove platform administrator.',
        columns: {
          user: 'User',
          source: 'Source',
          identityProvider: 'Identity provider',
          actions: 'Actions',
        },
      },
    },
  }),
}));

import makeStore from '@/lib/store';
import { setAuthenticated, setToken } from '@/lib/slices/keycloakSlice';
import { SobaAdminsPanel } from '@/src/features/admin/ui/SobaAdminsPanel';

vi.mock('next/navigation', async () => {
  const actual = await vi.importActual<unknown>('next/navigation');
  return {
    ...(actual as Record<string, unknown>),
    useRouter: () => ({ push: vi.fn() }),
    usePathname: () => '/en/admin',
    useSearchParams: () => new URLSearchParams(''),
  };
});

let store: ReturnType<typeof makeStore>;

function renderPanel() {
  return render(
    <Provider store={store}>
      <SWRConfig
        value={{ provider: () => new Map(), dedupingInterval: 0, shouldRetryOnError: false }}
      >
        <SobaAdminsPanel />
      </SWRConfig>
    </Provider>,
  );
}

const DIRECT_ADMIN = {
  userId: DIRECT_ADMIN_ID,
  source: 'direct',
  identityProviderCode: null,
  syncedAt: null,
  displayLabel: 'Direct Admin',
};

const IDP_ADMIN = {
  userId: '22222222-2222-4222-8222-222222222222',
  source: 'idp',
  identityProviderCode: 'idir',
  syncedAt: '2026-01-01T00:00:00.000Z',
  displayLabel: 'Idp Admin',
};

describe('SobaAdminsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    store = makeStore();
    store.dispatch(setToken('token'));
    store.dispatch(setAuthenticated(true));
    mockFetchSobaAdmins.mockResolvedValue({
      items: [DIRECT_ADMIN, IDP_ADMIN],
      page: { offset: 0, limit: 10, total: 2 },
    });
  });

  it('lists administrators and only offers removal for direct grants', async () => {
    await act(async () => {
      renderPanel();
    });

    expect(await screen.findByText('Direct Admin')).toBeInTheDocument();
    expect(screen.getByTestId(`remove-admin-${DIRECT_ADMIN.userId}`)).toBeInTheDocument();
    expect(screen.queryByTestId(`remove-admin-${IDP_ADMIN.userId}`)).not.toBeInTheDocument();
    expect(screen.getByText('Managed by identity provider')).toBeInTheDocument();
  });

  // Irreversible, so the row action only opens the prompt.
  it('removes a direct administrator once the prompt is confirmed', async () => {
    mockRemoveSobaAdmin.mockResolvedValue(undefined);

    await act(async () => {
      renderPanel();
    });
    await screen.findByText('Direct Admin');

    await userEvent.click(screen.getByTestId(`remove-admin-${DIRECT_ADMIN.userId}`));
    expect(mockRemoveSobaAdmin).not.toHaveBeenCalled();

    await userEvent.click(await screen.findByTestId('confirm-modal-confirm'));

    await waitFor(() => {
      expect(mockRemoveSobaAdmin).toHaveBeenCalledWith('token', DIRECT_ADMIN.userId);
    });
  });

  // Removing your own grant ends your access to this console, and `/me` is read once per page load,
  // so the console would stay on screen with every control in it refused.
  it('re-reads the caller when they remove their own grant', async () => {
    mockRemoveSobaAdmin.mockResolvedValue(undefined);

    await act(async () => {
      renderPanel();
    });
    await screen.findByText('Direct Admin');

    await userEvent.click(screen.getByTestId(`remove-admin-${DIRECT_ADMIN.userId}`));
    await userEvent.click(await screen.findByTestId('confirm-modal-confirm'));

    await waitFor(() => expect(mockRefreshCurrentUser).toHaveBeenCalled());
  });

  it('pages against the total the server reports', async () => {
    mockFetchSobaAdmins.mockResolvedValue({
      items: [DIRECT_ADMIN],
      page: { offset: 0, limit: 10, total: 42 },
    });

    await act(async () => {
      renderPanel();
    });

    expect(await screen.findByText(/of 5 page\(s\)/)).toBeInTheDocument();
    expect(screen.queryByTestId('admins-truncated')).not.toBeInTheDocument();
  });

  it('adds an administrator and reloads the list', async () => {
    mockAddSobaAdmin.mockResolvedValue(undefined);

    await act(async () => {
      renderPanel();
    });
    await screen.findByText('Direct Admin');

    const input = screen.getByLabelText('User ID');
    await userEvent.type(input, '33333333-3333-4333-8333-333333333333');
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() => {
      expect(mockAddSobaAdmin).toHaveBeenCalledWith(
        'token',
        '33333333-3333-4333-8333-333333333333',
      );
    });
    await waitFor(() => {
      expect(mockFetchSobaAdmins).toHaveBeenCalledTimes(2);
    });
  });

  it('notifies when the list cannot be loaded', async () => {
    mockFetchSobaAdmins.mockRejectedValue(new Error('boom'));

    await act(async () => {
      renderPanel();
    });

    await waitFor(() => {
      expect(mockAddNotification).toHaveBeenCalledWith(
        expect.objectContaining({ text: 'Failed to load platform administrators.', type: 'error' }),
      );
    });
  });
});
