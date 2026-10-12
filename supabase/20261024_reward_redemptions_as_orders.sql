-- Redeeming a points reward now creates a regular, zero-cost restaurant order.
alter table public.orders
  drop constraint if exists orders_payment_method_check;
alter table public.orders
  add constraint orders_payment_method_check
  check (payment_method in ('cash', 'electronic', 'points'));

alter table public.reward_redemptions
  alter column code drop not null,
  add column if not exists order_id uuid references public.orders(id) on delete set null;

create unique index if not exists reward_redemptions_order_id_unique
  on public.reward_redemptions(order_id)
  where order_id is not null;

create or replace function public.rewards_redemption_json(p_redemption_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', rr.id,
    'code', rr.code,
    'rewardName', rr.reward_name,
    'rewardType', rr.reward_type,
    'rewardValue', rr.reward_value,
    'menuItemName', rr.menu_item_name,
    'pointsCost', rr.points_cost,
    'status', case when rr.status = 'active' and rr.expires_at <= now()
                   then 'expired' else rr.status end,
    'expiresAt', rr.expires_at,
    'createdAt', rr.created_at,
    'usedAt', rr.used_at,
    'orderId', o.id,
    'orderNumber', o.order_number
  )
  from public.reward_redemptions rr
  left join public.orders o on o.id = rr.order_id
  where rr.id = p_redemption_id;
$$;

create or replace function public.redeem_reward_for_account(
  p_restaurant_id uuid,
  p_account_id uuid,
  p_reward_id uuid,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account record;
  v_existing_id uuid;
  v_reward record;
  v_item_name text;
  v_item_active boolean;
  v_redemption_id uuid := gen_random_uuid();
  v_order_id uuid;
  v_order_number bigint;
  v_table_id uuid;
  v_transaction_id uuid;
begin
  if p_request_id is null then
    raise exception 'REQUEST_ID_REQUIRED';
  end if;

  select rca.display_name, cp.normalized_phone, rca.points_balance
    into v_account
  from public.restaurant_customer_accounts rca
  left join public.customer_profiles cp on cp.id = rca.customer_profile_id
  where rca.id = p_account_id
    and rca.restaurant_id = p_restaurant_id
  for update of rca;

  if not found then
    raise exception 'CUSTOMER_NOT_FOUND';
  end if;

  select rr.id
    into v_existing_id
  from public.reward_redemptions rr
  where rr.restaurant_id = p_restaurant_id
    and rr.restaurant_customer_id = p_account_id
    and rr.request_id = p_request_id;

  if found then
    return jsonb_build_object(
      'status', 'already_processed',
      'points', v_account.points_balance,
      'redemption', public.rewards_redemption_json(v_existing_id)
    );
  end if;

  select r.*
    into v_reward
  from public.rewards r
  where r.id = p_reward_id
    and r.restaurant_id = p_restaurant_id
  for update;

  if not found
     or v_reward.archived_at is not null
     or not v_reward.is_active
     or (v_reward.starts_at is not null and v_reward.starts_at > now()) then
    raise exception 'REWARD_UNAVAILABLE';
  end if;

  if v_reward.expires_at is not null and v_reward.expires_at <= now() then
    raise exception 'REWARD_EXPIRED';
  end if;

  if v_reward.linked_menu_item then
    select mi.name, mi.active
      into v_item_name, v_item_active
    from public.menu_items mi
    where mi.id = v_reward.menu_item_id
      and mi.restaurant_id = p_restaurant_id;

    if not found or v_item_active is not true then
      raise exception 'REWARD_UNAVAILABLE';
    end if;
  end if;

  if v_reward.usage_limit is not null
     and (
       select count(*)
       from public.reward_redemptions rr
       where rr.restaurant_id = p_restaurant_id
         and rr.reward_id = v_reward.id
         and rr.status <> 'cancelled'
     ) >= v_reward.usage_limit then
    raise exception 'REWARD_SOLD_OUT';
  end if;

  if v_reward.per_customer_limit is not null
     and (
       select count(*)
       from public.reward_redemptions rr
       where rr.restaurant_id = p_restaurant_id
         and rr.reward_id = v_reward.id
         and rr.restaurant_customer_id = p_account_id
         and rr.status <> 'cancelled'
     ) >= v_reward.per_customer_limit then
    raise exception 'CUSTOMER_LIMIT_REACHED';
  end if;

  if v_account.points_balance < v_reward.points_cost then
    raise exception 'INSUFFICIENT_POINTS';
  end if;

  select o.table_id
    into v_table_id
  from public.orders o
  where o.restaurant_id = p_restaurant_id
    and o.restaurant_customer_id = p_account_id
    and o.table_id is not null
    and o.status in ('new', 'accepted', 'preparing', 'ready')
  order by o.created_at desc
  limit 1;

  insert into public.orders (
    restaurant_id,
    table_id,
    customer_name,
    customer_phone,
    notes,
    total,
    status,
    payment_method,
    payment_provider,
    payment_proof_data,
    payment_status,
    restaurant_customer_id
  ) values (
    p_restaurant_id,
    v_table_id,
    left(trim(coalesce(v_account.display_name, 'عميل')), 120),
    left(nullif(trim(v_account.normalized_phone), ''), 40),
    left('طلب مكافأة بالنقاط: ' || v_reward.name || ' — تم خصم '
      || v_reward.points_cost::text || ' نقطة.', 500),
    0,
    'new',
    'points',
    null,
    null,
    'verified',
    p_account_id
  )
  returning id, order_number into v_order_id, v_order_number;

  insert into public.order_items (
    order_id,
    menu_item_id,
    item_name,
    quantity,
    unit_price
  ) values (
    v_order_id,
    case when v_reward.linked_menu_item then v_reward.menu_item_id else null end,
    left(coalesce(v_item_name, v_reward.name), 120),
    1,
    0
  );

  insert into public.reward_redemptions (
    id,
    restaurant_id,
    restaurant_customer_id,
    reward_id,
    request_id,
    code,
    points_cost,
    status,
    expires_at,
    used_at,
    reward_name,
    reward_type,
    reward_value,
    menu_item_name,
    order_id
  ) values (
    v_redemption_id,
    p_restaurant_id,
    p_account_id,
    v_reward.id,
    p_request_id,
    null,
    v_reward.points_cost,
    'used',
    now() + make_interval(days => v_reward.redemption_valid_days),
    now(),
    v_reward.name,
    v_reward.reward_type,
    v_reward.value,
    v_item_name,
    v_order_id
  );

  perform public.loyalty_apply_transaction(
    p_account_id,
    'redeem',
    -v_reward.points_cost,
    0,
    'استبدال مكافأة: ' || v_reward.name,
    'reward',
    v_redemption_id,
    'reward_redemption:' || v_redemption_id::text,
    jsonb_build_object('rewardId', v_reward.id, 'orderId', v_order_id)
  );

  select lt.id
    into v_transaction_id
  from public.loyalty_transactions lt
  where lt.restaurant_id = p_restaurant_id
    and lt.restaurant_customer_id = p_account_id
    and lt.event_key = 'reward_redemption:' || v_redemption_id::text;

  update public.reward_redemptions
  set ledger_transaction_id = v_transaction_id
  where id = v_redemption_id;

  return jsonb_build_object(
    'status', 'redeemed',
    'points', v_account.points_balance - v_reward.points_cost,
    'redemption', public.rewards_redemption_json(v_redemption_id),
    'order', jsonb_build_object('id', v_order_id, 'orderNumber', v_order_number)
  );
end;
$$;

create or replace function public.redeem_reward(
  p_restaurant_id uuid,
  p_order_id uuid,
  p_reward_id uuid,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account_id uuid;
begin
  select o.restaurant_customer_id
    into v_account_id
  from public.orders o
  where o.id = p_order_id
    and o.restaurant_id = p_restaurant_id;

  if not found or v_account_id is null then
    raise exception 'CUSTOMER_NOT_FOUND';
  end if;

  return public.redeem_reward_for_account(
    p_restaurant_id,
    v_account_id,
    p_reward_id,
    p_request_id
  );
end;
$$;

create or replace function public.admin_get_reward_redemptions_unrestricted(
  p_status text default null,
  p_reward_id uuid default null,
  p_search text default null,
  p_from date default null,
  p_to date default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_restaurant_id uuid := public.loyalty_current_admin_restaurant();
  v_search text := nullif(trim(coalesce(p_search, '')), '');
begin
  return coalesce((
    select jsonb_agg(row_json order by created_at desc)
    from (
      select
        rr.created_at,
        jsonb_build_object(
          'id', rr.id,
          'customerName', rca.display_name,
          'customerPhone', cp.normalized_phone,
          'rewardName', rr.reward_name,
          'pointsCost', rr.points_cost,
          'status', case when rr.status = 'active' and rr.expires_at <= now()
                         then 'expired' else rr.status end,
          'createdAt', rr.created_at,
          'expiresAt', rr.expires_at,
          'usedAt', rr.used_at,
          'usedBy', pr.full_name,
          'orderId', o.id,
          'orderNumber', o.order_number
        ) as row_json
      from public.reward_redemptions rr
      join public.restaurant_customer_accounts rca
        on rca.id = rr.restaurant_customer_id
      join public.customer_profiles cp
        on cp.id = rca.customer_profile_id
      left join public.profiles pr on pr.id = rr.used_by
      left join public.orders o on o.id = rr.order_id
      where rr.restaurant_id = v_restaurant_id
        and (p_reward_id is null or rr.reward_id = p_reward_id)
        and (p_from is null or rr.created_at >= p_from)
        and (p_to is null or rr.created_at < (p_to + 1))
        and (
          p_status is null
          or (case when rr.status = 'active' and rr.expires_at <= now()
                   then 'expired' else rr.status end) = p_status
        )
        and (
          v_search is null
          or rca.display_name ilike '%' || v_search || '%'
          or cp.normalized_phone like '%' || v_search || '%'
          or rr.reward_name ilike '%' || v_search || '%'
          or o.order_number::text like '%' || v_search || '%'
        )
      order by rr.created_at desc
      limit 200
    ) results
  ), '[]'::jsonb);
end;
$$;

create or replace function public.loyalty_process_order(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order record;
begin
  select o.id, o.restaurant_id, o.status, o.restaurant_customer_id, o.payment_method
    into v_order
  from public.orders o
  where o.id = p_order_id;

  if not found
     or v_order.status <> 'served'
     or v_order.restaurant_customer_id is null
     or v_order.payment_method = 'points' then
    return;
  end if;

  if not exists (
    select 1 from public.restaurant_customer_accounts rca
    where rca.id = v_order.restaurant_customer_id
      and rca.restaurant_id = v_order.restaurant_id
  ) then
    return;
  end if;

  perform public.process_loyalty_reward_event(
    v_order.restaurant_id, v_order.restaurant_customer_id,
    'order_completed', 'order', v_order.id
  );
  perform public.process_loyalty_reward_event(
    v_order.restaurant_id, v_order.restaurant_customer_id,
    'visit', 'order', v_order.id
  );

  if not exists (
    select 1 from public.orders o
    where o.restaurant_id = v_order.restaurant_id
      and o.restaurant_customer_id = v_order.restaurant_customer_id
      and o.status = 'served'
      and o.id <> v_order.id
      and o.payment_method <> 'points'
  ) then
    perform public.process_loyalty_reward_event(
      v_order.restaurant_id, v_order.restaurant_customer_id,
      'first_order', 'order', v_order.id
    );
  end if;
end;
$$;

drop trigger if exists orders_progress_missions on public.orders;
create trigger orders_progress_missions
  after update of status, restaurant_customer_id on public.orders
  for each row
  when (
    new.status = 'served'
    and new.restaurant_customer_id is not null
    and new.payment_method <> 'points'
  )
  execute function public.orders_progress_missions_trigger();

create or replace function public.process_loyalty_review_reward()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order record;
begin
  select o.restaurant_customer_id, o.payment_method
    into v_order
  from public.orders o
  where o.id = new.order_id
    and o.restaurant_id = new.restaurant_id;

  if v_order.restaurant_customer_id is not null
     and v_order.payment_method <> 'points' then
    begin
      perform public.process_loyalty_reward_event(
        new.restaurant_id, v_order.restaurant_customer_id,
        'review_submitted', 'review', new.order_id
      );
    exception when others then
      raise warning 'review reward processing failed for order %: %', new.order_id, sqlerrm;
    end;
  end if;
  return new;
end;
$$;
