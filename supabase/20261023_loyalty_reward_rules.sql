-- Configurable built-in and custom loyalty events with per-customer reward caps.
create extension if not exists pg_net;

create table if not exists public.loyalty_reward_rules (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  rule_key text,
  name text not null check (char_length(trim(name)) between 1 and 80),
  event_type text not null
    check (event_type in ('order_completed', 'first_order', 'visit', 'review_submitted', 'manual')),
  is_enabled boolean not null default true,
  points integer not null default 0 check (points between 0 and 100000),
  xp integer not null default 0 check (xp between 0 and 100000),
  repeat_mode text not null default 'unlimited'
    check (repeat_mode in ('once', 'unlimited', 'limited')),
  max_awards integer check (max_awards between 1 and 100000),
  is_builtin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint loyalty_reward_rule_limit_mode check (
    (repeat_mode = 'limited' and max_awards is not null)
    or (repeat_mode <> 'limited' and max_awards is null)
  ),
  constraint loyalty_reward_rule_builtin_key unique (restaurant_id, rule_key)
);

create index if not exists loyalty_reward_rules_event_idx
  on public.loyalty_reward_rules(restaurant_id, event_type, is_enabled);

alter table public.loyalty_reward_rules enable row level security;
revoke all on public.loyalty_reward_rules from public, anon, authenticated;
grant select on public.loyalty_reward_rules to authenticated;
drop policy if exists loyalty_reward_rules_admin_read on public.loyalty_reward_rules;
create policy loyalty_reward_rules_admin_read on public.loyalty_reward_rules
  for select to authenticated
  using (
    restaurant_id = public.current_restaurant_id()
    and public.current_user_role() in ('admin', 'super-admin')
    and public.can_use_feature('loyalty')
  );

insert into public.loyalty_reward_rules(
  restaurant_id, rule_key, name, event_type, is_enabled, points, xp, repeat_mode, is_builtin
)
select ls.restaurant_id, 'order_completed', 'إتمام طلب', 'order_completed',
       ls.order_enabled, ls.order_points, ls.order_xp, 'unlimited', true
from public.loyalty_settings ls
on conflict (restaurant_id, rule_key) do nothing;

insert into public.loyalty_reward_rules(
  restaurant_id, rule_key, name, event_type, is_enabled, points, xp, repeat_mode, is_builtin
)
select ls.restaurant_id, 'first_order', 'مكافأة أول طلب', 'first_order',
       ls.first_order_enabled, ls.first_order_points, ls.first_order_xp, 'once', true
from public.loyalty_settings ls
on conflict (restaurant_id, rule_key) do nothing;

insert into public.loyalty_reward_rules(
  restaurant_id, rule_key, name, event_type, is_enabled, points, xp, repeat_mode, is_builtin
)
select ls.restaurant_id, 'visit', 'زيارة (طلب تم تسليمه)', 'visit',
       ls.visit_enabled, ls.visit_points, ls.visit_xp, 'unlimited', true
from public.loyalty_settings ls
on conflict (restaurant_id, rule_key) do nothing;

insert into public.loyalty_reward_rules(
  restaurant_id, rule_key, name, event_type, is_enabled, points, xp, repeat_mode, is_builtin
)
select ls.restaurant_id, 'review_submitted', 'تقييم', 'review_submitted',
       ls.review_enabled, ls.review_points, ls.review_xp, 'unlimited', true
from public.loyalty_settings ls
on conflict (restaurant_id, rule_key) do nothing;

create or replace function public.loyalty_ensure_reward_rules(p_restaurant_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_settings public.loyalty_settings%rowtype;
begin
  perform public.loyalty_ensure_defaults(p_restaurant_id);
  select * into v_settings
  from public.loyalty_settings ls
  where ls.restaurant_id = p_restaurant_id;

  insert into public.loyalty_reward_rules(
    restaurant_id, rule_key, name, event_type, is_enabled, points, xp, repeat_mode, is_builtin
  ) values
    (p_restaurant_id, 'order_completed', 'إتمام طلب', 'order_completed',
     v_settings.order_enabled, v_settings.order_points, v_settings.order_xp, 'unlimited', true),
    (p_restaurant_id, 'first_order', 'مكافأة أول طلب', 'first_order',
     v_settings.first_order_enabled, v_settings.first_order_points, v_settings.first_order_xp, 'once', true),
    (p_restaurant_id, 'visit', 'زيارة (طلب تم تسليمه)', 'visit',
     v_settings.visit_enabled, v_settings.visit_points, v_settings.visit_xp, 'unlimited', true),
    (p_restaurant_id, 'review_submitted', 'تقييم', 'review_submitted',
     v_settings.review_enabled, v_settings.review_points, v_settings.review_xp, 'unlimited', true)
  on conflict (restaurant_id, rule_key) do nothing;
end;
$$;

do $$
declare
  v_restaurant_id uuid;
begin
  for v_restaurant_id in select r.id from public.restaurants r loop
    perform public.loyalty_ensure_reward_rules(v_restaurant_id);
  end loop;
end;
$$;

create or replace function public.process_loyalty_reward_event(
  p_restaurant_id uuid,
  p_customer_id uuid,
  p_event_type text,
  p_reference_type text,
  p_reference_id uuid,
  p_rule_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rule record;
  v_awarded integer;
  v_awards jsonb := '[]'::jsonb;
  v_event_key text;
  v_applied boolean;
begin
  if p_event_type not in ('order_completed', 'first_order', 'visit', 'review_submitted', 'manual') then
    raise exception 'Invalid loyalty event';
  end if;

  perform public.loyalty_ensure_reward_rules(p_restaurant_id);

  perform 1
  from public.restaurant_customer_accounts rca
  where rca.id = p_customer_id and rca.restaurant_id = p_restaurant_id
  for update;
  if not found then
    return v_awards;
  end if;

  for v_rule in
    select r.*
    from public.loyalty_reward_rules r
    where r.restaurant_id = p_restaurant_id
      and r.is_enabled
      and r.event_type = p_event_type
      and (p_rule_id is null or r.id = p_rule_id)
      and (p_event_type <> 'manual' or not r.is_builtin)
    order by r.created_at, r.id
  loop
    if v_rule.repeat_mode <> 'unlimited' then
      select count(*) into v_awarded
      from public.loyalty_transactions lt
      where lt.restaurant_id = p_restaurant_id
        and lt.restaurant_customer_id = p_customer_id
        and lt.transaction_type = 'earn'
        and lt.metadata ->> 'rewardRuleId' = v_rule.id::text;

      if (v_rule.repeat_mode = 'once' and v_awarded >= 1)
         or (v_rule.repeat_mode = 'limited' and v_awarded >= v_rule.max_awards) then
        continue;
      end if;
    end if;

    v_event_key := 'loyalty_rule:' || v_rule.id::text || ':' ||
      coalesce(p_reference_type, 'manual') || ':' ||
      coalesce(p_reference_id::text, gen_random_uuid()::text);

    v_applied := public.loyalty_apply_transaction(
      p_customer_id,
      'earn',
      v_rule.points,
      v_rule.xp,
      v_rule.name,
      case when p_event_type = 'review_submitted' then 'review'
           when p_event_type = 'visit' then 'visit'
           when p_event_type = 'manual' then 'manual'
           else 'order' end,
      p_reference_id,
      v_event_key,
      jsonb_build_object(
        'rewardRuleId', v_rule.id,
        'eventType', p_event_type,
        'referenceType', p_reference_type,
        'referenceId', p_reference_id
      ),
      case when p_event_type = 'manual' then auth.uid() else null end
    );

    if v_applied then
      v_awards := v_awards || jsonb_build_array(jsonb_build_object(
        'ruleId', v_rule.id, 'name', v_rule.name,
        'points', v_rule.points, 'xp', v_rule.xp
      ));
    end if;
  end loop;

  return v_awards;
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
  select o.id, o.restaurant_id, o.status, o.restaurant_customer_id
    into v_order
  from public.orders o
  where o.id = p_order_id;

  if not found or v_order.status <> 'served' or v_order.restaurant_customer_id is null then
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
  ) then
    perform public.process_loyalty_reward_event(
      v_order.restaurant_id, v_order.restaurant_customer_id,
      'first_order', 'order', v_order.id
    );
  end if;
end;
$$;

create or replace function public.process_loyalty_review_reward()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer_id uuid;
begin
  select o.restaurant_customer_id into v_customer_id
  from public.orders o
  where o.id = new.order_id and o.restaurant_id = new.restaurant_id;

  if v_customer_id is not null then
    begin
      perform public.process_loyalty_reward_event(
        new.restaurant_id, v_customer_id,
        'review_submitted', 'review', new.order_id
      );
    exception when others then
      raise warning 'review reward processing failed for order %: %', new.order_id, sqlerrm;
    end;
  end if;
  return new;
end;
$$;

drop trigger if exists order_feedback_award_loyalty on public.order_feedback;
create trigger order_feedback_award_loyalty
after insert on public.order_feedback
for each row execute function public.process_loyalty_review_reward();

create or replace function public.admin_get_loyalty_reward_rules()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_restaurant_id uuid := public.loyalty_current_admin_restaurant();
  v_rules jsonb;
begin
  if not public.can_use_feature('loyalty') then
    raise exception 'Loyalty is not available on the current plan.';
  end if;
  perform public.loyalty_ensure_reward_rules(v_restaurant_id);
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', r.id, 'ruleKey', r.rule_key, 'name', r.name,
    'eventType', r.event_type, 'isEnabled', r.is_enabled,
    'points', r.points, 'xp', r.xp, 'repeatMode', r.repeat_mode,
    'maxAwards', r.max_awards, 'isBuiltin', r.is_builtin
  ) order by r.is_builtin desc, r.created_at, r.id), '[]'::jsonb)
  into v_rules
  from public.loyalty_reward_rules r
  where r.restaurant_id = v_restaurant_id;
  return v_rules;
end;
$$;

create or replace function public.admin_save_loyalty_reward_rules(p_rules jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_restaurant_id uuid := public.loyalty_current_admin_restaurant();
  v_rule jsonb;
  v_id uuid;
  v_repeat text;
  v_mode text;
begin
  if not public.can_use_feature('loyalty') then
    raise exception 'Loyalty is not available on the current plan.';
  end if;
  if jsonb_typeof(p_rules) <> 'array' then
    raise exception 'Invalid loyalty rules';
  end if;

  for v_rule in select value from jsonb_array_elements(p_rules)
  loop
    v_id := nullif(v_rule ->> 'id', '')::uuid;
    v_repeat := coalesce(v_rule ->> 'repeatMode', 'unlimited');
    v_mode := coalesce(v_rule ->> 'eventType', '');

    if v_repeat not in ('once', 'unlimited', 'limited')
       or v_mode not in ('order_completed', 'first_order', 'visit', 'review_submitted', 'manual') then
      raise exception 'Invalid loyalty rule configuration';
    end if;
    if v_repeat = 'limited'
       and coalesce((v_rule ->> 'maxAwards')::integer, 0) not between 1 and 100000 then
      raise exception 'Invalid loyalty reward limit';
    end if;
    if coalesce((v_rule ->> 'points')::integer, -1) not between 0 and 100000
       or coalesce((v_rule ->> 'xp')::integer, -1) not between 0 and 100000 then
      raise exception 'Invalid loyalty reward amount';
    end if;

    if v_id is not null then
      update public.loyalty_reward_rules r
      set name = case when r.is_builtin then r.name else left(trim(v_rule ->> 'name'), 80) end,
          event_type = case when r.is_builtin then r.event_type else v_mode end,
          is_enabled = coalesce((v_rule ->> 'isEnabled')::boolean, r.is_enabled),
          points = (v_rule ->> 'points')::integer,
          xp = (v_rule ->> 'xp')::integer,
          repeat_mode = case when r.rule_key = 'first_order' then 'once' else v_repeat end,
          max_awards = case
            when r.rule_key = 'first_order' or v_repeat <> 'limited' then null
            else (v_rule ->> 'maxAwards')::integer
          end,
          updated_at = now()
      where r.id = v_id and r.restaurant_id = v_restaurant_id;
      if not found then
        raise exception 'Loyalty rule not found';
      end if;
    else
      if length(trim(coalesce(v_rule ->> 'name', ''))) not between 1 and 80 then
        raise exception 'Invalid loyalty rule name';
      end if;
      insert into public.loyalty_reward_rules(
        restaurant_id, name, event_type, is_enabled, points, xp,
        repeat_mode, max_awards, is_builtin
      ) values (
        v_restaurant_id, left(trim(v_rule ->> 'name'), 80), v_mode,
        coalesce((v_rule ->> 'isEnabled')::boolean, true),
        (v_rule ->> 'points')::integer, (v_rule ->> 'xp')::integer,
        v_repeat,
        case when v_repeat = 'limited' then (v_rule ->> 'maxAwards')::integer else null end,
        false
      );
    end if;
  end loop;

  return public.admin_get_loyalty_reward_rules();
end;
$$;

create or replace function public.admin_delete_loyalty_reward_rule(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_restaurant_id uuid := public.loyalty_current_admin_restaurant();
begin
  if not public.can_use_feature('loyalty') then
    raise exception 'Loyalty is not available on the current plan.';
  end if;
  delete from public.loyalty_reward_rules r
   where r.id = p_id and r.restaurant_id = v_restaurant_id and not r.is_builtin;
  if not found then
    raise exception 'Custom loyalty rule not found';
  end if;
end;
$$;

create or replace function public.admin_award_loyalty_rule(
  p_customer_id uuid,
  p_rule_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_restaurant_id uuid := public.loyalty_current_admin_restaurant();
  v_rule public.loyalty_reward_rules%rowtype;
  v_awards jsonb;
begin
  if not public.can_use_feature('loyalty') then
    raise exception 'Loyalty is not available on the current plan.';
  end if;
  select * into v_rule
  from public.loyalty_reward_rules r
  where r.id = p_rule_id and r.restaurant_id = v_restaurant_id
    and not r.is_builtin and r.is_enabled and r.event_type = 'manual';
  if not found then
    raise exception 'Manual loyalty rule not found';
  end if;
  v_awards := public.process_loyalty_reward_event(
    v_restaurant_id, p_customer_id, 'manual', 'manual', gen_random_uuid(), p_rule_id
  );
  if not exists (
    select 1 from jsonb_array_elements(v_awards) award
    where award ->> 'ruleId' = p_rule_id::text
  ) then
    raise exception 'Loyalty rule reward limit reached';
  end if;
  return v_awards;
end;
$$;

create or replace function public.submit_order_feedback(
  p_restaurant_id uuid,
  p_order_id uuid,
  p_ease_of_order text,
  p_menu_clarity text,
  p_menu_usability text,
  p_overall_experience text,
  p_comment text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_comment text := nullif(trim(coalesce(p_comment, '')), '');
  v_points integer := 0;
  v_xp integer := 0;
begin
  if p_ease_of_order is null or p_ease_of_order not in ('excellent', 'good', 'acceptable', 'poor')
     or p_menu_clarity is null or p_menu_clarity not in ('excellent', 'good', 'acceptable', 'poor')
     or p_menu_usability is null or p_menu_usability not in ('excellent', 'good', 'acceptable', 'poor')
     or p_overall_experience is null or p_overall_experience not in ('excellent', 'good', 'acceptable', 'poor') then
    raise exception 'Invalid feedback choice';
  end if;
  if v_comment is not null and char_length(v_comment) > 1000 then
    raise exception 'Feedback comment is too long';
  end if;

  select o.status into v_status
  from public.orders o
  where o.id = p_order_id and o.restaurant_id = p_restaurant_id;
  if not found then
    return jsonb_build_object('submitted', false, 'status', 'not_found');
  end if;
  if v_status not in ('new', 'accepted', 'preparing', 'ready') then
    return jsonb_build_object('submitted', false, 'status', 'not_eligible');
  end if;

  insert into public.order_feedback(
    restaurant_id, order_id, ease_of_order, menu_clarity,
    menu_usability, overall_experience, comment
  ) values (
    p_restaurant_id, p_order_id, p_ease_of_order, p_menu_clarity,
    p_menu_usability, p_overall_experience, v_comment
  );

  select coalesce(sum(lt.points_delta), 0), coalesce(sum(lt.xp_delta), 0)
    into v_points, v_xp
  from public.loyalty_transactions lt
  where lt.restaurant_id = p_restaurant_id
    and lt.reference_type = 'review'
    and lt.reference_id = p_order_id
    and lt.metadata ->> 'eventType' = 'review_submitted';

  return jsonb_build_object(
    'submitted', true, 'status', 'submitted',
    'rewardPoints', v_points, 'rewardXp', v_xp
  );
exception
  when unique_violation then
    return jsonb_build_object('submitted', false, 'status', 'already_submitted', 'rewardPoints', 0, 'rewardXp', 0);
end;
$$;

create or replace function public.submit_order_feedback(
  p_restaurant_id uuid,
  p_order_id uuid,
  p_ease_of_order text,
  p_menu_clarity text,
  p_menu_usability text,
  p_overall_experience text,
  p_comment text,
  p_tracking_token text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.guest_order_token_valid(p_restaurant_id, p_order_id, p_tracking_token) then
    return jsonb_build_object('submitted', false, 'status', 'not_found');
  end if;
  return public.submit_order_feedback(
    p_restaurant_id, p_order_id, p_ease_of_order, p_menu_clarity,
    p_menu_usability, p_overall_experience, p_comment
  );
end;
$$;

create table if not exists public.customer_reward_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  restaurant_customer_id uuid not null,
  endpoint text not null unique,
  p256dh_key text not null,
  auth_key text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customer_reward_push_customer_fk
    foreign key (restaurant_customer_id, restaurant_id)
    references public.restaurant_customer_accounts(id, restaurant_id) on delete cascade
);

create index if not exists customer_reward_push_account_idx
  on public.customer_reward_push_subscriptions(restaurant_id, restaurant_customer_id);

alter table public.customer_reward_push_subscriptions enable row level security;
revoke all on public.customer_reward_push_subscriptions from public, anon, authenticated;

create or replace function public.upsert_customer_reward_push_subscription(
  p_restaurant_id uuid,
  p_session_token text,
  p_endpoint text,
  p_p256dh_key text,
  p_auth_key text,
  p_user_agent text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer_id uuid := public.customer_session_account_id(p_restaurant_id, p_session_token);
  v_endpoint_scheme text;
begin
  if v_customer_id is null then raise exception 'CUSTOMER_SESSION_INVALID'; end if;
  if length(coalesce(p_endpoint, '')) not between 1 and 4096
     or length(coalesce(p_p256dh_key, '')) not between 1 and 512
     or length(coalesce(p_auth_key, '')) not between 1 and 512 then
    raise exception 'Invalid push subscription';
  end if;
  v_endpoint_scheme := lower(split_part(p_endpoint, ':', 1));
  if v_endpoint_scheme <> 'https' then
    raise exception 'Invalid push subscription endpoint';
  end if;
  insert into public.customer_reward_push_subscriptions(
    restaurant_id, restaurant_customer_id, endpoint, p256dh_key, auth_key, user_agent
  ) values (
    p_restaurant_id, v_customer_id, p_endpoint, p_p256dh_key, p_auth_key, left(p_user_agent, 500)
  )
  on conflict (endpoint) do update set
    restaurant_id = excluded.restaurant_id,
    restaurant_customer_id = excluded.restaurant_customer_id,
    p256dh_key = excluded.p256dh_key,
    auth_key = excluded.auth_key,
    user_agent = excluded.user_agent,
    updated_at = now();
  return jsonb_build_object('saved', true);
end;
$$;

create or replace function public.remove_customer_reward_push_subscription(
  p_restaurant_id uuid,
  p_session_token text,
  p_endpoint text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer_id uuid := public.customer_session_account_id(p_restaurant_id, p_session_token);
begin
  if v_customer_id is null then raise exception 'CUSTOMER_SESSION_INVALID'; end if;
  delete from public.customer_reward_push_subscriptions
  where restaurant_id = p_restaurant_id
    and restaurant_customer_id = v_customer_id
    and endpoint = p_endpoint;
end;
$$;

create or replace function public.enqueue_customer_reward_push()
returns trigger
language plpgsql
security definer
set search_path = public, net, vault
as $$
declare
  v_function_url text;
  v_webhook_secret text;
begin
  if new.points_delta <= 0 and new.xp_delta <= 0 then return new; end if;

  begin
  select decrypted_secret into v_function_url
  from vault.decrypted_secrets where name = 'waiter_push_function_url';
  select decrypted_secret into v_webhook_secret
  from vault.decrypted_secrets where name = 'waiter_push_webhook_secret';
  if v_function_url is null or v_webhook_secret is null then
    raise warning 'Customer reward Push is not configured in Vault; notification skipped.';
    return new;
  end if;

  perform net.http_post(
    url := v_function_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-waiter-webhook-secret', v_webhook_secret
    ),
    body := jsonb_build_object(
      'type', 'customer_reward',
      'restaurant_id', new.restaurant_id,
      'customer_id', new.restaurant_customer_id,
      'transaction_id', new.id,
      'title', 'مكافأة جديدة',
      'body', 'ربحت ' ||
        case when new.points_delta > 0 then new.points_delta || ' نقطة' else '' end ||
        case when new.points_delta > 0 and new.xp_delta > 0 then ' و' else '' end ||
        case when new.xp_delta > 0 then new.xp_delta || ' XP' else '' end ||
        ' — ' || new.reason
    )
  );
  exception when others then
    raise warning 'Customer reward Push enqueue failed for transaction %: %', new.id, sqlerrm;
  end;
  return new;
end;
$$;

drop trigger if exists loyalty_customer_reward_push_after_insert on public.loyalty_transactions;
create trigger loyalty_customer_reward_push_after_insert
after insert on public.loyalty_transactions
for each row execute function public.enqueue_customer_reward_push();

revoke all on function public.process_loyalty_reward_event(uuid, uuid, text, text, uuid, uuid) from public, anon, authenticated;
revoke all on function public.loyalty_ensure_reward_rules(uuid) from public, anon, authenticated;
revoke all on function public.loyalty_process_order(uuid) from public, anon, authenticated;
revoke all on function public.process_loyalty_review_reward() from public, anon, authenticated;
revoke all on function public.admin_get_loyalty_reward_rules() from public, anon;
revoke all on function public.admin_save_loyalty_reward_rules(jsonb) from public, anon;
revoke all on function public.admin_delete_loyalty_reward_rule(uuid) from public, anon;
revoke all on function public.admin_award_loyalty_rule(uuid, uuid) from public, anon;
revoke all on function public.submit_order_feedback(uuid, uuid, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.submit_order_feedback(uuid, uuid, text, text, text, text, text, text) from public;
revoke all on function public.upsert_customer_reward_push_subscription(uuid, text, text, text, text, text) from public;
revoke all on function public.remove_customer_reward_push_subscription(uuid, text, text) from public;
revoke all on function public.enqueue_customer_reward_push() from public, anon, authenticated;
grant execute on function public.admin_get_loyalty_reward_rules() to authenticated;
grant execute on function public.admin_save_loyalty_reward_rules(jsonb) to authenticated;
grant execute on function public.admin_delete_loyalty_reward_rule(uuid) to authenticated;
grant execute on function public.admin_award_loyalty_rule(uuid, uuid) to authenticated;
grant execute on function public.submit_order_feedback(uuid, uuid, text, text, text, text, text, text) to anon, authenticated;
grant execute on function public.upsert_customer_reward_push_subscription(uuid, text, text, text, text, text) to anon, authenticated;
grant execute on function public.remove_customer_reward_push_subscription(uuid, text, text) to anon, authenticated;
