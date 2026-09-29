import { env } from '@/app/config/env';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { ButtonLink } from '@/components/ui/Button';
import { Panel } from '@/components/ui/Panel';
import { BIEmbed } from './BIEmbed';
import { resolveBIConfig } from './biProvider';

export function BIPage() {
  const config = resolveBIConfig(env);
  return (
    <>
      <PageHeader
        title="Tableaux BI"
        description="Rapports de l’outil décisionnel de l’entreprise, intégrés à l’application."
        meta={config.status === 'configured' ? <Badge tone="success">Connecté · {config.origin}</Badge> : <Badge>Non connecté</Badge>}
        actions={<ButtonLink to="/reporting">Reporting intégré</ButtonLink>}
      />
      <Panel flush>
        <BIEmbed config={config} title="Rapport BI intégré" />
      </Panel>
    </>
  );
}
