'use client';

import React, { useMemo, useRef, useCallback, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import dynamic from 'next/dynamic';
import { ensureBcgovFormioRegistered } from '@/src/features/formio-v5/registerBcgovFormio';

import { useFormioV5FormChrome } from '@/lib/hooks/useFormioV5FormChrome';

import { useDictionary } from '@/app/[lang]/Providers';
import { useKeycloak } from '@/lib/hooks/useKeycloak';
import type { FormType, FormBuilderProps } from '@formio/react';
import './FormDesigner.module.css';
import { CenteredProgress } from '@/app/ui/base/CenteredProgress';
import { useNotificationStore } from '@/lib/hooks/useNotificationStore';
import { normalizeFormSchema } from '@/src/shared/api/sobaApi';
import { buildExportFilename } from '@/src/features/designer/exportFilename';

// Import Types
import type { FormBuilder as FormioBuilderInstance } from '@formio/js';
import { isSessionExpired } from '@/src/shared/api/sobaFetch';

/**
 * We use a type assertion on the dynamic import to ensure
 * the compiler recognizes the props correctly and satisfies strict linting.
 */
const FormBuilder = dynamic(
  async () => {
    // Feature-gated registration of the bcgov components + CHEFS provider before the builder loads.
    const [mod] = await Promise.all([import('@formio/react'), ensureBcgovFormioRegistered()]);
    return mod.FormBuilder;
  },
  { ssr: false },
) as React.ComponentType<FormBuilderProps>;

interface DesignerProps {
  onUpdateModel: (data: FormType) => void;
  initialModel?: FormType | null;
  /** Metadata for the export filename (lives in the parent FormForm). */
  formName?: string;
  versionNo?: number | null;
  state?: string | null;
  isDirty?: boolean;
}

const FormDesigner: React.FC<DesignerProps> = ({
  onUpdateModel,
  initialModel = null,
  formName = '',
  versionNo = null,
  state = null,
  isDirty = false,
}) => {
  const { authenticated, initializing, token } = useKeycloak();
  const dict = useDictionary();
  const { addNotification } = useNotificationStore();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  // Inject the Form.io builder CSS (layered) only while the builder is mounted.
  useFormioV5FormChrome('build');
  const builderRef = useRef<FormioBuilderInstance | null>(null);

  /**
   * Lazy initializer so this runs once and gives the builder's `form` prop a
   * stable reference (satisfies ESLint's `react-hooks/refs` rule). We assume a
   * valid Form.io v5 schema from the engine, so no client-side fix-ups.
   */
  const [stableForm] = useState<FormType>(() => initialModel ?? { components: [] });

  // Whether any bcgov component is enabled (today just BC File Upload, gated on `files`).
  // Controls whether the 'BC Gov' builder group shows.
  const [bcgovEnabled, setBcgovEnabled] = useState(false);
  useEffect(() => {
    let active = true;
    void ensureBcgovFormioRegistered().then((r) => {
      if (active) setBcgovEnabled(r.filesEnabled);
    });
    return () => {
      active = false;
    };
  }, []);

  const opt = useMemo(
    () => ({
      language: dict.locale,
      i18n: { [dict.locale]: dict },
      useWorker: false,
      display: 'form' as const,
      builder: {
        basic: {
          title: 'Basic',
          weight: 0,
          default: true,
        },
        advanced: {
          title: 'Advanced',
          weight: 10,
          default: false,
        },
        data: {
          title: 'Data',
          weight: 20,
          default: false,
        },
        layout: {
          title: 'Layout',
          weight: 30,
          default: false,
        },
        // Only shown when there is at least one enabled bcgov component (currently BC File Upload).
        ...(bcgovEnabled ? { bcgov: { title: 'BC Gov', weight: 5, default: false } } : {}),
        premium: false,
      },
    }),
    [dict, bcgovEnabled],
  );

  const [sidebarEl, setSidebarEl] = useState<HTMLElement | null>(null);

  const handleBuilderReady = useCallback((builder: FormioBuilderInstance) => {
    builderRef.current = builder;
    if (builder.element) {
      const sidebar = (builder.element as HTMLElement).querySelector(
        '.builder-sidebar',
      ) as HTMLElement;
      if (sidebar) {
        setSidebarEl(sidebar);
      }
    }
  }, []);

  // Form.io's `builder.form` getter returns the initial definition, not live edits, so we
  // track the latest schema from onChange — export reads this so unsaved changes are included.
  const liveSchemaRef = useRef<FormType | null>(null);
  const handleChange = useCallback(
    (schema: FormType) => {
      liveSchemaRef.current = schema;
      onUpdateModel(schema);
    },
    [onUpdateModel],
  );

  // Export the live builder design (may be unsaved): normalize it on the server (same operation
  // as import) to a clean, portable form definition, then download.
  const handleExport = useCallback(async () => {
    if (!token) return;
    try {
      const schema = (liveSchemaRef.current ?? stableForm) as Record<string, unknown>;
      const clean = await normalizeFormSchema(token, schema);
      const blob = new Blob([JSON.stringify(clean, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = buildExportFilename(formName, versionNo, state, isDirty);
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      addNotification({
        text: isSessionExpired(err)
          ? dict.general.sessionExpired
          : dict.form.invalidJson || 'Invalid JSON format.',
        type: 'error',
      });
    }
  }, [
    token,
    formName,
    versionNo,
    state,
    isDirty,
    stableForm,
    addNotification,
    dict.form.invalidJson,
    dict.general.sessionExpired,
  ]);

  const handleImportClick = useCallback(() => fileInputRef.current?.click(), []);

  // Upload a schema file → server applies the CHEFS-1 transform → load the result into the builder.
  const handleFileSelected = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = ''; // reset so selecting the same file again still fires onChange
      if (!file || !token) return;
      try {
        const raw = JSON.parse(await file.text()) as Record<string, unknown>;
        const transformed = (await normalizeFormSchema(token, raw)) as FormType;
        // Update the EXISTING builder in place. Re-creating @formio/react's FormBuilder
        // (by changing `initialForm`/`key`) orphans the underlying instance, and its
        // unguarded `updateComponent` handler then reads `builder.instance.form` on the
        // dead instance — crashing the component-edit dialog. `setForm` avoids all that.
        const instance = (
          builderRef.current as unknown as {
            instance?: { setForm?: (form: unknown) => Promise<unknown> };
          } | null
        )?.instance;
        if (instance?.setForm) {
          await instance.setForm(transformed);
        }
        liveSchemaRef.current = transformed;
        if (onUpdateModel) onUpdateModel(transformed);
      } catch (err) {
        addNotification({
          text: isSessionExpired(err)
            ? dict.general.sessionExpired
            : dict.form.invalidJson || 'Invalid JSON format.',
          type: 'error',
        });
      }
    },
    [token, onUpdateModel, addNotification, dict.form.invalidJson, dict.general.sessionExpired],
  );

  if (initializing) {
    return <CenteredProgress label={dict.form.loading} />;
  }

  if (!authenticated) {
    return <div className="p-5 text-center">{dict.general.loginRequired}</div>;
  }

  return (
    <section className="p-4 w-100 min-vh-100 position-relative">
      {sidebarEl &&
        createPortal(
          <div className="p-2 mt-2 border-top bg-light">
            <button
              className="mb-2 d-block btn btn-sm btn-outline-secondary w-100"
              onClick={handleExport}
            >
              {dict.form.exportJson || 'Export JSON'}
            </button>
            <button
              className="d-block btn btn-sm btn-outline-secondary w-100"
              onClick={handleImportClick}
            >
              {dict.form.importJson || 'Import JSON'}
            </button>
          </div>,
          sidebarEl,
        )}

      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
        className="d-none"
        data-testid="designer-import-file"
        onChange={handleFileSelected}
      />

      <FormBuilder
        initialForm={stableForm}
        options={opt}
        onChange={handleChange}
        onBuilderReady={handleBuilderReady}
      />
    </section>
  );
};

export default FormDesigner;
