'use client';
import { useState, useMemo, useCallback } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { Tabs, Tab } from 'react-bootstrap';
import {
  InlineAlert,
  Button,
  Form,
  TextField,
  Select,
} from '@bcgov/design-system-react-components';
import { CenteredProgress } from '@/app/ui/base/CenteredProgress';
import { Modal as CommonModal } from '@/src/components/Modal';
import styles from './FormForm.module.css';

import type { FormType } from '@formio/react';

import { useKeycloak } from '@/lib/hooks/useKeycloak';
import { useDictionary } from '@/app/[lang]/Providers';
import FormDesigner from '@/src/features/designer/ui/FormDesigner';
import { DynamicForm } from '@/src/features/formio-v5/ui/DynamicForm';
import { WorkspaceSelector } from '@/app/ui/WorkspaceSelector';
import { usePageHeading, usePageNotices, type PageNotice } from '@/src/components/PageHeader';
import FormSettingsTab from './FormSettingsTab';
import FormTeamTab from './FormTeamTab';
import FormHistoryTab from './FormHistoryTab';
import FormSubmissionTab from './FormSubmissionTab';
import FormShareTab from './FormShareTab';
import { FormSubmitterAudience } from './FormSubmitterAudience';
import { isWorkspaceManageRole } from '@/src/features/workspaces/workspaceRoles';
import { useWorkspaces, useWritableWorkspaces } from '@/src/shared/api/useWorkspaces';
import { useFormDraft } from '@/src/features/designer/useFormDraft';
import { useNotificationStore } from '@/lib/hooks/useNotificationStore';

import {
  createSobaFormioForm,
  createFormVersion,
  saveFormVersionSchema,
  publishSobaFormVersion,
  updateSobaForm,
  getFormVersionSchema,
} from '@/src/shared/api/sobaApi';
import type { SobaFormType, SobaFormVersionType } from '@/src/types/forms';
import { isSessionExpired } from '@/src/shared/api/sobaFetch';
import { isForbidden } from '@/src/shared/api/sobaHelpers';

type Dict = ReturnType<typeof useDictionary>;

function noticeForLoadError(dict: Dict, loadError: unknown): string {
  if (isSessionExpired(loadError)) return dict.general.sessionExpired;
  if (isForbidden(loadError)) return dict.general.noAccess;
  return dict.form.loadFormError || 'Failed to load form.';
}

function draftNotices(args: {
  dict: Dict;
  loadError: unknown;
  isHistoryView: boolean;
  historicalVersionNo: number | null;
  isCurrentPublished: boolean;
  onSwitchToCurrent: () => void;
}): Array<PageNotice | false> {
  const { dict, loadError, isHistoryView, historicalVersionNo, isCurrentPublished } = args;
  return [
    !!loadError && {
      id: 'load-error',
      variant: 'danger' as const,
      body: noticeForLoadError(dict, loadError),
    },
    isHistoryView && {
      id: 'history-view',
      variant: 'info' as const,
      title: dict.form.readOnlyMode || 'Read-Only Mode:',
      body: `${dict.form.viewingHistoricalVersion || 'You are viewing historical version'} v${historicalVersionNo}. ${dict.form.savePublishDisabled || 'Save and Publish options are disabled.'}`,
      action: {
        label:
          dict.form.switchToCurrentDraft ||
          'Switch to ' + (dict.form.currentDraft || 'Current Draft'),
        onPress: args.onSwitchToCurrent,
      },
    },
    !isHistoryView &&
      isCurrentPublished && {
        id: 'published-version',
        variant: 'info' as const,
        title: dict.form.publishedVersion || 'Published Version:',
        body:
          dict.form.publishedVersionCannotBeModified ||
          'This version is published and cannot be modified',
      },
  ];
}

function FormForm({ formId }: { formId?: string }) {
  const dict = useDictionary();
  const router = useRouter();
  const params = useParams();
  const lang = params.lang as string;

  const { authenticated, token, initializing } = useKeycloak();
  const { workspaces } = useWorkspaces();
  const { workspaces: writableWorkspaces, loaded: writableLoaded } = useWritableWorkspaces();
  const { addNotification } = useNotificationStore();
  // A new form can only go to a workspace the user can create in whose disclaimer is accepted
  // (the backend rejects the rest), so those are the only ones ever offered.
  const creatableWorkspaces = useMemo(
    () => writableWorkspaces.filter((w) => w.disclaimerAccepted),
    [writableWorkspaces],
  );
  // Not seeded from the forms-list filter: that scopes what you are looking at, not where a
  // new form belongs. An existing form's workspace is the one it was created in.
  const [pickedWorkspaceId, setPickedWorkspaceId] = useState<string | null>(null);
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'designer');
  // A tab's read starts when it is first opened and stays cached after: leaving is not a reason to
  // drop what it loaded, and the reads behind these tabs are gated on permissions a user may lack.
  const [openedTabs, setOpenedTabs] = useState<string[]>(() => [activeTab]);
  const openTab = useCallback((key: string) => {
    setActiveTab(key);
    setOpenedTabs((opened) => (opened.includes(key) ? opened : [...opened, key]));
  }, []);
  const [isSaving, setIsSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const {
    form,
    versions,
    currentVersion,
    activeVersion,
    isHistoryView,
    historicalVersionNo,
    selectedVersionId,
    schema: formSchema,
    name: formName,
    description: formDesc,
    isDirty,
    loading,
    error: loadError,
    setName,
    setSchema,
    discardEdits,
    commitSchema,
    selectVersion,
    refreshForm,
    refreshVersions,
  } = useFormDraft(formId);

  const isCurrentPublished = currentVersion?.state === 'published';

  const selectedWorkspaceId = formId ? (form?.workspaceId ?? null) : pickedWorkspaceId;
  const activeWorkspace = workspaces.find((w) => w.id === selectedWorkspaceId);
  const canManageWorkspace = !!activeWorkspace && isWorkspaceManageRole(activeWorkspace.role);

  usePageHeading({
    // Editing claims no heading until the name arrives, so the page's own stands rather than
    // flashing the create-form label on an existing form.
    heading: formId ? formName || undefined : dict.form.createForm,
    eyebrow: formId && selectedWorkspaceId ? activeWorkspace?.name || selectedWorkspaceId : undefined,
  });

  usePageNotices(
    draftNotices({
      dict,
      loadError,
      isHistoryView,
      historicalVersionNo,
      isCurrentPublished,
      onSwitchToCurrent: () => selectVersion('current'),
    }),
  );

  const createNewVersion = async (sourceSchema?: FormType) => {
    if (isSaving || loading || !token) return;
    if (!formId) return;
    setIsSaving(true);

    try {
      // The engine strips engine-managed fields on save, so the raw schema can be submitted as-is.
      const newVersion = await createFormVersion(token as string, formId);
      const newSchema = (sourceSchema ?? formSchema ?? {}) as FormType;
      await saveFormVersionSchema(token as string, newVersion.id, newSchema);
      await commitSchema(newVersion.id, newSchema);

      // Refresh the version list and select the new draft in-page. The new version has the highest
      // versionNo, so it becomes the current one as soon as the list comes back.
      await refreshVersions();
      selectVersion('current');

      addNotification({
        text: (
          dict.form.versionDraftCreated || 'Version {version} draft created successfully!'
        ).replace('{version}', String(newVersion.versionNo)),
        type: 'success',
      });
    } catch (e: unknown) {
      addNotification({
        text: dict.form.createVersionError || 'Failed to create new version.',
        type: 'error',
        consoleError: e,
      });
    } finally {
      setIsSaving(false);
    }
  };

  const restoreVersionAsNew = async (version: SobaFormVersionType) => {
    if (!token) return;
    const schema = (await getFormVersionSchema(token, version.id)) as FormType | null;
    await createNewVersion(schema ?? undefined);
  };

  const saveFormPublish = async () => {
    await saveForm(true);
  };

  const saveFormDraft = async () => {
    await saveForm(false);
  };

  // CREATE: one-call create (form + empty v1), scoped to the active workspace, then provision.
  const createAndProvisionForm = async (schema: FormType, publish: boolean) => {
    const data: SobaFormType = { name: formName, description: formDesc };
    const created = await createSobaFormioForm(
      token as string,
      data,
      pickedWorkspaceId || undefined,
    );
    const versionId = created.formVersion?.id;
    if (versionId) {
      await saveFormVersionSchema(token as string, versionId, schema);
      if (publish) {
        await publishSobaFormVersion(token as string, versionId);
      }
    }
    router.push(`/${lang}/designer/${created.id}`);
  };

  const saveForm = async (publish: boolean = false) => {
    if (isSaving || loading) return;
    // Creating a form is workspace-scoped: without a selected workspace the backend
    // rejects the request with a generic error, so surface a clear message instead.
    if (!formId && !pickedWorkspaceId) {
      addNotification({ text: dict.form.noActiveWorkspaceError, type: 'error' });
      return;
    }
    setIsSaving(true);
    const schema = (formSchema ?? {}) as FormType;

    try {
      if (currentVersion?.id) {
        await updateSobaForm(token as string, formId as string, {
          name: formName,
          description: formDesc,
        });
        await saveFormVersionSchema(token as string, currentVersion.id, schema);
        if (publish) {
          await publishSobaFormVersion(token as string, currentVersion.id);
          // Publishing changes the version's state, which gates Save and the read-only notice.
          await refreshVersions();
        }
        await commitSchema(currentVersion.id, schema);
      } else if (!formId) {
        await createAndProvisionForm(schema, publish);
      } else {
        // An existing form whose versions have not arrived. Creating here would file the edits
        // under a second form.
        return;
      }

      // The name is server-owned once saved, so re-read it rather than leaving the edit in place.
      await refreshForm();
      addNotification({
        text: publish ? dict.form.published || 'Form published successfully!' : dict.form.saved,
        type: 'success',
      });
      discardEdits();
    } catch (e: unknown) {
      addNotification({ text: dict.form.saveError, type: 'error', consoleError: e });
    } finally {
      setIsSaving(false);
    }
  };

  if (initializing) {
    return <CenteredProgress label={dict.form.loading} />;
  }

  if (!authenticated) {
    return <div className="p-5 text-center">{dict.general.notAuthenticated}</div>;
  }

  // New-form mode requires a workspace to own the form. Once workspaces have loaded and none
  // qualifies, block designer access with a clear prompt instead of a save failure. Having the
  // permission but no accepted disclaimer is actionable, so it gets its own message.
  // The gate reads the writable list, which is where creatableWorkspaces comes from.
  if (!formId && writableLoaded && creatableWorkspaces.length === 0) {
    const blocked = writableWorkspaces.length
      ? {
          variant: 'warning' as const,
          testId: 'disclaimer-required-alert',
          text: dict.form.disclaimerRequired,
        }
      : {
          variant: 'info' as const,
          testId: 'designer-select-workspace',
          text: dict.form.noActiveWorkspace,
        };
    return (
      <div className="p-4">
        <InlineAlert variant={blocked.variant} data-testid={blocked.testId}>
          {blocked.text}
        </InlineAlert>
      </div>
    );
  }

  const renderFormBuilder = () => {
    if (!formId) {
      return (
        <FormDesigner
          onUpdateModel={setSchema}
          initialModel={null}
          formName={formName}
          isDirty={isDirty}
        />
      );
    }
    if (loading) {
      return <CenteredProgress label={dict.form.loading} />;
    }
    if (!formSchema) {
      return <div className="my-4">{dict.form.schemaNotAvailable}</div>;
    }
    return (
      <FormDesigner
        // FormDesigner takes its model once at mount. Switching to a version already in the cache
        // produces no loading frame, so without this the previous version stays on screen.
        key={activeVersion?.id}
        onUpdateModel={setSchema}
        initialModel={formSchema}
        formName={formName}
        versionNo={currentVersion?.versionNo ?? null}
        state={currentVersion?.state ?? null}
        isDirty={isDirty}
      />
    );
  };

  const getNewVersionLabel = (): string => {
    if (isSaving) return dict.form.creating || 'Creating...';
    if (isHistoryView) return dict.form.restoreAsNewVersion || 'Restore as New Version';
    return dict.form.newVersion || 'New Version';
  };

  const getPublishTitle = (): string => {
    if (isHistoryView) return dict.form.cannotPublishHistory || 'Cannot publish history';
    if (isCurrentPublished) return dict.form.versionAlreadyPublished || 'Version already published';
    if (isDirty) return dict.form.saveChangesBeforePublishing || 'Save changes before publishing';
    return dict.form.publishForm || 'Publish form';
  };

  const renderDesignerContent = () => (
    <>
      <Form
        onSubmit={(e) => e.preventDefault()}
        className="d-flex flex-column gap-3 mb-3"
        style={{ maxWidth: '640px' }}
      >
        <TextField
          label={dict.form.nameLabel}
          value={formName}
          onChange={setName}
          isDisabled={isHistoryView || isCurrentPublished}
        />

        {!formId && creatableWorkspaces.length > 0 && (
          <WorkspaceSelector
            label={dict.workspaces.workspace}
            workspaces={creatableWorkspaces}
            selectedWorkspaceId={selectedWorkspaceId}
            onChange={(id) => setPickedWorkspaceId(id as string)}
            size="medium"
          />
        )}

        {versions.length > 0 && (
          <Select
            data-testid="form-version-select"
            label={dict.form.formVersion || 'Form Version'}
            selectedKey={selectedVersionId || 'current'}
            onSelectionChange={(key) => selectVersion(String(key))}
            items={[
              {
                id: 'current',
                label: `${dict.form.currentDraft || 'Current Draft'}${
                  currentVersion?.versionNo ? ` (v${currentVersion.versionNo})` : ''
                }`,
              },
              ...versions
                .filter((v) => v.id !== currentVersion?.id)
                .map((v) => ({ id: v.id, label: `v${v.versionNo} (${v.state})` })),
            ]}
          />
        )}

        <FormSubmitterAudience
          key={selectedWorkspaceId ?? 'none'}
          workspaceId={selectedWorkspaceId}
          canManage={canManageWorkspace}
        />
      </Form>

      {/* Form Builder */}
      <div className={styles.designerWrapper}>{renderFormBuilder()}</div>

      {/* Spacer so the builder clears the fixed action bar */}
      <div className="mb-5 pb-5" />

      <div
        className={`${styles.floatingActions} shadow-lg p-3 rounded-pill d-flex gap-2 bg-white border`}
      >
        {formId && (
          <Button variant="secondary" onPress={() => createNewVersion()} isDisabled={isSaving || loading}>
            {getNewVersionLabel()}
          </Button>
        )}
        <Button
          variant="primary"
          onPress={saveFormDraft}
          isDisabled={isHistoryView || isCurrentPublished || isSaving || loading}
        >
          {isSaving ? dict.form.saving || 'Saving...' : dict.form.save || 'Save'}
        </Button>
        <Button
          variant="tertiary"
          onPress={() => setShowPreview(true)}
          isDisabled={isSaving || loading}
        >
          {dict.form.preview || 'Preview'}
        </Button>
        {formId && (
          <span className="d-inline-flex" title={getPublishTitle()}>
            <Button
              variant="primary"
              onPress={saveFormPublish}
              isDisabled={isHistoryView || isCurrentPublished || isDirty || isSaving || loading}
            >
              {dict.form.publish || 'Publish'}
            </Button>
          </span>
        )}
      </div>
    </>
  );

  return (
    <>
      {formId ? (
        <Tabs
          id="form-designer-tabs"
          activeKey={activeTab}
          onSelect={(k) => openTab(k || 'designer')}
          className="mb-3"
          // A tab's data is read when it is opened, not before: the reads behind these tabs are
          // gated on permissions a given user may not hold.
          mountOnEnter
        >
          <Tab
            eventKey="designer"
            data-testid="designer-tab"
            title={dict.form.designerTab || 'Designer'}
          >
            {renderDesignerContent()}
          </Tab>
          <Tab
            eventKey="settings"
            data-testid="settings-tab"
            disabled={isSaving || loading}
            title={dict.form.settingsTab || 'Settings'}
          >
            <FormSettingsTab dict={dict} />
          </Tab>
          <Tab
            eventKey="team"
            data-testid="team-tab"
            disabled={isSaving || loading}
            title={dict.form.teamTab || 'Team'}
          >
            <FormTeamTab dict={dict} />
          </Tab>
          <Tab
            eventKey="version"
            data-testid="version-tab"
            disabled={isSaving || loading}
            title={dict.form.historyTab || 'History'}
          >
            <FormHistoryTab
              dict={dict}
              versions={versions}
              loading={loading}
              onSelectVersion={selectVersion}
              onRestoreVersion={restoreVersionAsNew}
              onNavigateToDesigner={() => openTab('designer')}
            />
          </Tab>
          <Tab
            eventKey="submissions"
            data-testid="submission-tab"
            disabled={isSaving || loading}
            title={dict.form.submissionTab || 'Submissions'}
          >
            <FormSubmissionTab
              dict={dict}
              formId={formId}
              opened={openedTabs.includes('submissions')}
            />
          </Tab>
          <Tab
            eventKey="share"
            data-testid="share-tab"
            disabled={isSaving || loading}
            title={dict.form.shareTab || 'Share'}
          >
            <FormShareTab
              dict={dict}
              formId={formId}
              formName={formName}
              formDesc={formDesc}
              workspaceId={selectedWorkspaceId}
            />
          </Tab>
        </Tabs>
      ) : (
        renderDesignerContent()
      )}

      {/* Preview Modal */}
      <CommonModal
        show={showPreview}
        title={`${dict.form.formPreview || 'Form Preview:'} ${formName || dict.form.untitledForm || 'Untitled Form'}`}
        onClose={() => setShowPreview(false)}
        size="lg"
        footer={
          <Button variant="secondary" onPress={() => setShowPreview(false)}>
            {dict.form.closePreview || 'Close Preview'}
          </Button>
        }
      >
        {formSchema ? (
          <DynamicForm src="" form={formSchema} />
        ) : (
          <p className="text-center p-5 text-muted">
            {dict.form.noFormLayout || 'No form layout designed yet.'}
          </p>
        )}
      </CommonModal>
    </>
  );
}

export default FormForm;
