'use client';

import { useCallback, useEffect, useState, useMemo, type Key } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Tabs, Tab } from 'react-bootstrap';
import {
  Button,
  Form,
  Checkbox,
  TextField,
  Select,
  InlineAlert,
} from '@bcgov/design-system-react-components';
import { FormSubmitterAudience } from '@/src/features/designer/ui/FormSubmitterAudience';
import { CenteredProgress } from '@/app/ui/base/CenteredProgress';
import { usePageHeading } from '@/src/components/PageHeader';
import { useKeycloak } from '@/lib/hooks/useKeycloak';
import { useDictionary } from '@/app/[lang]/Providers';
import { getLocaleFromPath } from '@/src/shared/util/locale';
import { useRefreshWorkspaces } from '@/src/shared/api/useWorkspaces';
import { useCurrentUser } from '@/src/shared/api/useCurrentUser';
import { useNotificationStore } from '@/lib/hooks/useNotificationStore';
import { createWorkspace, selectWorkspace, updateWorkspace } from '@/src/shared/api/sobaApi';
import { isWorkspaceManageRole } from '../workspaceRoles';
import styles from './WorkspaceForm.module.css';

type WorkspaceFormProps = {
  workspaceId?: string;
  first?: boolean;
};

function WorkspaceForm({ workspaceId, first = false }: Readonly<WorkspaceFormProps>) {
  const isCreate = !workspaceId;
  const dict = useDictionary();
  const dictWorkspaces = dict.workspaces;
  const router = useRouter();
  const pathname = usePathname();
  const locale = getLocaleFromPath(pathname);
  const { authenticated, token, initializing } = useKeycloak();
  const refreshWorkspaces = useRefreshWorkspaces();
  const { addNotification } = useNotificationStore();
  const { data: currentUser, loaded: currentUserLoaded } = useCurrentUser();

  const [name, setName] = useState('');
  const [loadedName, setLoadedName] = useState('');
  const [org, setOrg] = useState('');
  const [loadedOrg, setLoadedOrg] = useState('');
  const [useCase, setUseCase] = useState('');
  const [loadedUseCase, setLoadedUseCase] = useState('');
  const [disclaimerAccepted, setDisclaimerAccepted] = useState(false);
  const [loadedDisclaimer, setLoadedDisclaimer] = useState(false);
  const [loading, setLoading] = useState(!isCreate);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('settings');

  const valid = useMemo(() => {
    return name.trim().length > 0 && useCase !== '' && org !== '';
  }, [name, useCase, org]);

  useEffect(() => {
    if (!authenticated || initializing || !currentUserLoaded) {
      return;
    }
    if (isCreate && !currentUser?.capabilities?.canCreateWorkspace) {
      addNotification({
        text: dictWorkspaces.createForbidden,
        type: 'error',
      });
      router.push(`/${locale}/workspaces`);
    }
  }, [
    isCreate,
    currentUser,
    currentUserLoaded,
    authenticated,
    initializing,
    addNotification,
    dictWorkspaces.createForbidden,
    router,
    locale,
  ]);

  useEffect(() => {
    if (!token || isCreate) return;

    let cancelled = false;
    void selectWorkspace(token, workspaceId)
      .then((workspace) => {
        if (cancelled) return;
        if (!isWorkspaceManageRole(workspace.role)) {
          addNotification({
            text: dictWorkspaces.manageForbidden,
            type: 'error',
          });
          router.push(`/${locale}/workspaces`);
          return;
        }
        setName(workspace.name);
        setLoadedName(workspace.name);
        setUseCase(workspace.useCase);
        setLoadedUseCase(workspace.useCase);
        setOrg(workspace.org);
        setLoadedOrg(workspace.org);
        setDisclaimerAccepted(workspace.disclaimerAccepted);
        setLoadedDisclaimer(workspace.disclaimerAccepted);
      })
      .catch((error) => {
        if (cancelled) return;
        addNotification({
          text: dictWorkspaces.loadError,
          type: 'error',
          consoleError: error,
        });
      })
      .finally(() => {
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once per workspace id
  }, [token, workspaceId, isCreate]);

  const handleUseCaseChange = useCallback((newUseCase: Key | null) => {
    setUseCase(newUseCase?.toString() ?? '');
  }, []);

  const handleOrgChange = useCallback((newOrg: Key | null) => {
    setOrg(newOrg?.toString() ?? '');
  }, []);

  const handleCancel = useCallback(() => {
    router.push(`/${locale}/workspaces`);
  }, [router, locale]);

  const handleSave = useCallback(async () => {
    const trimmedName = name.trim();
    const needsUpdate =
      trimmedName !== loadedName ||
      disclaimerAccepted !== loadedDisclaimer ||
      useCase !== loadedUseCase ||
      org !== loadedOrg;
    if (!token || !needsUpdate) return;

    setSaving(true);
    try {
      if (isCreate) {
        await createWorkspace(token, {
          name: trimmedName,
          disclaimerAccepted,
          useCase,
          org,
        });
      } else if (needsUpdate) {
        await updateWorkspace(token, workspaceId, {
          name: trimmedName,
          disclaimerAccepted,
          useCase,
          org,
        });
      }

      await refreshWorkspaces();
      router.push(`/${locale}/workspaces`);
    } catch (error) {
      addNotification({
        text: isCreate ? dictWorkspaces.createError : dictWorkspaces.saveError,
        type: 'error',
        consoleError: error,
      });
    } finally {
      setSaving(false);
    }
  }, [
    name,
    org,
    useCase,
    token,
    isCreate,
    workspaceId,
    loadedName,
    disclaimerAccepted,
    loadedDisclaimer,
    refreshWorkspaces,
    router,
    locale,
    addNotification,
    dictWorkspaces.createError,
    dictWorkspaces.saveError,
    loadedOrg,
    loadedUseCase,
  ]);

  const heading = isCreate ? dictWorkspaces.createHeading : dictWorkspaces.manageHeading;
  // The first-workspace flow runs inside a modal over another page, whose heading it must not take.
  usePageHeading({ heading: first ? undefined : heading });

  if (!authenticated && !initializing) {
    return <p>{dict.general.notAuthenticated}</p>;
  }

  if (loading) {
    return <CenteredProgress label={dict.general.loading} />;
  }

  const saveLabel = isCreate ? dictWorkspaces.create : dictWorkspaces.save;

  const settingsForm = (
    <Form
      onSubmit={(event) => {
        event.preventDefault();
        handleSave().catch(() => undefined);
      }}
      className={`${styles.fieldStack} ${first ? styles.fieldStackFill : ''}`}
    >
      <TextField
        label={dictWorkspaces.nameLabel}
        value={name}
        onChange={setName}
        isRequired
        isDisabled={saving}
        data-testid="workspace-name"
      />
      <Select
        items={Object.entries(dict.ministries).map(([id, label]) => ({ id, label }))}
        label={dictWorkspaces.yourOrgReq}
        selectionMode="single"
        size="medium"
        data-testid="workspace-your-org"
        isRequired={true}
        value={org}
        onChange={handleOrgChange}
      />
      <Select
        items={Object.entries(dict.useCases).map(([id, label]) => ({ id, label }))}
        label={dictWorkspaces.useCase}
        selectionMode="single"
        size="medium"
        data-testid="workspace-use-case"
        isRequired={true}
        value={useCase}
        onChange={handleUseCaseChange}
      />
      <InlineAlert
        description={dictWorkspaces.disclaimer}
        title={dictWorkspaces.disclaimerTitle}
        variant="info"
        data-testid="workspace-disclaimer-alert"
      />
      <Checkbox
        isSelected={disclaimerAccepted}
        onChange={setDisclaimerAccepted}
        isDisabled={saving}
        aria-label={dictWorkspaces.disclaimerLabel}
        data-testid="workspace-disclaimer-switch"
      >
        {dictWorkspaces.disclaimerLabel}
      </Checkbox>
      <div className={styles.actions}>
        <Button
          type="submit"
          variant="primary"
          isDisabled={saving || !valid}
          data-testid="workspace-save"
        >
          {saving ? dict.general.loading : saveLabel}
        </Button>
        <Button
          type="button"
          variant="secondary"
          onPress={handleCancel}
          isDisabled={saving}
          data-testid="workspace-cancel"
        >
          {dictWorkspaces.cancel}
        </Button>
      </div>
    </Form>
  );

  return (
    <>
      {first && <p>{dictWorkspaces.defaultWorkspaceIntro}</p>}
      {isCreate ? (
        settingsForm
      ) : (
        <Tabs
          id="workspace-manage-tabs"
          activeKey={activeTab}
          onSelect={(k) => setActiveTab(k || 'settings')}
          className="mb-3"
          mountOnEnter
        >
          <Tab eventKey="settings" title={dictWorkspaces.settingsTab}>
            <div className={styles.tabContent}>{settingsForm}</div>
          </Tab>
          <Tab eventKey="team" title={dictWorkspaces.teamTab}>
            <div className={styles.tabContent}>
              <FormSubmitterAudience
                key={workspaceId ?? 'none'}
                workspaceId={workspaceId ?? null}
                token={token ?? undefined}
                canManage
              />
            </div>
          </Tab>
        </Tabs>
      )}
    </>
  );
}

export default WorkspaceForm;
