'use client';

import { useCallback, useState, type Key } from 'react';
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
import { upsertFeatureScope } from '@/src/shared/api/sobaApiAdmin';
import { getLocaleFromPath } from '@/src/shared/util/locale';
import type { FeatureScopeItem, FeatureScopeStatus, FeatureScopeType } from '@/src/types/admin';
import { useFeatureScope } from '../useAdminData';
import { useIsSobaAdmin } from '../useIsSobaAdmin';
import styles from './AdminPanel.module.css';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type FeatureScopeFormProps = {
  scopedFeatureCodes: string[];
  /** The record being edited, or null to create one. Seeds the fields on mount. */
  featureScope: FeatureScopeItem | null;
};

function FeatureScopeForm({ scopedFeatureCodes, featureScope }: Readonly<FeatureScopeFormProps>) {
  const isEdit = featureScope !== null;
  const dict = useDictionary();
  const dictScopes = dict.admin.featureScopes;
  const { token } = useKeycloak();
  const { addNotification } = useNotificationStore();
  const router = useRouter();
  const pathname = usePathname();
  const locale = getLocaleFromPath(pathname);

  const [featureCode, setFeatureCode] = useState(
    featureScope?.featureCode ?? scopedFeatureCodes[0] ?? '',
  );
  const [scopeType, setScopeType] = useState<FeatureScopeType>(
    featureScope?.scopeType ?? 'workspace',
  );
  const [scopeId, setScopeId] = useState(featureScope?.scopeId ?? '');
  const [status, setStatus] = useState<FeatureScopeStatus>(featureScope?.status ?? 'active');
  const [saving, setSaving] = useState(false);

  const valid = UUID_PATTERN.test(scopeId.trim()) && featureCode.trim() !== '';

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

  return (
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
  );
}

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
  const { authenticated } = useKeycloak();
  const { isSobaAdmin, initializing } = useIsSobaAdmin();
  const { addNotification } = useNotificationStore();

  const reportLoadError = useCallback(
    (cause: unknown) => {
      addNotification({ text: dictScopes.loadError, type: 'error', consoleError: cause });
    },
    [addNotification, dictScopes.loadError],
  );
  const { featureScope, isLoading } = useFeatureScope(
    featureScopeId,
    scopedFeatureCodes.length > 0,
    reportLoadError,
  );

  if (initializing) {
    return <CenteredProgress label={dict.general.loading} />;
  }

  if (!authenticated) {
    return <ListPageAuthGate>{dict.general.notAuthenticated}</ListPageAuthGate>;
  }

  if (!isSobaAdmin) {
    return <ListPageAuthGate>{dict.admin.forbidden}</ListPageAuthGate>;
  }

  if (isLoading) {
    return <CenteredProgress label={dict.general.loading} />;
  }

  // The scope's own feature has to be one this deployment scopes, or there is nothing to grant.
  const unavailable =
    scopedFeatureCodes.length === 0 ||
    (featureScope !== null && !scopedFeatureCodes.includes(featureScope.featureCode));

  return (
    <div>
      <Heading level={1} id="feature-scope-form-heading">
        {isEdit ? dictScopes.manageHeading : dictScopes.createHeading}
      </Heading>
      <p className={styles.panelIntro}>{dictScopes.intro}</p>
      {unavailable ? (
        <InlineAlert
          description={dictScopes.noScopedFeatures}
          title={dictScopes.featureCodeLabel}
          variant="info"
          data-testid="feature-scope-none"
        />
      ) : null}
      {/* Editing without the record would post the empty form as a new scope. */}
      {!unavailable && isEdit && featureScope === null ? (
        <InlineAlert
          description={dictScopes.loadError}
          title={dictScopes.manageHeading}
          variant="warning"
          data-testid="feature-scope-load-error"
        />
      ) : null}
      {!unavailable && (!isEdit || featureScope !== null) ? (
        <FeatureScopeForm
          key={featureScope?.id ?? 'create'}
          scopedFeatureCodes={scopedFeatureCodes}
          featureScope={featureScope}
        />
      ) : null}
    </div>
  );
}

export default FeatureScopePanel;
