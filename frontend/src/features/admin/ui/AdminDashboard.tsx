'use client';

import { useState } from 'react';
import { Tab, Tabs } from 'react-bootstrap';
import { CenteredProgress } from '@/app/ui/base/CenteredProgress';
import { DsPageHeading } from '@/app/ui/DsPageHeading';
import { ListPageAuthGate, ListPageLayout } from '@/src/components/ListPageLayout';
import { useDictionary } from '@/app/[lang]/Providers';
import { useKeycloak } from '@/lib/hooks/useKeycloak';
import { useIsSobaAdmin } from '../useIsSobaAdmin';
import { DocumentGenerationAuditsPanel } from './DocumentGenerationAuditsPanel';
import { FeatureScopeListPanel } from './FeatureScopeListPanel';
import { SobaAdminsPanel } from './SobaAdminsPanel';

/**
 * Platform administration console. Rendered only for holders of the `soba_admin` role; the
 * backend `/admin/*` routes enforce the same rule, so this gate is presentation-only.
 */
export function AdminDashboard({
  defaultActiveTab = 'admins',
  documentGenerationEnabled = false,
  scopedFeatureCodes = [],
}: Readonly<{
  defaultActiveTab?: string;
  documentGenerationEnabled?: boolean;
  scopedFeatureCodes?: string[];
}>) {
  const dict = useDictionary();
  const dictAdmin = dict.admin;
  const { authenticated, initializing } = useKeycloak();
  const { isSobaAdmin } = useIsSobaAdmin();
  const [activeTab, setActiveTab] = useState(defaultActiveTab);

  if (initializing) {
    return <CenteredProgress label={dict.general.loading} />;
  }

  if (!authenticated) {
    return <ListPageAuthGate>{dict.general.notAuthenticated}</ListPageAuthGate>;
  }

  if (!isSobaAdmin) {
    return <ListPageAuthGate>{dictAdmin.forbidden}</ListPageAuthGate>;
  }

  return (
    <ListPageLayout>
      <DsPageHeading id="admin-heading">{dictAdmin.heading}</DsPageHeading>
      <Tabs
        activeKey={activeTab}
        onSelect={(key) => setActiveTab(key ?? 'admins')}
        id="admin-tabs"
        data-testid="admin-tabs"
      >
        <Tab eventKey="admins" title={dictAdmin.admins.heading}>
          {activeTab === 'admins' ? <SobaAdminsPanel /> : null}
        </Tab>
        <Tab eventKey="featureScopes" title={dictAdmin.featureScopes.heading}>
          {activeTab === 'featureScopes' ? (
            <FeatureScopeListPanel scopedFeatureCodes={scopedFeatureCodes} />
          ) : null}
        </Tab>
        {documentGenerationEnabled ? (
          <Tab eventKey="audits" title={dictAdmin.audits.heading}>
            {activeTab === 'audits' ? <DocumentGenerationAuditsPanel /> : null}
          </Tab>
        ) : null}
      </Tabs>
    </ListPageLayout>
  );
}

export default AdminDashboard;
