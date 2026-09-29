-- ============================================================
-- Routines atelier — schéma de données (Supabase / Postgres)
-- Colonnes en camelCase (identifiants entre guillemets) : l'API renvoie
-- directement les objets du domaine (src/types/domain.ts).
-- Toute donnée entrante est contrôlée ici (types, énumérations, longueurs).
-- ============================================================

create schema if not exists app;

-- ---------- Organisation ----------

create table public.workshops (
  id text primary key default gen_random_uuid()::text,
  name text not null check (char_length(name) between 1 and 120),
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

create table public.lines (
  id text primary key default gen_random_uuid()::text,
  code text not null check (char_length(code) between 1 and 10),
  name text not null check (char_length(name) between 1 and 120),
  description text check (char_length(description) <= 400),
  "workshopId" text references public.workshops (id),
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

create table public.workstations (
  id text primary key default gen_random_uuid()::text,
  code text not null unique check (code ~ '^[A-Z0-9-]{1,10}$'),
  name text not null check (char_length(name) between 1 and 120),
  process text not null check (char_length(process) between 1 and 60),
  "lineId" text not null references public.lines (id),
  "mapX" numeric not null check ("mapX" between 0 and 100),
  "mapY" numeric not null check ("mapY" between 0 and 100),
  active boolean not null default true,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

create table public.teams (
  id text primary key default gen_random_uuid()::text,
  name text not null unique check (char_length(name) between 1 and 120),
  shift text check (shift in ('morning', 'afternoon', 'night')),
  "lineId" text references public.lines (id),
  "leaderId" text,
  active boolean not null default true,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

create table public.users (
  id text primary key default gen_random_uuid()::text,
  name text not null check (char_length(name) between 1 and 120),
  email text not null check (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(email) <= 254),
  role text not null check (role in ('operator', 'hancho', 'line_leader', 'quality', 'manager', 'admin')),
  "lineId" text references public.lines (id),
  "zoneLabel" text check (char_length("zoneLabel") <= 120),
  shift text check (shift in ('morning', 'afternoon', 'night')),
  "teamId" text references public.teams (id),
  "workstationId" text references public.workstations (id),
  active boolean not null default true,
  "lastSignInAt" timestamptz,
  "authId" uuid unique references auth.users (id) on delete set null,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);
create unique index users_email_lower on public.users (lower(email));
alter table public.teams add constraint teams_leader_fk foreign key ("leaderId") references public.users (id);

create table public.presence (
  id text primary key default gen_random_uuid()::text,
  "userId" text not null references public.users (id),
  date date not null,
  status text not null check (status in ('present', 'absent')),
  "recordedBy" text not null references public.users (id),
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now(),
  unique ("userId", date)
);

create table public.leaves (
  id text primary key default gen_random_uuid()::text,
  "userId" text not null references public.users (id),
  "from" date not null,
  "to" date not null check ("to" >= "from"),
  reason text check (char_length(reason) <= 200),
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

-- ---------- Routines ----------

create table public.checklists (
  id text primary key default gen_random_uuid()::text,
  name text not null check (char_length(name) between 1 and 120),
  description text check (char_length(description) <= 400),
  items jsonb not null default '[]' check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) <= 100),
  active boolean not null default true,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

create table public."routineTemplates" (
  id text primary key default gen_random_uuid()::text,
  title text not null check (char_length(title) between 1 and 160),
  description text check (char_length(description) <= 2000),
  "durationMin" integer not null check ("durationMin" between 1 and 480),
  "defaultTime" text not null check ("defaultTime" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  "lineId" text references public.lines (id),
  "workstationId" text references public.workstations (id),
  tasks jsonb not null default '[]' check (jsonb_typeof(tasks) = 'array' and jsonb_array_length(tasks) between 1 and 60),
  active boolean not null default true,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

create table public.schedules (
  id text primary key default gen_random_uuid()::text,
  "routineId" text not null references public."routineTemplates" (id),
  "startDate" date not null,
  "endDate" date check ("endDate" is null or "endDate" >= "startDate"),
  time text not null check (time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  recurrence text not null check (recurrence in ('once', 'daily', 'weekdays', 'weekly')),
  weekdays integer[] not null default '{}' check (weekdays <@ array[1, 2, 3, 4, 5, 6, 7]),
  "assigneeId" text references public.users (id),
  "teamId" text references public.teams (id),
  "lineId" text references public.lines (id),
  "workstationId" text references public.workstations (id),
  status text not null default 'active' check (status in ('active', 'cancelled')),
  "skippedDates" date[] not null default '{}',
  note text check (char_length(note) <= 500),
  "createdBy" text not null references public.users (id),
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now(),
  check ("assigneeId" is not null or "teamId" is not null),
  check (recurrence <> 'weekly' or cardinality(weekdays) > 0)
);

create table public."routineRuns" (
  id text primary key default gen_random_uuid()::text,
  "scheduleId" text not null references public.schedules (id),
  "templateId" text not null references public."routineTemplates" (id),
  date date not null,
  "assigneeId" text not null references public.users (id),
  "startedAt" timestamptz not null default now(),
  results jsonb not null default '{}' check (jsonb_typeof(results) = 'object'),
  "completedAt" timestamptz,
  "completedBy" text references public.users (id),
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now(),
  unique ("scheduleId", date)
);

-- ---------- Actions, commentaires, anomalies, Andon ----------

create table public.actions (
  id text primary key default gen_random_uuid()::text,
  title text not null check (char_length(title) between 3 and 160),
  description text check (char_length(description) <= 4000),
  "assigneeId" text not null references public.users (id),
  "backupId" text references public.users (id),
  priority text not null check (priority in ('low', 'medium', 'high', 'critical')),
  status text not null check (status in ('todo', 'in_progress', 'blocked', 'done', 'cancelled')),
  "dueDate" date not null,
  source jsonb not null check (source ->> 'type' in ('manual', 'meeting', 'anomaly', 'gemba', 'routine', 'andon', 'quality')),
  "createdBy" text not null references public.users (id),
  "blockedReason" text check (char_length("blockedReason") <= 1000),
  "resolutionNote" text check (char_length("resolutionNote") <= 2000),
  "closedAt" timestamptz,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

create table public.comments (
  id text primary key default gen_random_uuid()::text,
  "targetType" text not null check ("targetType" in ('action', 'anomaly', 'gembaWalk', 'andonAlert', 'routineRun', 'meeting')),
  "targetId" text not null,
  "anchorId" text check (char_length("anchorId") <= 80),
  "authorId" text not null references public.users (id),
  text text not null check (char_length(text) between 1 and 4000),
  "editedAt" timestamptz,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);
create index comments_target on public.comments ("targetType", "targetId");

create table public.anomalies (
  id text primary key default gen_random_uuid()::text,
  description text not null check (char_length(description) between 3 and 2000),
  category text not null check (category in ('safety', 'quality', '5s', 'standard', 'performance', 'equipment', 'material', 'other')),
  severity text not null check (severity in ('minor', 'major', 'critical')),
  "workstationId" text references public.workstations (id),
  status text not null check (status in ('open', 'in_progress', 'closed')),
  "reportedBy" text not null references public.users (id),
  -- Photo : uniquement une image JPEG ré-encodée par l'application, 2 Mo maximum
  photo text check (photo is null or (photo like 'data:image/jpeg;base64,%' and char_length(photo) <= 2800000)),
  origin jsonb not null check (origin ->> 'type' in ('manual', 'qr', 'routine', 'quality', 'andon', 'gemba')),
  "closedAt" timestamptz,
  "closedBy" text references public.users (id),
  "resolutionNote" text check (char_length("resolutionNote") <= 2000),
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

create table public."andonAlerts" (
  id text primary key default gen_random_uuid()::text,
  "workstationId" text not null references public.workstations (id),
  type text not null check (type in ('quality', 'equipment', 'material', 'safety')),
  urgency text not null check (urgency in ('low', 'medium', 'critical')),
  detail text not null check (char_length(detail) between 1 and 300),
  status text not null check (status in ('active', 'acknowledged', 'in_progress', 'resolved')),
  "raisedBy" text not null references public.users (id),
  "raisedAt" timestamptz not null default now(),
  "acknowledgedBy" text references public.users (id),
  "acknowledgedAt" timestamptz,
  "resolutionStartedAt" timestamptz,
  "resolvedBy" text references public.users (id),
  "resolvedAt" timestamptz,
  "rootCause" text check (char_length("rootCause") <= 1000),
  resolution text check (char_length(resolution) <= 1000),
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

-- ---------- Séquences ----------

create table public."sequenceTemplates" (
  id text primary key default gen_random_uuid()::text,
  name text not null check (char_length(name) between 1 and 160),
  description text check (char_length(description) <= 2000),
  steps jsonb not null check (jsonb_typeof(steps) = 'array' and jsonb_array_length(steps) between 1 and 100),
  active boolean not null default true,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

create table public."sequenceRuns" (
  id text primary key default gen_random_uuid()::text,
  "templateId" text not null references public."sequenceTemplates" (id),
  date date not null,
  "startedBy" text not null references public.users (id),
  status text not null check (status in ('running', 'paused', 'completed', 'aborted')),
  "currentStepIndex" integer not null check ("currentStepIndex" >= 0),
  "segmentStartedAt" timestamptz,
  steps jsonb not null check (jsonb_typeof(steps) = 'array'),
  "completedAt" timestamptz,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

-- ---------- Production ----------

create table public."productionOrders" (
  id text primary key default gen_random_uuid()::text,
  reference text not null check (char_length(reference) between 1 and 40),
  "harnessRef" text not null check (char_length("harnessRef") between 1 and 60),
  "lineId" text not null references public.lines (id),
  "quantityPlanned" integer not null check ("quantityPlanned" >= 0),
  "quantityDone" integer not null check ("quantityDone" >= 0),
  stage text not null check (stage in ('cutting', 'crimping', 'assembly', 'taping', 'electrical_test', 'inspection', 'shipping')),
  status text not null check (status in ('planned', 'in_progress', 'blocked', 'done')),
  "blockedReason" text check (char_length("blockedReason") <= 300),
  "ownerId" text references public.users (id),
  "dueDate" date not null,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

create table public."materialStocks" (
  id text primary key default gen_random_uuid()::text,
  material text not null check (char_length(material) between 1 and 120),
  "workstationId" text not null references public.workstations (id),
  quantity numeric not null check (quantity >= 0),
  min numeric not null check (min >= 0),
  target numeric not null check (target >= 0),
  unit text not null check (char_length(unit) between 1 and 20),
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

create table public."stockMovements" (
  id text primary key default gen_random_uuid()::text,
  "stockId" text not null references public."materialStocks" (id),
  delta numeric not null check (delta <> 0 and abs(delta) <= 100000),
  reason text not null check (reason in ('consumption', 'replenishment', 'adjustment')),
  "by" text not null references public.users (id),
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

-- ---------- Gemba, qualité, connaissances ----------

create table public."gembaWalks" (
  id text primary key default gen_random_uuid()::text,
  date date not null,
  zone text not null check (char_length(zone) between 1 and 200),
  "leaderId" text not null references public.users (id),
  "participantIds" text[] not null default '{}',
  checklist jsonb not null check (jsonb_typeof(checklist) = 'array'),
  observations jsonb not null check (jsonb_typeof(observations) = 'array'),
  status text not null check (status in ('draft', 'validated', 'closed')),
  "validatedAt" timestamptz,
  "closedAt" timestamptz,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

create table public."qualityChecks" (
  id text primary key default gen_random_uuid()::text,
  characteristic text not null check (char_length(characteristic) between 1 and 120),
  "workstationId" text not null references public.workstations (id),
  value numeric not null,
  min numeric not null,
  max numeric not null check (max >= min),
  unit text not null check (char_length(unit) between 1 and 20),
  "measuredBy" text not null references public.users (id),
  comment text check (char_length(comment) <= 1000),
  "anomalyId" text references public.anomalies (id),
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

create table public."knowledgeItems" (
  id text primary key default gen_random_uuid()::text,
  code text not null unique check (char_length(code) between 1 and 20),
  title text not null check (char_length(title) between 1 and 200),
  category text not null check (category in ('safety', '5s', 'standard', 'quality', 'performance', 'production', 'material')),
  kind text not null check (kind in ('standard', 'link')),
  summary text not null check (char_length(summary) between 1 and 400),
  "keyPoints" text[] not null default '{}',
  url text check (url is null or (url ~ '^https://' and char_length(url) <= 500)),
  version text not null check (char_length(version) between 1 and 20),
  owner text not null check (char_length(owner) between 1 and 120),
  status text not null check (status in ('draft', 'published', 'archived')),
  "toReview" boolean not null default false,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

create table public.favorites (
  id text primary key default gen_random_uuid()::text,
  "userId" text not null references public.users (id),
  "knowledgeId" text not null references public."knowledgeItems" (id),
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now(),
  unique ("userId", "knowledgeId")
);

-- ---------- Agenda, passations, annonces ----------

create table public.meetings (
  id text primary key default gen_random_uuid()::text,
  title text not null check (char_length(title) between 1 and 160),
  type text not null check (type in ('meeting', 'briefing', 'daily', 'training', 'audit', 'maintenance', 'operational')),
  date date not null,
  "startTime" text not null check ("startTime" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  "endTime" text not null check ("endTime" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  location text check (char_length(location) <= 120),
  description text check (char_length(description) <= 2000),
  "organizerId" text not null references public.users (id),
  "participantIds" text[] not null default '{}',
  "teamIds" text[] not null default '{}',
  "attendeeIds" text[] not null default '{}',
  agenda jsonb not null default '[]' check (jsonb_typeof(agenda) = 'array' and jsonb_array_length(agenda) <= 50),
  minutes text not null default '' check (char_length(minutes) <= 10000),
  status text not null check (status in ('planned', 'in_progress', 'done', 'cancelled')),
  "seriesId" text,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now(),
  check ("endTime" > "startTime")
);

create table public.handovers (
  id text primary key default gen_random_uuid()::text,
  "fromShift" text not null check ("fromShift" in ('morning', 'afternoon', 'night')),
  "toShift" text not null check ("toShift" in ('morning', 'afternoon', 'night')),
  note text not null check (char_length(note) between 1 and 2000),
  "workstationId" text references public.workstations (id),
  "authorId" text not null references public.users (id),
  "acknowledgedBy" text references public.users (id),
  "acknowledgedAt" timestamptz,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

create table public.announcements (
  id text primary key default gen_random_uuid()::text,
  text text not null check (char_length(text) between 1 and 500),
  date date not null,
  "authorId" text not null references public.users (id),
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

create table public.notifications (
  id text primary key default gen_random_uuid()::text,
  "userId" text not null references public.users (id),
  kind text not null check (kind in ('action_assigned', 'andon_raised', 'comment_added', 'anomaly_reported', 'routine_assigned', 'meeting_invited', 'access_request')),
  title text not null check (char_length(title) between 1 and 300),
  link text check (link is null or (link ~ '^/' and char_length(link) <= 300)),
  "readAt" timestamptz,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);
create index notifications_user on public.notifications ("userId", "createdAt" desc);

create table public.settings (
  id text primary key default 'app',
  "plantName" text not null check (char_length("plantName") between 1 and 120),
  "andonEscalationMinutes" integer not null check ("andonEscalationMinutes" between 1 and 120),
  "routineLateToleranceMinutes" integer not null check ("routineLateToleranceMinutes" between 0 and 720),
  timezone text not null default 'Europe/Paris',
  -- demo : environnement de démonstration (réinitialisable par un administrateur) ; production : jamais
  environment text not null default 'production' check (environment in ('demo', 'production')),
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

-- ---------- Sécurité : permissions et journal d'audit ----------

create table app.role_permissions (
  role text not null,
  permission text not null,
  primary key (role, permission)
);

create table public."auditLog" (
  id text primary key default gen_random_uuid()::text,
  at timestamptz not null default now(),
  "actorId" text,
  event text not null,
  resource text not null,
  "resourceId" text,
  detail jsonb not null default '{}',
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);
create index audit_at on public."auditLog" (at desc);

-- Compteur des demandes « mot de passe oublié » (limitation de débit)
create table app.access_requests (
  identifier text not null,
  at timestamptz not null default now()
);
create index access_requests_idx on app.access_requests (identifier, at);
