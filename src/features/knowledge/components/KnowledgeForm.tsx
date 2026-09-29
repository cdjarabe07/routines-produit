import { Button } from '@/components/ui/Button';
import { FormActions, FormGrid, SelectField, TextAreaField, TextField } from '@/components/ui/Field';
import { KNOWLEDGE_CATEGORY, options } from '@/features/shared/labels';
import { useForm } from '@/hooks/useForm';
import type { KnowledgeCategory, KnowledgeItem, KnowledgeKind, KnowledgeStatus } from '@/types/domain';
import { httpsUrl, maxLength, required } from '@/utils/validation';
import { useSaveKnowledge } from '../api';

interface Values {
  code: string;
  title: string;
  category: KnowledgeCategory;
  kind: KnowledgeKind;
  summary: string;
  keyPoints: string;
  url: string;
  version: string;
  owner: string;
  status: KnowledgeStatus;
}

export function KnowledgeForm({ item, onDone }: { item?: KnowledgeItem; onDone: (saved?: KnowledgeItem) => void }) {
  const save = useSaveKnowledge();
  const form = useForm<Values>({
    initial: {
      code: item?.code ?? '',
      title: item?.title ?? '',
      category: item?.category ?? 'standard',
      kind: item?.kind ?? 'standard',
      summary: item?.summary ?? '',
      keyPoints: item?.keyPoints.join('\n') ?? '',
      url: item?.url ?? '',
      version: item?.version ?? '1.0',
      owner: item?.owner ?? '',
      status: item?.status ?? 'published',
    },
    rules: {
      code: [required('Code obligatoire'), maxLength(20)],
      title: [required('Titre obligatoire')],
      summary: [required('Résumé obligatoire'), maxLength(400)],
      version: [required('Indiquez la version')],
      owner: [required('Indiquez le propriétaire du document')],
      url: [httpsUrl()],
    },
    onSubmit: async (v) => {
      if (v.kind === 'link' && !v.url.trim()) return;
      const saved = await save.mutateAsync({
        id: item?.id,
        input: {
          code: v.code.trim().toUpperCase(),
          title: v.title.trim(),
          category: v.category,
          kind: v.kind,
          summary: v.summary.trim(),
          keyPoints: v.keyPoints
            .split('\n')
            .map((p) => p.trim())
            .filter(Boolean),
          url: v.kind === 'link' ? v.url.trim() : undefined,
          version: v.version.trim(),
          owner: v.owner.trim(),
          status: v.status,
          toReview: false,
        },
      });
      onDone(saved);
    },
  });
  const { values, set, errors } = form;
  const linkMissing = values.kind === 'link' && !values.url.trim();

  return (
    <form onSubmit={form.handleSubmit} noValidate>
      {item?.toReview && (
        <p
          style={{
            marginBottom: 'var(--space-4)',
            padding: 'var(--space-2) var(--space-3)',
            background: 'var(--color-warning-soft)',
            borderLeft: '4px solid var(--color-warning)',
            borderRadius: 'var(--radius-md)',
            fontSize: 'var(--text-sm)',
          }}
        >
          Contenu initial à valider. Vérifiez-le avec son propriétaire : l’enregistrer le marque comme validé.
        </p>
      )}
      <FormGrid>
        <SelectField
          label="Type"
          options={[
            { value: 'standard', label: 'Standard interne' },
            { value: 'link', label: 'Lien vers un document externe' },
          ]}
          value={values.kind}
          onChange={(e) => set('kind', e.target.value as KnowledgeKind)}
        />
        <SelectField
          label="Catégorie"
          options={options(KNOWLEDGE_CATEGORY)}
          value={values.category}
          onChange={(e) => set('category', e.target.value as KnowledgeCategory)}
        />
        <TextField
          label="Code"
          required
          value={values.code}
          onChange={(e) => set('code', e.target.value)}
          error={errors.code}
          placeholder="STD-05"
        />
        <TextField
          label="Version"
          required
          value={values.version}
          onChange={(e) => set('version', e.target.value)}
          error={errors.version}
        />
        <TextField
          className="full"
          label="Titre"
          required
          value={values.title}
          onChange={(e) => set('title', e.target.value)}
          error={errors.title}
        />
        <TextAreaField
          className="full"
          label="Résumé"
          required
          rows={2}
          value={values.summary}
          onChange={(e) => set('summary', e.target.value)}
          error={errors.summary}
        />
        {values.kind === 'link' ? (
          <TextField
            className="full"
            label="Adresse du document (https)"
            required
            value={values.url}
            onChange={(e) => set('url', e.target.value)}
            error={errors.url}
            hint={linkMissing ? 'Obligatoire pour un lien externe.' : undefined}
          />
        ) : (
          <TextAreaField
            className="full"
            label="Points clés (un par ligne)"
            rows={6}
            value={values.keyPoints}
            onChange={(e) => set('keyPoints', e.target.value)}
          />
        )}
        <TextField
          label="Propriétaire"
          required
          value={values.owner}
          onChange={(e) => set('owner', e.target.value)}
          error={errors.owner}
          placeholder="Service méthodes"
        />
        <SelectField
          label="Statut"
          options={[
            { value: 'published', label: 'Publié' },
            { value: 'draft', label: 'Brouillon (visible des gestionnaires)' },
          ]}
          value={values.status}
          onChange={(e) => set('status', e.target.value as KnowledgeStatus)}
        />
      </FormGrid>
      <FormActions>
        <Button onClick={() => onDone()}>Annuler</Button>
        <Button type="submit" variant="primary" loading={form.submitting} disabled={linkMissing}>
          Enregistrer
        </Button>
      </FormActions>
    </form>
  );
}
