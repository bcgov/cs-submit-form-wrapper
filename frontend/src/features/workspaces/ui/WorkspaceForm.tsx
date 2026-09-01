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
import {
  useWorkspace,
  useRefreshWorkspace,
  useRefreshWorkspaces,
} from '@/src/shared/api/useWorkspaces';
import { useCurrentUser } from '@/src/shared/api/useCurrentUser';
import { useNotificationStore } from '@/lib/hooks/useNotificationStore';
import { createWorkspace, updateWorkspace } from '@/src/shared/api/sobaApi';
import { isWorkspaceManageRole } from '../workspaceRoles';
import type { WorkspaceItem } from '@/src/types/workspaces';
import styles from './WorkspaceForm.module.css';

type WorkspaceSettingsProps = {
  /** The workspace being edited, or null to create one. Seeds the fields on mount. */
  workspace: WorkspaceItem | null;
  first: boolean;
};

function WorkspaceSettings({ workspace, first }: Readonly<WorkspaceSettingsProps>) {
  const isCreate = workspace === null;
  const dict = useDictionary();
  const dictWorkspaces = dict.workspaces;
  const router = useRouter();
  const pathname = usePathname();
  const locale = getLocaleFromPath(pathname);
  const { token } = useKeycloak();
  const refreshWorkspaces = useRefreshWorkspaces();
  const refreshWorkspace = useRefreshWorkspace();
  const { addNotification } = useNotificationStore();

  const [name, setName] = useState(workspace?.name ?? '');
  const [org, setOrg] = useState(workspace?.org ?? '');
  const [useCase, setUseCase] = useState(workspace?.useCase ?? '');
  const [disclaimerAccepted, setDisclaimerAccepted] = useState(
    workspace?.disclaimerAccepted ?? false,
  );
  const [saving, setSaving] = useState(false);

  const valid = useMemo(() => {
    return name.trim().length > 0 && useCase !== '' && org !== '';
  }, [name, useCase, org]);

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
    // Saving an unchanged workspace is a no-op, not a request.
    const needsUpdate =
      isCreate ||
      trimmedName !== workspace.name ||
      disclaimerAccepted !== workspace.disclaimerAccepted ||
      useCase !== workspace.useCase ||
      org !== workspace.org;
    if (!token || !needsUpdate) return;

    setSaving(true);
    try {
      const body = { name: trimmedName, disclaimerAccepted, useCase, org };
      if (isCreate) {
        await createWorkspace(token, body);
      } else {
        await updateWorkspace(token, workspace.id, body);
        await refreshWorkspace(workspace.id);
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
    workspace,
    disclaimerAccepted,
    refreshWorkspace,
    refreshWorkspaces,
    router,
    locale,
    addNotification,
    dictWorkspaces.createError,
    dictWorkspaces.saveError,
  ]);

  const saveLabel = isCreate ? dictWorkspaces.create : dictWorkspaces.save;

  return (
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
}

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
  const { authenticated, initializing } = useKeycloak();
  const { addNotification } = useNotificationStore();
  const { data: currentUser, loaded: currentUserLoaded } = useCurrentUser();
  const { workspace, isLoading } = useWorkspace(workspaceId);

  const [activeTab, setActiveTab] = useState('settings');

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
    if (!workspace || isWorkspaceManageRole(workspace.role)) {
      return;
    }
    addNotification({
      text: dictWorkspaces.manageForbidden,
      type: 'error',
    });
    router.push(`/${locale}/workspaces`);
  }, [workspace, addNotification, dictWorkspaces.manageForbidden, router, locale]);

  const heading = isCreate ? dictWorkspaces.createHeading : dictWorkspaces.manageHeading;
  // The first-workspace flow runs inside a modal over another page, whose heading it must not take.
  usePageHeading({ heading: first ? undefined : heading });

  if (!authenticated && !initializing) {
    return <p>{dict.general.notAuthenticated}</p>;
  }

  if (isLoading) {
    return <CenteredProgress label={dict.general.loading} />;
  }

  if (isCreate) {
    return (
      <>
        {first && <p>{dictWorkspaces.defaultWorkspaceIntro}</p>}
        <WorkspaceSettings workspace={null} first={first} />
      </>
    );
  }

  // Editing without the record would post the empty form as a new workspace.
  if (!workspace) {
    return (
      <InlineAlert
        description={dictWorkspaces.loadError}
        title={dictWorkspaces.manageHeading}
        variant="warning"
        data-testid="workspace-load-error"
      />
    );
  }

  return (
    <Tabs
      id="workspace-manage-tabs"
      activeKey={activeTab}
      onSelect={(k) => setActiveTab(k || 'settings')}
      className="mb-3"
      mountOnEnter
    >
      <Tab eventKey="settings" title={dictWorkspaces.settingsTab}>
        <div className={styles.tabContent}>
          <WorkspaceSettings key={workspace.id} workspace={workspace} first={first} />
        </div>
      </Tab>
      <Tab eventKey="team" title={dictWorkspaces.teamTab}>
        <div className={styles.tabContent}>
          <FormSubmitterAudience key={workspace.id} workspaceId={workspace.id} canManage />
        </div>
      </Tab>
    </Tabs>
  );
}

export default WorkspaceForm;
