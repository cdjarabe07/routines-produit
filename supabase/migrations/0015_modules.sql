-- Modules activables : l'administrateur masque les modules que le site n'utilise pas.
-- Liste des modules DÉSACTIVÉS : vide par défaut, donc rien ne change pour un site existant.
-- Masquer un module ne supprime aucune donnée ; il se réactive à tout moment.

alter table public.settings
  add column if not exists "disabledModules" text[] not null default '{}'
  constraint settings_disabled_modules_known
    check ("disabledModules" <@ array['production', 'quality', 'gemba', 'sequences', 'knowledge', 'bi', 'erp']::text[]);
