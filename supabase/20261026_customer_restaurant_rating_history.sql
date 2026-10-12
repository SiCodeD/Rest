-- Keep each restaurant rating as an append-only customer-profile history item.
create table if not exists public.restaurant_customer_rating_history (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  restaurant_customer_id uuid not null
    references public.restaurant_customer_accounts(id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  note text check (note is null or char_length(note) <= 500),
  rated_by uuid references public.profiles(id) on delete set null,
  rated_at timestamptz not null default now()
);

create index if not exists restaurant_customer_rating_history_customer_idx
  on public.restaurant_customer_rating_history(
    restaurant_id,
    restaurant_customer_id,
    rated_at desc,
    id desc
  );

alter table public.restaurant_customer_rating_history enable row level security;
revoke all on table public.restaurant_customer_rating_history
  from public, anon, authenticated;

insert into public.restaurant_customer_rating_history(
  restaurant_id,
  restaurant_customer_id,
  rating,
  note,
  rated_by,
  rated_at
)
select
  rca.restaurant_id,
  rca.id,
  rca.restaurant_rating,
  rca.restaurant_rating_note,
  rca.restaurant_rated_by,
  rca.restaurant_rated_at
from public.restaurant_customer_accounts rca
where rca.restaurant_rating is not null
  and rca.restaurant_rated_at is not null
  and not exists (
    select 1
    from public.restaurant_customer_rating_history h
    where h.restaurant_id = rca.restaurant_id
      and h.restaurant_customer_id = rca.id
      and h.rating = rca.restaurant_rating
      and h.note is not distinct from rca.restaurant_rating_note
      and h.rated_at = rca.restaurant_rated_at
  );

create or replace function public.customer_restaurant_rating_json(
  p_restaurant_id uuid,
  p_customer_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'available', true,
    'rating', latest.rating,
    'note', latest.note,
    'ratedAt', latest.rated_at,
    'history', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'rating', entry.rating,
            'note', entry.note,
            'ratedAt', entry.rated_at
          )
          order by entry.rated_at desc, entry.id desc
        )
        from (
          select h.id, h.rating, h.note, h.rated_at
          from public.restaurant_customer_rating_history h
          where h.restaurant_customer_id = p_customer_id
            and h.restaurant_id = p_restaurant_id
          order by h.rated_at desc, h.id desc
          limit 20
        ) entry
      ),
      '[]'::jsonb
    )
  )
  from (
    select h.rating, h.note, h.rated_at
    from public.restaurant_customer_rating_history h
    where h.restaurant_customer_id = p_customer_id
      and h.restaurant_id = p_restaurant_id
    order by h.rated_at desc, h.id desc
    limit 1
  ) latest
  right join (select 1) as available on true;
$$;

create or replace function public.admin_get_customer_restaurant_rating(
  p_customer_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_restaurant_id uuid := public.loyalty_current_admin_restaurant();
  v_rating jsonb;
  v_history jsonb;
begin
  if not public.can_use_feature('customer_management')
     or not public.can_use_feature('customer_profile') then
    raise exception 'Customer profile is not available on the current plan.';
  end if;

  if not exists (
    select 1
    from public.restaurant_customer_accounts rca
    where rca.id = p_customer_id
      and rca.restaurant_id = v_restaurant_id
  ) then
    return jsonb_build_object('available', false);
  end if;

  v_rating := public.customer_restaurant_rating_json(v_restaurant_id, p_customer_id);

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'rating', entry.rating,
        'note', entry.note,
        'ratedAt', entry.rated_at,
        'ratedBy', entry.rated_by
      )
      order by entry.rated_at desc, entry.id desc
    ),
    '[]'::jsonb
  )
  into v_history
  from (
    select
      h.id,
      h.rating,
      h.note,
      h.rated_at,
      pr.full_name as rated_by
    from public.restaurant_customer_rating_history h
    left join public.profiles pr on pr.id = h.rated_by
    where h.restaurant_id = v_restaurant_id
      and h.restaurant_customer_id = p_customer_id
    order by h.rated_at desc, h.id desc
    limit 50
  ) entry;

  return coalesce(v_rating, jsonb_build_object('available', true, 'rating', null))
    || jsonb_build_object('history', v_history);
end;
$$;

create or replace function public.admin_save_customer_restaurant_rating(
  p_customer_id uuid,
  p_rating integer,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_restaurant_id uuid := public.loyalty_current_admin_restaurant();
  v_note text := nullif(trim(coalesce(p_note, '')), '');
  v_rated_at timestamptz;
begin
  if not public.can_use_feature('customer_management')
     or not public.can_use_feature('customer_profile') then
    raise exception 'Customer profile is not available on the current plan.';
  end if;

  if p_rating is null or p_rating < 1 or p_rating > 5 then
    raise exception 'CUSTOMER_RATING_INVALID';
  end if;
  if char_length(coalesce(v_note, '')) > 500 then
    raise exception 'CUSTOMER_RATING_NOTE_TOO_LONG';
  end if;

  perform 1
  from public.restaurant_customer_accounts rca
  where rca.id = p_customer_id
    and rca.restaurant_id = v_restaurant_id
  for update;

  if not found then
    raise exception 'Customer not found';
  end if;

  select greatest(
    clock_timestamp(),
    coalesce(max(h.rated_at) + interval '1 microsecond', '-infinity'::timestamptz)
  )
  into v_rated_at
  from public.restaurant_customer_rating_history h
  where h.restaurant_id = v_restaurant_id
    and h.restaurant_customer_id = p_customer_id;

  insert into public.restaurant_customer_rating_history(
    restaurant_id,
    restaurant_customer_id,
    rating,
    note,
    rated_by,
    rated_at
  )
  values (
    v_restaurant_id,
    p_customer_id,
    p_rating,
    v_note,
    auth.uid(),
    v_rated_at
  );

  update public.restaurant_customer_accounts
  set restaurant_rating = p_rating,
      restaurant_rating_note = v_note,
      restaurant_rated_at = v_rated_at,
      restaurant_rated_by = auth.uid(),
      updated_at = now()
  where id = p_customer_id
    and restaurant_id = v_restaurant_id;

  return public.admin_get_customer_restaurant_rating(p_customer_id);
end;
$$;

revoke all on function public.customer_restaurant_rating_json(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.admin_get_customer_restaurant_rating(uuid)
  from public, anon;
revoke all on function public.admin_save_customer_restaurant_rating(uuid, integer, text)
  from public, anon;
grant execute on function public.admin_get_customer_restaurant_rating(uuid)
  to authenticated;
grant execute on function public.admin_save_customer_restaurant_rating(uuid, integer, text)
  to authenticated;
