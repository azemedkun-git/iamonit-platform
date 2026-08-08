alter table public.tenants
drop constraint tenants_name_key;

alter table public.tenants
add constraint tenants_status_check
check (status in ('active', 'suspended', 'archived'));

create table public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  phone text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid
);

create trigger set_user_profiles_updated_at
before update on public.user_profiles
for each row
execute function public.set_updated_at();

alter table public.user_profiles enable row level security;

create table public.tenant_memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  role text not null check (role in ('admin', 'dispatcher', 'car_puller')),
  status text not null default 'active'
    check (status in ('active', 'suspended', 'removed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  unique (user_id, tenant_id)
);

create index tenant_memberships_tenant_id_status_idx
on public.tenant_memberships (tenant_id, status);

create index tenant_memberships_user_id_status_idx
on public.tenant_memberships (user_id, status);

create trigger set_tenant_memberships_updated_at
before update on public.tenant_memberships
for each row
execute function public.set_updated_at();

alter table public.tenant_memberships enable row level security;

insert into public.user_profiles (
  user_id,
  full_name,
  phone,
  created_at,
  updated_at,
  created_by,
  updated_by
)
select
  id,
  full_name,
  phone,
  created_at,
  updated_at,
  created_by,
  updated_by
from public.app_users;

insert into public.tenant_memberships (
  user_id,
  tenant_id,
  role,
  status,
  created_at,
  updated_at,
  created_by,
  updated_by
)
select
  id,
  tenant_id,
  role,
  'active',
  created_at,
  updated_at,
  created_by,
  updated_by
from public.app_users;
