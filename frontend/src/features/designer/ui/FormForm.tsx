'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
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
import FormSettingsTab from './FormSettingsTab';
import FormTeamTab from './FormTeamTab';
import { FormSubmitterAudience } from './FormSubmitterAudience';
import { isWorkspaceManageRole } from '@/src/features/workspaces/workspaceRoles';
import { useAppSelector } from '@/lib/store';
import { useNotificationStore } from '@/lib/hooks/useNotificationStore';

import {
  createSobaFormioForm,
  createFormVersion,
  saveFormVersionSchema,
  getFormVersionSchema,
  getSobaForm,
  getSobaFormVersions,
  publishSobaFormVersion,
} from '@/src/shared/api/sobaApi';
import type { SobaFormType, SobaFormVersionType } from '@/src/types/forms';
import { isSessionExpired } from '@/src/shared/api/sobaFetch';

function FormForm({ formId }: { formId?: string }) {
  const dict = useDictionary();
  const router = useRouter();
  const params = useParams();
  const lang = params.lang as string;

  const { authenticated, token, initializing } = useKeycloak();
  const {
    activeWorkspaceId,
    status: workspaceStatus,
    workspaces,
  } = useAppSelector((state) => state.workspace);
  const { addNotification } = useNotificationStore();
  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId);
  const canManageWorkspace = !!activeWorkspace && isWorkspaceManageRole(activeWorkspace.role);
  // A new form can't be created until the workspace disclaimer is accepted (backend gate).
  const needsDisclaimer = !formId && !!activeWorkspace && !activeWorkspace.disclaimerAccepted;
  const [activeTab, setActiveTab] = useState('designer');
  const [formName, setFormName] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formSchema, setFormSchema] = useState<FormType | null>(null);
  const [currentVersion, setCurrentVersion] = useState<SobaFormVersionType | null>(null);

  const [versions, setVersions] = useState<SobaFormVersionType[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [isHistoryView, setIsHistoryView] = useState(false);
  const [historicalVersionNo, setHistoricalVersionNo] = useState<number | null>(null);

  const [loading, setLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  // Load once per form. `token` is a dep (the load needs one), but a rotation mints a new token for
  // the same user — reloading on that would blank the builder and drop unsaved edits with isDirty.
  const loadedFormRef = useRef<string | null>(null);

  useEffect(() => {
    if (formId && token && loadedFormRef.current !== formId) {
      loadedFormRef.current = formId;
      async function loadForm() {
        setLoading(true);
        try {
          const [form, versionsData] = await Promise.all([
            getSobaForm(token as string, formId as string),
            getSobaFormVersions(token as string, formId as string),
          ]);

          setFormName(form?.name ?? '');
          setFormDesc(form?.description ?? '');

          const items = versionsData.items || [];
          setVersions(items);

          // Default to the highest versionNo (the current/latest version).
          const current = items.reduce<SobaFormVersionType | null>(
            (acc, v) => (!acc || v.versionNo > acc.versionNo ? v : acc),
            null,
          );
          setCurrentVersion(current);
          setSelectedVersionId('current');
          setIsHistoryView(false);

          if (current?.id) {
            const schema = await getFormVersionSchema(token as string, current.id);
            setFormSchema((schema as FormType) ?? null);
          } else {
            setFormSchema(null);
          }
          setIsDirty(false);
        } catch (e: unknown) {
          addNotification({
            text: isSessionExpired(e)
              ? dict.general.sessionExpired
              : `${dict.form.loadFormError || 'Failed to load form:'} ${(e as Error).message}`,
            type: 'error',
            consoleError: e,
          });
        } finally {
          setLoading(false);
        }
      }
      loadForm();
    }
  }, [formId, token, dict.form.loadFormError, dict.general.sessionExpired, addNotification]);

  const handleNameChange = useCallback((name: string) => {
    setFormName(name);
    setIsDirty(true);
  }, []);

  const updateFormSchema = useCallback((data: FormType) => {
    setFormSchema(data);
    setIsDirty(true);
  }, []);

  const loadVersionSchema = async (version: SobaFormVersionType) => {
    setLoading(true);
    try {
      const schema = await getFormVersionSchema(token as string, version.id);
      setFormSchema((schema as FormType) ?? null);
      setIsDirty(false);
    } catch (err) {
      addNotification({
        text: dict.form.loadVersionSchemaError || 'Failed to load version schema.',
        type: 'error',
        consoleError: err,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleVersionChange = async (versionId: string) => {
    if (!token) return;

    if (versionId === 'current') {
      setIsHistoryView(false);
      setSelectedVersionId('current');
      setHistoricalVersionNo(null);
      if (currentVersion) await loadVersionSchema(currentVersion);
      return;
    }

    const targetVersion = versions.find((v: SobaFormVersionType) => v.id === versionId);
    if (!targetVersion) return;

    setIsHistoryView(true);
    setSelectedVersionId(versionId);
    setHistoricalVersionNo(targetVersion.versionNo);
    await loadVersionSchema(targetVersion);
  };

  const isCurrentPublished = currentVersion?.state === 'published';

  const createNewVersion = async () => {
    if (isSaving || loading || !token) return;
    if (!formId) return;
    setIsSaving(true);
    setLoading(true);

    try {
      // The engine strips engine-managed fields on save, so the raw schema can be submitted as-is.
      const newVersion = await createFormVersion(token as string, formId);
      await saveFormVersionSchema(token as string, newVersion.id, (formSchema ?? {}) as FormType);

      // Refresh the version list and select the new draft in-page.
      const versionsData = await getSobaFormVersions(token as string, formId);
      setVersions(versionsData.items || []);
      setCurrentVersion(newVersion);
      setSelectedVersionId('current');
      setIsHistoryView(false);
      setIsDirty(false);

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
      setLoading(false);
    }
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
    const created = await createSobaFormioForm(token as string, data, activeWorkspaceId || undefined);
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
    // Creating a form is workspace-scoped: without an active workspace the backend
    // rejects the request with a generic error, so surface a clear message instead.
    if (!formId && !activeWorkspaceId) {
      addNotification({ text: dict.form.noActiveWorkspaceError, type: 'error' });
      return;
    }
    setIsSaving(true);
    const schema = (formSchema ?? {}) as FormType;

    try {
      if (currentVersion?.id) {
        // UPDATE: re-provision the current version's schema (server owns name/path).
        await saveFormVersionSchema(token as string, currentVersion.id, schema);
        if (publish) {
          await publishSobaFormVersion(token as string, currentVersion.id);
        }
      } else {
        await createAndProvisionForm(schema, publish);
      }

      addNotification({
        text: publish ? dict.form.published || 'Form published successfully!' : dict.form.saved,
        type: 'success',
      });
      setIsDirty(false);
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

  // New-form mode requires a workspace to own the form. Once workspaces have loaded and
  // the user has none, block designer access with a clear prompt instead of a save failure.
  if (!formId && workspaceStatus === 'succeeded' && workspaces.length === 0) {
    return (
      <div className="p-4">
        <InlineAlert variant="info" data-testid="designer-select-workspace">
          {dict.form.noActiveWorkspace}
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
    if (isCurrentPublished)
      return dict.form.versionAlreadyPublished || 'Version already published';
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
          key={activeWorkspaceId ?? 'none'}
          workspaceId={activeWorkspaceId}
          token={token ?? undefined}
          canManage={canManageWorkspace}
        />

        {needsDisclaimer && (
          <InlineAlert
            variant="warning"
            title={
              dict.form.disclaimerRequired ||
              'Accept the workspace disclaimer in workspace Settings before creating a form.'
            }
            data-testid="disclaimer-required-alert"
          />
        )}
      </Form>

      {/* Form Builder */}
      <div className={styles.designerWrapper}>{renderFormBuilder()}</div>

      {/* Spacer so the builder clears the fixed action bar */}
      <div className="mb-5 pb-5" />

      <div
        className={`${styles.floatingActions} shadow-lg p-3 rounded-pill d-flex gap-2 bg-white border`}
      >
        {formId && (
          <Button
            variant="secondary"
            onPress={createNewVersion}
            isDisabled={isSaving || loading}
          >
            {getNewVersionLabel()}
          </Button>
        )}
        <Button
          variant="primary"
          onPress={saveFormDraft}
          isDisabled={isHistoryView || isCurrentPublished || isSaving || loading || needsDisclaimer}
        >
          {isSaving ? dict.form.saving || 'Saving...' : dict.form.save || 'Save'}
        </Button>
        <Button variant="tertiary" onPress={() => setShowPreview(true)} isDisabled={isSaving || loading}>
          {dict.form.preview || 'Preview'}
        </Button>
        {formId && (
          <span
            className="d-inline-flex"
            title={getPublishTitle()}
          >
            <Button
              variant="primary"
              onPress={saveFormPublish}
              isDisabled={
                isHistoryView ||
                isCurrentPublished ||
                isDirty ||
                isSaving ||
                loading
              }
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

      {isHistoryView && (
        <div className="mb-4">
          <InlineAlert
            variant="info"
            buttons={
              <Button
                size="small"
                variant="secondary"
                onPress={() => handleVersionChange('current')}
              >
                {dict.form.switchToCurrentDraft ||
                  'Switch to ' + (dict.form.currentDraft || 'Current Draft')}
              </Button>
            }
          >
            <strong>{dict.form.readOnlyMode || 'Read-Only Mode:'}</strong>{' '}
            {dict.form.viewingHistoricalVersion || 'You are viewing historical version'}{' '}
            <strong>v{historicalVersionNo}</strong>.{' '}
            {dict.form.savePublishDisabled || 'Save and Publish options are disabled.'}
          </InlineAlert>
        </div>
      )}

      {!isHistoryView && isCurrentPublished && (
        <div className="mb-4">
          <InlineAlert variant="info">
            <strong>{dict.form.publishedVersion || 'Published Version:'}</strong>{' '}
            {dict.form.publishedVersionCannotBeModified ||
              'This version is published and cannot be modified'}
          </InlineAlert>
        </div>
      )}

      {formId ? (
        <Tabs
          id="form-designer-tabs"
          activeKey={activeTab}
          onSelect={(k) => setActiveTab(k || 'designer')}
          className="mb-3"
        >
          <Tab eventKey="designer" title={dict.form.designerTab || 'Designer'}>
            {renderDesignerContent()}
          </Tab>
          <Tab eventKey="settings" title={dict.form.settingsTab || 'Settings'}>
            <FormSettingsTab dict={dict} />
          </Tab>
          <Tab eventKey="team" title={dict.form.teamTab || 'Team'}>
            <FormTeamTab dict={dict} />
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
