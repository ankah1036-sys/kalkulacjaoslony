-- =====================================================================
-- Kalkulator osłon kaloryferów — schemat początkowy (konta firmowe)
-- Model: organizations -> memberships -> (clients, quotes -> quote_items)
-- Izolacja danych: Row Level Security oparty na przynależności do firmy.
-- =====================================================================

-- --- Rozszerzenia ----------------------------------------------------
create extension if not exists "pgcrypto"; -- gen_random_uuid()

-- =====================================================================
-- TABELE
-- =====================================================================

-- Firma (nadrzędna jednostka; zespół współdzieli dane)
create table public.organizations (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  default_price    numeric(12,2),                 -- wspólny domyślny cennik za m²
  default_currency text not null default 'PLN',
  created_at       timestamptz not null default now()
);

-- Profil użytkownika (1:1 z auth.users)
create table public.users (
  id           uuid primary key references auth.users(id) on delete cascade,
  email        text unique not null,
  display_name text,
  created_at   timestamptz not null default now()
);

-- Przynależność użytkownika do firmy + rola
create table public.memberships (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations(id) on delete cascade,
  user_id    uuid not null references public.users(id) on delete cascade,
  role       text not null default 'member' check (role in ('admin','member')),
  created_at timestamptz not null default now(),
  unique (org_id, user_id)
);

-- Zaproszenia do firmy
create table public.invites (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations(id) on delete cascade,
  email      text not null,
  role       text not null default 'member' check (role in ('admin','member')),
  token      uuid not null default gen_random_uuid(),
  status     text not null default 'pending' check (status in ('pending','accepted','revoked')),
  created_at timestamptz not null default now()
);

-- Klienci (przypisani do firmy)
create table public.clients (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations(id) on delete cascade,
  name       text not null,
  contact    text,
  created_at timestamptz not null default now()
);

-- Wycena (oferta)
create table public.quotes (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations(id) on delete cascade,
  created_by   uuid references public.users(id) on delete set null,
  client_id    uuid references public.clients(id) on delete set null,
  offer_no     text,
  company_name text,
  material     text,                              -- materiał osłon (np. MDF 18 mm, lakier RAL 7035)
  price_per_m2 numeric(12,2),
  currency     text not null default 'PLN',
  vat_rate     numeric(5,2) not null default 23,   -- stawka VAT w procentach (netto → brutto)
  surface_mode text not null default 'auto' check (surface_mode in ('auto','front','full')),
  total_area   numeric(14,4),
  total_cost   numeric(14,2),
  status       text not null default 'draft' check (status in ('draft','sent','accepted','rejected')),
  warnings     jsonb not null default '[]'::jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Pozycje wyceny
create table public.quote_items (
  id        uuid primary key default gen_random_uuid(),
  quote_id  uuid not null references public.quotes(id) on delete cascade,
  label     text,
  width_m   numeric(10,4),
  height_m  numeric(10,4),
  depth_m   numeric(10,4),
  area      numeric(14,4),
  basis     text,
  cost      numeric(14,2),
  note      text
);

-- Indeksy pod najczęstsze zapytania
create index on public.memberships (user_id);
create index on public.memberships (org_id);
create index on public.clients (org_id);
create index on public.quotes (org_id);
create index on public.quotes (created_by);
create index on public.quote_items (quote_id);

-- =====================================================================
-- FUNKCJE POMOCNICZE (do polityk RLS)
-- =====================================================================

-- Czy zalogowany użytkownik należy do danej firmy?
create or replace function public.is_org_member(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.memberships m
    where m.org_id = p_org and m.user_id = auth.uid()
  );
$$;

-- Czy zalogowany użytkownik jest adminem danej firmy?
create or replace function public.is_org_admin(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.memberships m
    where m.org_id = p_org and m.user_id = auth.uid() and m.role = 'admin'
  );
$$;

-- =====================================================================
-- TRIGGERY
-- =====================================================================

-- Automatyczne tworzenie profilu w public.users po rejestracji w auth.users
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, email, display_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'display_name', new.email))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Aktualizacja updated_at na quotes
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger quotes_touch_updated_at
  before update on public.quotes
  for each row execute function public.touch_updated_at();

-- =====================================================================
-- ROW LEVEL SECURITY
-- =====================================================================

alter table public.organizations enable row level security;
alter table public.users         enable row level security;
alter table public.memberships   enable row level security;
alter table public.invites       enable row level security;
alter table public.clients       enable row level security;
alter table public.quotes        enable row level security;
alter table public.quote_items   enable row level security;

-- --- users -----------------------------------------------------------
-- Każdy widzi i edytuje wyłącznie swój profil.
create policy users_select_self on public.users
  for select using (id = auth.uid());
create policy users_update_self on public.users
  for update using (id = auth.uid());

-- --- organizations ---------------------------------------------------
-- Widzą członkowie; tworzyć może każdy zalogowany (zakłada firmę i staje się adminem
-- przez wstawienie membership w tej samej transakcji po stronie aplikacji).
create policy org_select_member on public.organizations
  for select using (public.is_org_member(id));
create policy org_insert_auth on public.organizations
  for insert with check (auth.uid() is not null);
create policy org_update_admin on public.organizations
  for update using (public.is_org_admin(id));

-- --- memberships -----------------------------------------------------
-- Członek widzi członkostwa swojej firmy. Admin zarządza. Użytkownik może wstawić
-- własne pierwsze członkostwo (bootstrap zakładania firmy).
create policy memberships_select on public.memberships
  for select using (public.is_org_member(org_id));
create policy memberships_insert_self_or_admin on public.memberships
  for insert with check (user_id = auth.uid() or public.is_org_admin(org_id));
create policy memberships_update_admin on public.memberships
  for update using (public.is_org_admin(org_id));
create policy memberships_delete_admin on public.memberships
  for delete using (public.is_org_admin(org_id));

-- --- invites ---------------------------------------------------------
create policy invites_select_member on public.invites
  for select using (public.is_org_member(org_id));
create policy invites_write_admin on public.invites
  for all using (public.is_org_admin(org_id)) with check (public.is_org_admin(org_id));

-- --- clients ---------------------------------------------------------
create policy clients_rw_member on public.clients
  for all using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));

-- --- quotes ----------------------------------------------------------
create policy quotes_rw_member on public.quotes
  for all using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));

-- --- quote_items -----------------------------------------------------
-- Dostęp przez firmę nadrzędnej wyceny.
create policy quote_items_rw_member on public.quote_items
  for all using (
    exists (
      select 1 from public.quotes q
      where q.id = quote_items.quote_id and public.is_org_member(q.org_id)
    )
  ) with check (
    exists (
      select 1 from public.quotes q
      where q.id = quote_items.quote_id and public.is_org_member(q.org_id)
    )
  );
