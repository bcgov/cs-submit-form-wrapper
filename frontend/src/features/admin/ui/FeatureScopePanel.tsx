'use client';

import { useCallback, useEffect, useState, type Key } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  Button,
  Form,
  Heading,
  InlineAlert,
  Select,
  TextField,
} from '@bcgov/design-system-react-components';
import { CenteredProgress } from '@/app/ui/base/CenteredProgress';
import { ListPageAuthGate } from '@/src/components/ListPageLayout';
import { useKeycloak } from '@/lib/hooks/useKeycloak';
import { useDictionary } from '@/app/[lang]/Providers';
import { useNotificationStore } from '@/lib/hooks/useNotificationStore';
import { fetchFeatureScope, upsertFeatureScope } from '@/src/shared/api/sobaApiAdmin';
import { getLocaleFromPath } from '@/src/shared/util/locale';
import type { FeatureScopeStatus, FeatureScopeType } from '@/src/types/admin';
import { useIsSobaAdmin } from '../useIsSobaAdmin';
import styles from './AdminPanel.module.css';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type FeatureScopePanelProps = {
  /** Feature codes with `scoped` availability, resolved server-side from `/meta/features`. */
  scopedFeatureCodes: string[];
  featureScopeId?: string;
};

export function FeatureScopePanel({
  scopedFeatureCodes,
  featureScopeId,
}: Readonly<FeatureScopePanelProps>) {
  const isEdit = featureScopeId !== undefined;
  const dict = useDictionary();
  const dictScopes = dict.admin.featureScopes;
  const { authenticated, token } = useKeycloak();
  const { isSobaAdmin, initializing } = useIsSobaAdmin();
  const { addNotification } = useNotificationStore();
  const router = useRouter();
  const pathname = usePathname();
  const locale = getLocaleFromPath(pathname);

  const [featureCode, setFeatureCode] = useState(scopedFeatureCodes[0] ?? '');
  const [scopeType, setScopeType] = useState<FeatureScopeType>('workspace');
  const [scopeId, setScopeId] = useState('');
  const [status, setStatus] = useState<FeatureScopeStatus>('active');
  const [loading, setLoading] = useState(isEdit && scopedFeatureCodes.length > 0);
  const [saving, setSaving] = useState(false);

  const featureScopeAllowed = !featureCode || scopedFeatureCodes.includes(featureCode);
  const formUnavailable = scopedFeatureCodes.length === 0 || (isEdit && !featureScopeAllowed);
  const valid = UUID_PATTERN.test(scopeId.trim()) && featureCode.trim() !== '' && !formUnavailable;

  useEffect(() => {
    if (!token || !featureScopeId) return;
    if (scopedFeatureCodes.length === 0) return;

    let cancelled = false;
    fetchFeatureScope(token, featureScopeId)
      .then((featureScope) => {
        if (cancelled) return;
        setFeatureCode(featureScope.featureCode);
        setScopeType(featureScope.scopeType);
        setScopeId(featureScope.scopeId);
        setStatus(featureScope.status);
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        addNotification({ text: dictScopes.loadError, type: 'error', consoleError: cause });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [token, featureScopeId, scopedFeatureCodes.length, addNotification, dictScopes.loadError]);

  const handleCancel = useCallback(() => {
    router.push(`/${locale}/admin/feature-scopes`);
  }, [router, locale]);

  const handleSubmit = useCallback(async () => {
    if (!token || !valid) return;
    setSaving(true);
    try {
      await upsertFeatureScope(token, {
        featureCode: featureCode.trim(),
        scopeType,
        scopeId: scopeId.trim(),
        status,
      });
      addNotification({ text: dictScopes.saveSuccess, type: 'success' });
      router.push(`/${locale}/admin/feature-scopes`);
    } catch (cause) {
      addNotification({ text: dictScopes.saveError, type: 'error', consoleError: cause });
    } finally {
      setSaving(false);
    }
  }, [
    token,
    valid,
    featureCode,
    scopeType,
    scopeId,
    status,
    router,
    locale,
    addNotification,
    dictScopes.saveSuccess,
    dictScopes.saveError,
  ]);

  if (initializing) {
    return <CenteredProgress label={dict.general.loading} />;
  }

  if (!authenticated) {
    return <ListPageAuthGate>{dict.general.notAuthenticated}</ListPageAuthGate>;
  }

  if (!isSobaAdmin) {
    return <ListPageAuthGate>{dict.admin.forbidden}</ListPageAuthGate>;
  }

  if (loading) {
    return <CenteredProgress label={dict.general.loading} />;
  }

  const heading = isEdit ? dictScopes.manageHeading : dictScopes.createHeading;

  return (
    <div>
      <Heading level={1} id="feature-scope-form-heading">
        {heading}
      </Heading>
      <p className={styles.panelIntro}>{dictScopes.intro}</p>
      {formUnavailable ? (
        <InlineAlert
          description={dictScopes.noScopedFeatures}
          title={dictScopes.featureCodeLabel}
          variant="info"
          data-testid="feature-scope-none"
        />
      ) : (
        <Form
          className={styles.fieldStack}
          onSubmit={(event) => {
            event.preventDefault();
            handleSubmit().catch(() => undefined);
          }}
        >
          <Select
            items={scopedFeatureCodes.map((code) => ({ id: code, label: code }))}
            label={dictScopes.featureCodeLabel}
            selectionMode="single"
            size="medium"
            isRequired
            isDisabled={saving || isEdit}
            value={featureCode}
            onChange={(key: Key | null) => setFeatureCode(key?.toString() ?? '')}
            data-testid="feature-scope-code"
          />
          <Select
            items={[
              { id: 'workspace', label: dictScopes.scopeTypes.workspace },
              { id: 'form', label: dictScopes.scopeTypes.form },
            ]}
            label={dictScopes.scopeTypeLabel}
            selectionMode="single"
            size="medium"
            isRequired
            isDisabled={saving || isEdit}
            value={scopeType}
            onChange={(key: Key | null) =>
              setScopeType((key?.toString() as FeatureScopeType) ?? 'workspace')
            }
            data-testid="feature-scope-type"
          />
          <TextField
            label={dictScopes.scopeIdLabel}
            description={dictScopes.scopeIdHint}
            value={scopeId}
            onChange={setScopeId}
            isRequired
            isDisabled={saving || isEdit}
            data-testid="feature-scope-id"
          />
          <Select
            items={[
              { id: 'active', label: dictScopes.statuses.active },
              { id: 'inactive', label: dictScopes.statuses.inactive },
            ]}
            label={dictScopes.statusLabel}
            selectionMode="single"
            size="medium"
            isRequired
            value={status}
            onChange={(key: Key | null) =>
              setStatus((key?.toString() as FeatureScopeStatus) ?? 'active')
            }
            data-testid="feature-scope-status"
          />
          <InlineAlert
            description={dictScopes.warning}
            title={dictScopes.warningTitle}
            variant="warning"
            data-testid="feature-scope-warning"
          />
          <div className={styles.actions}>
            <Button
              type="submit"
              variant="primary"
              isDisabled={saving || !valid}
              data-testid="feature-scope-save"
            >
              {dictScopes.save}
            </Button>
            <Button
              variant="secondary"
              isDisabled={saving}
              data-testid="feature-scope-cancel"
              onPress={handleCancel}
            >
              {dictScopes.cancel}
            </Button>
          </div>
        </Form>
      )}
    </div>
  );
}

export default FeatureScopePanel;
