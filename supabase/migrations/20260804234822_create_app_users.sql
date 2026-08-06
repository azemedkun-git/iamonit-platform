create table public.app_users (
  id uuid primary key references auth.users(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  role text not null check (role in ('admin', 'dispatcher', 'car_puller')),
  full_name text not null,
  phone text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid
);

create trigger set_app_users_updated_at
before update on public.app_users
for each row
execute function public.set_updated_at();

create index app_users_tenant_id_idx on public.app_users (tenant_id);

alter table public.app_users enable row level security;
