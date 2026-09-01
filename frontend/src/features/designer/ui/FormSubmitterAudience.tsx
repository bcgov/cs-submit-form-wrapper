'use client';
import { useMemo, useRef, useState } from 'react';
import { Popover, Dialog } from 'react-aria-components';
import {
  Button,
  RadioGroup,
  Radio,
  CheckboxGroup,
  Checkbox,
  InlineAlert,
} from '@bcgov/design-system-react-components';
import { useDictionary } from '@/app/[lang]/Providers';
import { getSubmitterAudience, setSubmitterAudience } from '@/src/shared/api/sobaApiGroups';
import { useAuthedSWR } from '@/src/shared/api/useAuthedSWR';
import { loadErrorMessage } from '@/src/shared/api/loadErrorMessage';
import { useKeycloak } from '@/lib/hooks/useKeycloak';
import type { SubmitterAudience } from '@/src/types/groups';
import styles from './FormSubmitterAudience.module.css';

type Props = Readonly<{
  workspaceId: string | null;
  canManage: boolean;
}>;

export function FormSubmitterAudience({ workspaceId, canManage }: Props) {
  const dict = useDictionary();
  const t = dict.form;
  const { token } = useKeycloak();
  const [mode, setMode] = useState('');
  const [idps, setIdps] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const triggerRef = useRef<HTMLSpanElement>(null);

  const {
    data: audience,
    error: loadError,
    mutate,
  } = useAuthedSWR<SubmitterAudience>(
    workspaceId ? ['submitter-audience', workspaceId] : null,
    (authToken) => getSubmitterAudience(authToken, workspaceId as string),
  );

  // Reading the audience needs a workspace permission the form's designer need not hold, so the
  // no-access branch is a normal outcome here rather than a misconfiguration.
  const readError = useMemo(
    () =>
      loadError
        ? loadErrorMessage(loadError, {
            sessionExpired: dict.general.sessionExpired,
            noAccess: dict.general.noAccess,
            failed: t.submitterAudienceLoadError,
          })
        : null,
    [loadError, dict.general.sessionExpired, dict.general.noAccess, t.submitterAudienceLoadError],
  );

  // Seed the editable state from the saved audience whenever the panel opens.
  const openPanel = () => {
    if (!audience) return;
    setMode(audience.mode === 'none' ? '' : audience.mode);
    setIdps(audience.mode === 'protected' ? audience.idps : []);
    setSaveError(null);
    setOpen(true);
  };

  const summary = useMemo(() => {
    if (!audience) return '…';
    if (audience.mode === 'public') return t.submitterAudiencePublic;
    if (audience.mode === 'none') return t.submitterAudienceNotSet;
    const names = audience.idps.map((c) => audience.available.find((p) => p.code === c)?.name ?? c);
    if (audience.users.length) names.push(`${audience.users.length} ${t.submitterAudiencePeople}`);
    return `${t.submitterAudienceProtected} (${names.join(', ')})`;
  }, [audience, t]);

  // Protected needs a principal; an existing direct user counts even with no idps selected.
  const noPrincipal =
    mode === 'protected' && idps.length === 0 && (audience?.users.length ?? 0) === 0;
  const saveDisabled = saving || mode === '' || noPrincipal;

  const onSave = async () => {
    if (!workspaceId || !token) return;
    setSaving(true);
    setSaveError(null);
    try {
      const body =
        mode === 'public' ? ({ mode: 'public' } as const) : ({ mode: 'protected', idps } as const);
      await mutate(setSubmitterAudience(token, workspaceId, body), { revalidate: false });
      setOpen(false);
    } catch {
      setSaveError(t.submitterAudienceSaveError);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.field}>
      <span className={styles.label}>{t.submitterAudienceLabel}</span>
      {readError ? (
        // The control cannot open without an audience, so a refusal would otherwise show as a
        // disabled button with no reason given.
        <InlineAlert variant="warning" data-testid="submitter-audience-error" title={readError} />
      ) : (
        <span ref={triggerRef} className={styles.triggerWrap}>
          <Button
            variant="secondary"
            isDisabled={!canManage || !audience}
            onPress={openPanel}
            data-testid="submitter-audience-trigger"
          >
            {summary}
          </Button>
        </span>
      )}
      <Popover
        triggerRef={triggerRef}
        isOpen={open}
        onOpenChange={setOpen}
        className={styles.panel}
      >
        <Dialog aria-label={t.submitterAudienceLabel} className={styles.dialog}>
          <div className={styles.sections}>
            {saveError && <InlineAlert variant="danger" title={saveError} />}
            <RadioGroup value={mode} onChange={setMode} label={t.submitterAudienceLabel}>
              <Radio value="public" data-testid="audience-mode-public">
                {t.submitterAudiencePublic}
              </Radio>
              <Radio value="protected" data-testid="audience-mode-protected">
                {t.submitterAudienceProtected}
              </Radio>
            </RadioGroup>
            {mode === 'protected' && (
              <CheckboxGroup value={idps} onChange={setIdps} label={t.submitterAudienceProviders}>
                {(audience?.available ?? []).map((p) => (
                  <Checkbox key={p.code} value={p.code} data-testid={`audience-idp-${p.code}`}>
                    {p.name}
                  </Checkbox>
                ))}
              </CheckboxGroup>
            )}
            <div className={styles.actions}>
              <Button
                variant="tertiary"
                onPress={() => setOpen(false)}
                data-testid="audience-cancel"
              >
                {t.submitterAudienceCancel}
              </Button>
              <Button onPress={onSave} isDisabled={saveDisabled} data-testid="audience-save">
                {t.submitterAudienceSave}
              </Button>
            </div>
          </div>
        </Dialog>
      </Popover>
    </div>
  );
}
