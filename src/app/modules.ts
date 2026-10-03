import { useMemo } from 'react';
import { env } from '@/app/config/env';
import { resolveBIConfig } from '@/features/analytics/biProvider';
import { useSettings } from '@/features/shared/api';

/* Modules activables (Paramètres) : un module désactivé disparaît des menus, des onglets, de l'aide et de la
   carte du processus, et ses écrans affichent « module désactivé ». Aucune donnée n'est supprimée. */

export type ModuleKey = 'production' | 'quality' | 'gemba' | 'sequences' | 'knowledge' | 'bi' | 'erp';

export const MODULES: Record<ModuleKey, { label: string; description: string; paths: string[] }> = {
  production: {
    label: 'Production et plan de l’atelier',
    description: 'Ordres de fabrication, stocks matière, plan des postes et flux de fabrication.',
    paths: ['/manager/production', '/manager/atelier'],
  },
  quality: {
    label: 'Contrôles LQC',
    description: 'Mesures qualité en ligne et conformité aux tolérances.',
    paths: ['/manager/qualite'],
  },
  gemba: {
    label: 'Gemba Walk',
    description: 'Tournées terrain et observations transformées en actions.',
    paths: ['/manager/gemba', '/gemba'],
  },
  sequences: {
    label: 'Séquences guidées',
    description: 'Opérations pas à pas chronométrées.',
    paths: ['/app/sequences', '/admin/sequences', '/sequences'],
  },
  knowledge: {
    label: 'Centre de connaissances',
    description: 'Standards, fiches et documents de référence.',
    paths: ['/app/connaissances', '/admin/connaissances', '/connaissances'],
  },
  bi: {
    label: 'Tableaux BI',
    description: 'Tableaux de bord d’un outil BI externe. Masqué tant qu’aucun outil n’est connecté.',
    paths: ['/manager/bi'],
  },
  erp: {
    label: 'Intégration ERP',
    description: 'Échanges avec l’ERP (ordres de fabrication, stocks).',
    paths: ['/admin/integration'],
  },
};

export const MODULE_KEYS = Object.keys(MODULES) as ModuleKey[];

/** Module auquel appartient une adresse (null pour les écrans toujours disponibles) */
export function moduleOfPath(pathname: string): ModuleKey | null {
  const path = pathname.split(/[?#]/)[0]!;
  return MODULE_KEYS.find((k) => MODULES[k].paths.some((p) => path === p || path.startsWith(`${p}/`))) ?? null;
}

/** Règle d'activation, testable sans React */
export function moduleEnabled(key: ModuleKey, disabled: readonly string[], biConfigured: boolean): boolean {
  if (disabled.includes(key)) return false;
  return key !== 'bi' || biConfigured;
}

export interface Modules {
  isEnabled: (key: ModuleKey) => boolean;
  /** Faux si l'adresse appartient à un module désactivé */
  pathEnabled: (pathname: string) => boolean;
  biConfigured: boolean;
}

export function useModules(): Modules {
  const { settings } = useSettings();
  const disabled = settings.disabledModules;
  return useMemo(() => {
    const biConfigured = resolveBIConfig(env).status === 'configured';
    const isEnabled = (key: ModuleKey) => moduleEnabled(key, disabled ?? [], biConfigured);
    return {
      isEnabled,
      pathEnabled: (pathname) => {
        const key = moduleOfPath(pathname);
        return key === null || isEnabled(key);
      },
      biConfigured,
    };
  }, [disabled]);
}
