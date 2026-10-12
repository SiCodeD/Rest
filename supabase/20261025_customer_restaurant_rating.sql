-- A restaurant rating belongs to the customer profile within this restaurant.
alter table public.restaurant_customer_accounts
  add column if not exists restaurant_rating smallint,
  add column if not exists restaurant_rating_note text,
  add column if not exists restaurant_rated_at timestamptz,
  add column if not exists restaurant_rated_by uuid references public.profiles(id) on delete set null;

alter table public.restaurant_customer_accounts
  drop constraint if exists restaurant_customer_rating_range;
alter table public.restaurant_customer_accounts
  add constraint restaurant_customer_rating_range
  check (restaurant_rating is null or restaurant_rating between 1 and 5);

alter table public.restaurant_customer_accounts
  drop constraint if exists restaurant_customer_rating_note_length;
alter table public.restaurant_customer_accounts
  add constraint restaurant_customer_rating_note_length
  check (restaurant_rating_note is null or char_length(restaurant_rating_note) <= 500);

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
    'rating', rca.restaurant_rating,
    'note', rca.restaurant_rating_note,
    'ratedAt', rca.restaurant_rated_at
  )
  from public.restaurant_customer_accounts rca
  where rca.id = p_customer_id
    and rca.restaurant_id = p_restaurant_id;
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
begin
  if not public.can_use_feature('customer_management')
     or not public.can_use_feature('customer_profile') then
    raise exception 'Customer profile is not available on the current plan.';
  end if;

  v_rating := public.customer_restaurant_rating_json(v_restaurant_id, p_customer_id);
  if v_rating is null then
    return jsonb_build_object('available', false);
  end if;

  return v_rating || jsonb_build_object(
    'ratedBy',
    (select pr.full_name
     from public.restaurant_customer_accounts rca
     left join public.profiles pr on pr.id = rca.restaurant_rated_by
     where rca.id = p_customer_id
       and rca.restaurant_id = v_restaurant_id)
  );
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

  update public.restaurant_customer_accounts
  set restaurant_rating = p_rating,
      restaurant_rating_note = v_note,
      restaurant_rated_at = now(),
      restaurant_rated_by = auth.uid(),
      updated_at = now()
  where id = p_customer_id
    and restaurant_id = v_restaurant_id;

  if not found then
    raise exception 'Customer not found';
  end if;

  return public.admin_get_customer_restaurant_rating(p_customer_id);
end;
$$;

create or replace function public.get_customer_restaurant_rating_by_session(
  p_restaurant_id uuid,
  p_session_token text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer_id uuid;
begin
  v_customer_id := public.customer_session_account_id(p_restaurant_id, p_session_token);
  if v_customer_id is null then
    return jsonb_build_object('available', false);
  end if;

  return coalesce(
    public.customer_restaurant_rating_json(p_restaurant_id, v_customer_id),
    jsonb_build_object('available', false)
  );
end;
$$;

create or replace function public.get_customer_restaurant_rating(
  p_restaurant_id uuid,
  p_order_id uuid,
  p_tracking_token text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer_id uuid;
begin
  if not public.guest_order_token_valid(
    p_restaurant_id,
    p_order_id,
    p_tracking_token
  ) then
    return jsonb_build_object('available', false);
  end if;

  select o.restaurant_customer_id
    into v_customer_id
  from public.orders o
  where o.id = p_order_id
    and o.restaurant_id = p_restaurant_id;

  if v_customer_id is null then
    return jsonb_build_object('available', false);
  end if;

  return coalesce(
    public.customer_restaurant_rating_json(p_restaurant_id, v_customer_id),
    jsonb_build_object('available', false)
  );
end;
$$;

revoke all on function public.customer_restaurant_rating_json(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.admin_get_customer_restaurant_rating(uuid)
  from public, anon;
revoke all on function public.admin_save_customer_restaurant_rating(uuid, integer, text)
  from public, anon;
revoke all on function public.get_customer_restaurant_rating_by_session(uuid, text)
  from public;
revoke all on function public.get_customer_restaurant_rating(uuid, uuid, text)
  from public;

grant execute on function public.admin_get_customer_restaurant_rating(uuid)
  to authenticated;
grant execute on function public.admin_save_customer_restaurant_rating(uuid, integer, text)
  to authenticated;
grant execute on function public.get_customer_restaurant_rating_by_session(uuid, text)
  to anon, authenticated;
grant execute on function public.get_customer_restaurant_rating(uuid, uuid, text)
  to anon, authenticated;
