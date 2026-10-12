begin;

create table if not exists public.order_payment_events (
  id bigint generated always as identity primary key,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  previous_status text not null
    check (previous_status in ('cashier_pending', 'pending_review', 'verified', 'rejected')),
  new_status text not null
    check (new_status in ('cashier_pending', 'pending_review', 'verified', 'rejected')),
  created_at timestamptz not null default clock_timestamp()
);

create index if not exists order_payment_events_order_created_idx
  on public.order_payment_events (order_id, created_at desc);

alter table public.order_payment_events enable row level security;
revoke all on table public.order_payment_events from public, anon, authenticated;

create or replace function public.admin_set_order_payment_status(
  p_order_id uuid,
  p_payment_status text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_restaurant_id uuid := public.current_restaurant_id();
  v_actor_id uuid := auth.uid();
begin
  if v_actor_id is null
     or coalesce(public.current_user_role(), '') not in ('admin', 'super-admin')
     or v_restaurant_id is null then
    raise exception 'Not authorized to update order payments';
  end if;

  if p_payment_status is null
     or p_payment_status not in ('verified', 'rejected') then
    raise exception 'Invalid payment status';
  end if;

  select *
    into v_order
    from public.orders
   where id = p_order_id
     and restaurant_id = v_restaurant_id
   for update;

  if not found then
    raise exception 'Order not found';
  end if;

  if v_order.payment_status = p_payment_status then
    return p_payment_status;
  end if;

  if v_order.status = 'cancelled' then
    raise exception 'Cancelled orders cannot be marked as paid';
  end if;

  if v_order.status not in ('accepted', 'preparing', 'ready', 'served') then
    raise exception 'Order must be accepted before updating its payment status';
  end if;

  if p_payment_status = 'verified'
     and v_order.payment_method = 'electronic'
     and nullif(trim(coalesce(v_order.payment_proof_data, '')), '') is null then
    raise exception 'Payment proof is required before approving an electronic payment';
  end if;

  if not (
    (
      v_order.payment_method = 'cash'
      and v_order.payment_status = 'cashier_pending'
      and p_payment_status = 'verified'
    )
    or (
      v_order.payment_method = 'electronic'
      and v_order.payment_status = 'pending_review'
      and p_payment_status in ('verified', 'rejected')
    )
  ) then
    raise exception 'Payment status transition is not allowed';
  end if;

  update public.orders
     set payment_status = p_payment_status,
         invoice_issued = case
           when p_payment_status = 'verified' then true
           else invoice_issued
         end
   where id = v_order.id;

  insert into public.order_payment_events (
    restaurant_id,
    order_id,
    actor_id,
    previous_status,
    new_status
  ) values (
    v_order.restaurant_id,
    v_order.id,
    v_actor_id,
    v_order.payment_status,
    p_payment_status
  );

  return p_payment_status;
end;
$$;

revoke all on function public.admin_set_order_payment_status(uuid, text)
  from public, anon;
grant execute on function public.admin_set_order_payment_status(uuid, text)
  to authenticated;

create or replace function public.issue_table_invoice(
  p_restaurant_id uuid,
  p_table_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
begin
  if coalesce(public.current_user_role(), '') not in ('admin', 'super-admin')
     or public.current_restaurant_id() is distinct from p_restaurant_id then
    raise exception 'Not authorized';
  end if;

  select *
    into v_order
    from public.orders o
   where o.restaurant_id = p_restaurant_id
     and o.table_id = p_table_id
   order by o.created_at desc
   limit 1
   for update;

  if not found or v_order.status <> 'served' then
    raise exception 'No eligible order found for this table';
  end if;

  if not v_order.invoice_issued then
    update public.orders
       set invoice_issued = true
     where id = v_order.id;
  end if;

  update public.restaurant_tables
     set status = 'available'
   where id = p_table_id
     and restaurant_id = p_restaurant_id;
end;
$$;

revoke all on function public.issue_table_invoice(uuid, uuid)
  from public, anon;
grant execute on function public.issue_table_invoice(uuid, uuid)
  to authenticated;

commit;
