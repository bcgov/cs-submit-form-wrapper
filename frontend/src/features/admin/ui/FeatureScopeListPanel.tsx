'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, InlineAlert, Switch } from '@bcgov/design-system-react-components';
import { usePathname, useRouter } from 'next/navigation';
import { DataTable, type Column } from '@/src/components/DataTable';
import { ListPageToolbar } from '@/src/components/ListPageLayout';
import { RowActionButton } from '@/src/components/RowActionButton';
import { SecondaryText } from '@/src/components/SecondaryText';
import { useKeycloak } from '@/lib/hooks/useKeycloak';
import { useDictionary } from '@/app/[lang]/Providers';
import { useNotificationStore } from '@/lib/hooks/useNotificationStore';
import {
  fetchFeatureScopes,
  removeFeatureScope,
  upsertFeatureScope,
} from '@/src/shared/api/sobaApiAdmin';
import { getLocaleFromPath } from '@/src/shared/util/locale';
import type { FeatureScopeItem, FeatureScopeStatus } from '@/src/types/admin';
import styles from './AdminPanel.module.css';

type FeatureScopeListPanelProps = {
  /** Feature codes that are currently available for per-scope administration. */
  scopedFeatureCodes: string[];
};

export function FeatureScopeListPanel({
  scopedFeatureCodes,
}: Readonly<FeatureScopeListPanelProps>) {
  const dict = useDictionary();
  const dictScopes = dict.admin.featureScopes;
  const { token } = useKeycloak();
  const { addNotification } = useNotificationStore();
  const router = useRouter();
  const pathname = usePathname();
  const locale = getLocaleFromPath(pathname);

  const [featureScopes, setFeatureScopes] = useState<FeatureScopeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const allowedFeatureCodes = useMemo(() => new Set(scopedFeatureCodes), [scopedFeatureCodes]);

  const reload = useCallback(() => {
    setLoading(true);
    setReloadKey((key) => key + 1);
  }, []);

  useEffect(() => {
    if (!token) return;
    if (scopedFeatureCodes.length === 0) return;

    let cancelled = false;
    fetchFeatureScopes(token, { limit: 200 })
      .then((response) => {
        if (cancelled) return;
        setFeatureScopes(
          response.items.filter((item) => allowedFeatureCodes.has(item.featureCode)),
        );
        setError(null);
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setError(dictScopes.loadError);
        addNotification({ text: dictScopes.loadError, type: 'error', consoleError: cause });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    token,
    reloadKey,
    scopedFeatureCodes.length,
    allowedFeatureCodes,
    addNotification,
    dictScopes.loadError,
  ]);

  const handleStatusChange = useCallback(
    (featureScope: FeatureScopeItem, selected: boolean) => {
      if (!token || pendingId) return;
      const nextStatus: FeatureScopeStatus = selected ? 'active' : 'inactive';
      setPendingId(featureScope.id);
      upsertFeatureScope(token, {
        featureCode: featureScope.featureCode,
        scopeType: featureScope.scopeType,
        scopeId: featureScope.scopeId,
        status: nextStatus,
      })
        .then(() => {
          setFeatureScopes((items) =>
            items.map((item) =>
              item.id === featureScope.id ? { ...item, status: nextStatus } : item,
            ),
          );
          addNotification({ text: dictScopes.saveSuccess, type: 'success' });
        })
        .catch((cause: unknown) => {
          addNotification({ text: dictScopes.saveError, type: 'error', consoleError: cause });
          reload();
        })
        .finally(() => {
          setPendingId(null);
        });
    },
    [token, pendingId, addNotification, dictScopes.saveSuccess, dictScopes.saveError, reload],
  );

  const handleDelete = useCallback(
    (featureScopeId: string) => {
      if (!token || pendingId) return;
      setPendingId(featureScopeId);
      removeFeatureScope(token, featureScopeId)
        .then(() => {
          setFeatureScopes((items) => items.filter((item) => item.id !== featureScopeId));
          addNotification({ text: dictScopes.deleteSuccess, type: 'success' });
        })
        .catch((cause: unknown) => {
          addNotification({ text: dictScopes.deleteError, type: 'error', consoleError: cause });
          reload();
        })
        .finally(() => {
          setPendingId(null);
        });
    },
    [token, pendingId, addNotification, dictScopes.deleteSuccess, dictScopes.deleteError, reload],
  );

  const columns: Column<FeatureScopeItem>[] = useMemo(
    () => [
      {
        key: 'featureCode',
        label: dictScopes.columns.feature,
        width: '40%',
        render: (featureScope) => (
          <span className="d-inline-flex flex-column">
            <span>{featureScope.featureCode}</span>
            <SecondaryText>{featureScope.id}</SecondaryText>
          </span>
        ),
      },
      {
        key: 'scopeType',
        label: dictScopes.columns.scope,
        render: (featureScope) => dictScopes.scopeTypes[featureScope.scopeType],
      },
      {
        key: 'scopeId',
        label: dictScopes.columns.scopeId,
        render: (featureScope) => <SecondaryText>{featureScope.scopeId}</SecondaryText>,
      },
      {
        key: 'status',
        label: dictScopes.columns.status,
        align: 'center',
        render: (featureScope) => (
          <Switch
            isSelected={featureScope.status === 'active'}
            isDisabled={pendingId === featureScope.id}
            aria-label={dictScopes.statusToggleLabel
              .replace('{featureCode}', featureScope.featureCode)
              .replace('{scopeType}', dictScopes.scopeTypes[featureScope.scopeType])
              .replace('{scopeId}', featureScope.scopeId)}
            onChange={(selected) => handleStatusChange(featureScope, selected)}
            data-testid={`feature-scope-status-${featureScope.id}`}
          />
        ),
      },
      {
        key: 'updatedAt',
        label: dictScopes.columns.updated,
        render: (featureScope) => new Date(featureScope.updatedAt).toLocaleString(dict.locale),
      },
      {
        key: 'actions',
        label: dictScopes.columns.actions,
        render: (featureScope) => (
          <div className="d-flex gap-2 justify-content-start">
            <RowActionButton
              data-testid={`manage-feature-scope-${featureScope.id}`}
              onPress={() => router.push(`/${locale}/admin/feature-scopes/${featureScope.id}`)}
            >
              {dictScopes.manage}
            </RowActionButton>
            <RowActionButton
              data-testid={`delete-feature-scope-${featureScope.id}`}
              onPress={() => handleDelete(featureScope.id)}
            >
              {dictScopes.delete}
            </RowActionButton>
          </div>
        ),
      },
    ],
    [dictScopes, pendingId, handleStatusChange, handleDelete, router, locale, dict.locale],
  );

  return (
    <div className={styles.tabContent}>
      <p className={styles.panelIntro}>{dictScopes.intro}</p>
      <ListPageToolbar align="end">
        <Button
          variant="primary"
          isDisabled={scopedFeatureCodes.length === 0}
          data-testid="create-feature-scope-button"
          onPress={() => router.push(`/${locale}/admin/feature-scopes/create`)}
        >
          {dictScopes.create}
        </Button>
      </ListPageToolbar>
      {scopedFeatureCodes.length === 0 ? (
        <InlineAlert
          description={dictScopes.noScopedFeatures}
          title={dictScopes.featureCodeLabel}
          variant="info"
          data-testid="feature-scope-none"
        />
      ) : (
        <DataTable<FeatureScopeItem>
          data={featureScopes}
          columns={columns}
          loading={loading}
          error={error}
          emptyMessage={dictScopes.empty}
          loadingMessage={dict.general.loading}
          caption={dictScopes.heading}
          keyExtractor={(featureScope) => featureScope.id}
        />
      )}
    </div>
  );
}
