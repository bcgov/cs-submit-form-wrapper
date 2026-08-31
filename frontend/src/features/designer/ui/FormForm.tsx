'use client';
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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
import { usePageHeading, usePageNotices } from '@/src/components/PageHeader';
import FormSettingsTab from './FormSettingsTab';
import FormTeamTab from './FormTeamTab';
import FormHistoryTab from './FormHistoryTab';
import FormSubmissionTab from './FormSubmissionTab';
import FormShareTab from './FormShareTab';
import { FormSubmitterAudience } from './FormSubmitterAudience';
import { isWorkspaceManageRole } from '@/src/features/workspaces/workspaceRoles';
import { useAppSelector, useAppDispatch } from '@/lib/store';
import { useNotificationStore } from '@/lib/hooks/useNotificationStore';
import type { SobaFormVersionType } from '@/src/types/forms';

import {
  loadForm,
  loadVersionSchemaThunk,
  createNewVersionThunk,
  saveFormThunk,
  setFormName,
  setFormSchema,
  setSelectedVersionId,
  setFormWorkspaceId,
  clearFormState,
} from '@/lib/slices/formSlice';

function FormForm({ formId }: { formId?: string }) {
  const dict = useDictionary();
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const lang = params.lang as string;

  const { authenticated, token, initializing } = useKeycloak();
  const {
    status: workspaceStatus,
    workspaces,
    writableWorkspaces,
  } = useAppSelector((state) => state.workspace);

  const dispatch = useAppDispatch();
  const {
    formName,
    formWorkspaceId,
    formDesc,
    formSchema,
    currentVersion,
    versions,
    selectedVersionId,
    isHistoryView,
    historicalVersionNo,
    loading,
    isSaving,
    isDirty,
    error,
    isSessionExpiredError,
  } = useAppSelector((state) => state.form);

  const { addNotification } = useNotificationStore();
  // A new form can only go to a workspace the user can create in whose disclaimer is accepted
  // (the backend rejects the rest), so those are the only ones ever offered.
  const creatableWorkspaces = useMemo(
    () => writableWorkspaces.filter((w) => w.disclaimerAccepted),
    [writableWorkspaces],
  );

  const activeWorkspace = workspaces.find((w) => w.id === formWorkspaceId);
  const canManageWorkspace = !!activeWorkspace && isWorkspaceManageRole(activeWorkspace.role);
  const tabParam = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState(tabParam || 'designer');

  useEffect(() => {
    if (tabParam) {
      const setTab = () => {
        setActiveTab(tabParam);
      };
      setTab();
    }
  }, [tabParam]);

  const [showPreview, setShowPreview] = useState(false);
  // Load once per form. `token` is a dep (the load needs one), but a rotation mints a new token for
  // the same user — reloading on that would blank the builder and drop unsaved edits with isDirty.
  const loadedFormRef = useRef<string | null>(null);

  useEffect(() => {
    if (formId && token && loadedFormRef.current !== formId) {
      loadedFormRef.current = formId;
      dispatch(loadForm({ token: token as string, formId }));
    }
  }, [formId, token, dispatch]);

  useEffect(() => {
    return () => {
      dispatch(clearFormState());
    };
  }, [dispatch]);

  useEffect(() => {
    if (error) {
      addNotification({
        text: isSessionExpiredError
          ? dict.general.sessionExpired
          : `${dict.form.loadFormError || 'Failed to load form:'} ${error}`,
        type: 'error',
      });
    }
  }, [
    error,
    isSessionExpiredError,
    dict.general.sessionExpired,
    dict.form.loadFormError,
    addNotification,
  ]);

  const handleNameChange = useCallback(
    (name: string) => {
      dispatch(setFormName(name));
    },
    [dispatch],
  );

  const updateFormSchema = useCallback(
    (data: FormType) => {
      dispatch(setFormSchema(data));
    },
    [dispatch],
  );

  const handleVersionChange = async (versionId: string) => {
    if (!token) return;

    if (versionId === 'current') {
      dispatch(setSelectedVersionId('current'));
      if (currentVersion) {
        dispatch(loadVersionSchemaThunk({ token: token as string, version: currentVersion }));
      }
      return;
    }

    const targetVersion = versions.find((v: SobaFormVersionType) => v.id === versionId);
    if (!targetVersion) return;

    dispatch(loadVersionSchemaThunk({ token: token as string, version: targetVersion }));
  };

  const isCurrentPublished = currentVersion?.state === 'published';

  usePageHeading({
    // Editing claims no heading until the name arrives, so the page's own stands rather than
    // flashing the create-form label on an existing form.
    heading: formId ? formName || undefined : dict.form.createForm,
    eyebrow: formId && formWorkspaceId ? activeWorkspace?.name || formWorkspaceId : undefined,
  });

  usePageNotices([
    isHistoryView && {
      id: 'history-view',
      variant: 'info' as const,
      title: dict.form.readOnlyMode || 'Read-Only Mode:',
      body: `${dict.form.viewingHistoricalVersion || 'You are viewing historical version'} v${historicalVersionNo}. ${dict.form.savePublishDisabled || 'Save and Publish options are disabled.'}`,
      action: {
        label:
          dict.form.switchToCurrentDraft ||
          'Switch to ' + (dict.form.currentDraft || 'Current Draft'),
        onPress: () => handleVersionChange('current'),
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
  ]);

  const createNewVersion = async () => {
    if (isSaving || loading || !token) return;
    if (!formId) return;

    try {
      await dispatch(
        createNewVersionThunk({
          token: token as string,
          formId,
          formSchema: (formSchema ?? {}) as FormType,
        }),
      ).unwrap();

      addNotification({
        text: (
          dict.form.versionDraftCreated || 'Version {version} draft created successfully!'
        ).replace('{version}', String((currentVersion?.versionNo ?? 0) + 1)),
        type: 'success',
      });
    } catch (e: unknown) {
      addNotification({
        text:
          e instanceof Error
            ? e.message
            : dict.form.createVersionError || 'Failed to create new version.',
        type: 'error',
      });
    }
  };

  const saveFormPublish = async () => {
    await saveForm(true);
  };

  const saveFormDraft = async () => {
    await saveForm(false);
  };

  const saveForm = async (publish: boolean = false) => {
    if (isSaving || loading) return;
    // Creating a form is workspace-scoped: without a selected workspace the backend
    // rejects the request with a generic error, so surface a clear message instead.
    if (!formId && !formWorkspaceId) {
      addNotification({ text: dict.form.noActiveWorkspaceError, type: 'error' });
      return;
    }

    try {
      const result = await dispatch(
        saveFormThunk({
          token: token as string,
          formId: formId ?? null,
          formName,
          formDesc,
          selectedWorkspaceId: formWorkspaceId,
          formSchema: (formSchema ?? {}) as FormType,
          publish,
          currentVersionId: currentVersion?.id,
        }),
      ).unwrap();

      addNotification({
        text: publish ? dict.form.published || 'Form published successfully!' : dict.form.saved,
        type: 'success',
      });

      if (result.isNew && result.createdId) {
        router.push(`/${lang}/designer/${result.createdId}`);
      }
    } catch (e: unknown) {
      addNotification({ text: (e as Error).message || dict.form.saveError, type: 'error' });
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
  if (!formId && workspaceStatus === 'succeeded' && creatableWorkspaces.length === 0) {
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
          onUpdateModel={updateFormSchema}
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
        onUpdateModel={updateFormSchema}
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
          onChange={handleNameChange}
          isDisabled={isHistoryView || isCurrentPublished}
        />

        {!formId && creatableWorkspaces.length > 0 && (
          <WorkspaceSelector
            label={dict.workspaces.workspace}
            workspaces={creatableWorkspaces}
            selectedWorkspaceId={formWorkspaceId}
            onChange={(id) => {
              dispatch(setFormWorkspaceId(id as string));
            }}
            size="medium"
            className=""
          />
        )}

        {versions.length > 0 && (
          <Select
            label={dict.form.formVersion || 'Form Version'}
            selectedKey={selectedVersionId || 'current'}
            onSelectionChange={(key) => handleVersionChange(String(key))}
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
          key={formWorkspaceId || 'none'}
          workspaceId={formWorkspaceId || null}
          token={token ?? undefined}
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
          <Button variant="secondary" onPress={createNewVersion} isDisabled={isSaving || loading}>
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
          onSelect={(k) => setActiveTab(k || 'designer')}
          className="mb-3"
        >
          <Tab
            eventKey="designer"
            title={dict.form.designerTab || 'Designer'}
            data-testid="designer-tab"
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
            <FormHistoryTab dict={dict} onNavigateToDesigner={() => setActiveTab('designer')} />
          </Tab>
          <Tab
            eventKey="submissions"
            data-testid="submission-tab"
            disabled={isSaving || loading}
            title={dict.form.submissionTab || 'Submissions'}
          >
            <FormSubmissionTab dict={dict} />
          </Tab>
          <Tab
            eventKey="share"
            data-testid="share-tab"
            disabled={isSaving || loading}
            title={dict.form.shareTab || 'Share'}
          >
            <FormShareTab dict={dict} />
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
