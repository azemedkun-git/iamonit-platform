-- Audit timestamp convention for IAMONIT tables:
--   created_at timestamptz NOT NULL DEFAULT now(),
--   updated_at timestamptz NOT NULL DEFAULT now()
--
-- Attach this function to each audited table with a BEFORE UPDATE trigger.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = current_timestamp;
  return new;
end;
$$;

comment on function public.set_updated_at() is
  'Sets NEW.updated_at for tables whose created_at and updated_at columns use timestamptz.';
