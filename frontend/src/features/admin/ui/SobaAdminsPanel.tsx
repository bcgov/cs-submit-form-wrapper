'use client';

import { useCallback, useMemo, useState } from 'react';
import { Button, Form, InlineAlert, TextField } from '@bcgov/design-system-react-components';
import { ConfirmModal } from '@/src/components/ConfirmModal';
import { DataTable, type Column } from '@/src/components/DataTable';
import { ListPageToolbar } from '@/src/components/ListPageLayout';
import { RowActionButton } from '@/src/components/RowActionButton';
import { SecondaryText } from '@/src/components/SecondaryText';
import { useKeycloak } from '@/lib/hooks/useKeycloak';
import { useDictionary } from '@/app/[lang]/Providers';
import { useNotificationStore } from '@/lib/hooks/useNotificationStore';
import { addSobaAdmin, removeSobaAdmin } from '@/src/shared/api/sobaApiAdmin';
import { useSobaAdmins } from '../useAdminData';
import type { SobaAdminItem } from '@/src/types/admin';
import styles from './AdminPanel.module.css';

/** Admins granted by the IdP are re-synced on every request, so they can't be removed here. */
const SOURCE_IDP = 'idp';

export function SobaAdminsPanel() {
  const dict = useDictionary();
  const dictAdmin = dict.admin;
  const { token } = useKeycloak();
  const { addNotification } = useNotificationStore();

  const [userId, setUserId] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<SobaAdminItem | null>(null);

  const reportLoadError = useCallback(
    (cause: unknown) => {
      addNotification({ text: dictAdmin.admins.loadError, type: 'error', consoleError: cause });
    },
    [addNotification, dictAdmin.admins.loadError],
  );
  const {
    admins,
    truncatedAt,
    isLoading: loading,
    error: loadError,
    refresh: reload,
  } = useSobaAdmins(reportLoadError);
  const error = loadError ? dictAdmin.admins.loadError : null;

  const handleAdd = useCallback(async () => {
    const trimmed = userId.trim();
    if (!token || !trimmed) return;
    setSaving(true);
    try {
      await addSobaAdmin(token, trimmed);
      setUserId('');
      void reload();
      addNotification({ text: dictAdmin.admins.addSuccess, type: 'success' });
    } catch (cause) {
      addNotification({ text: dictAdmin.admins.addError, type: 'error', consoleError: cause });
    } finally {
      setSaving(false);
    }
  }, [
    token,
    userId,
    reload,
    addNotification,
    dictAdmin.admins.addSuccess,
    dictAdmin.admins.addError,
  ]);

  const handleRemove = useCallback(() => {
    const admin = confirmRemove;
    if (!token || !admin) return;
    setSaving(true);
    removeSobaAdmin(token, admin.userId)
      .then(() => {
        void reload();
        addNotification({ text: dictAdmin.admins.removeSuccess, type: 'success' });
      })
      .catch((cause: unknown) => {
        addNotification({
          text: dictAdmin.admins.removeError,
          type: 'error',
          consoleError: cause,
        });
      })
      .finally(() => {
        setSaving(false);
        setConfirmRemove(null);
      });
  }, [
    token,
    confirmRemove,
    reload,
    addNotification,
    dictAdmin.admins.removeSuccess,
    dictAdmin.admins.removeError,
  ]);

  const columns: Column<SobaAdminItem>[] = useMemo(
    () => [
      {
        key: 'displayLabel',
        label: dictAdmin.admins.columns.user,
        width: '40%',
        render: (admin) => (
          <span className="d-inline-flex flex-column">
            <span>{admin.displayLabel ?? dictAdmin.admins.unknownUser}</span>
            <SecondaryText>{admin.userId}</SecondaryText>
          </span>
        ),
      },
      {
        key: 'source',
        label: dictAdmin.admins.columns.source,
        render: (admin) => admin.source,
      },
      {
        key: 'identityProviderCode',
        label: dictAdmin.admins.columns.identityProvider,
        render: (admin) => admin.identityProviderCode ?? '—',
      },
      {
        key: 'actions',
        label: dictAdmin.admins.columns.actions,
        render: (admin) =>
          admin.source === SOURCE_IDP ? (
            <SecondaryText>{dictAdmin.admins.idpManaged}</SecondaryText>
          ) : (
            <RowActionButton
              data-testid={`remove-admin-${admin.userId}`}
              onPress={() => setConfirmRemove(admin)}
            >
              {dictAdmin.admins.remove}
            </RowActionButton>
          ),
      },
    ],
    [dictAdmin.admins],
  );

  return (
    <div className={styles.tabContent}>
      <p className={styles.panelIntro}>{dictAdmin.admins.intro}</p>
      <ListPageToolbar align="end">
        <Form
          className="d-flex align-items-end gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            handleAdd().catch(() => undefined);
          }}
        >
          <TextField
            label={dictAdmin.admins.userIdLabel}
            value={userId}
            onChange={setUserId}
            isDisabled={saving}
            data-testid="admin-user-id"
          />
          <Button
            type="submit"
            variant="primary"
            isDisabled={saving || userId.trim() === ''}
            data-testid="add-admin-button"
          >
            {dictAdmin.admins.add}
          </Button>
        </Form>
      </ListPageToolbar>

      {truncatedAt !== null ? (
        <InlineAlert
          description={dictAdmin.truncated.replace('{limit}', String(truncatedAt))}
          title={dictAdmin.admins.heading}
          variant="info"
          data-testid="admins-truncated"
        />
      ) : null}

      <DataTable<SobaAdminItem>
        data={admins}
        columns={columns}
        loading={loading}
        error={error}
        emptyMessage={dictAdmin.admins.empty}
        loadingMessage={dict.general.loading}
        caption={dictAdmin.admins.heading}
        keyExtractor={(admin) => admin.userId}
      />

      <ConfirmModal
        show={confirmRemove !== null}
        title={dictAdmin.admins.removeConfirmTitle}
        message={dictAdmin.admins.removeConfirmMessage.replace(
          '{user}',
          confirmRemove?.displayLabel ?? confirmRemove?.userId ?? '',
        )}
        confirmLabel={dictAdmin.admins.remove}
        pending={saving}
        onConfirm={handleRemove}
        onCancel={() => setConfirmRemove(null)}
      />
    </div>
  );
}
