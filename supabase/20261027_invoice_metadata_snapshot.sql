begin;

alter table public.orders
  add column if not exists invoice_snapshot jsonb;

alter table public.orders
  add column if not exists invoice_issued_at timestamptz;

alter table public.restaurants
  add column if not exists invoice_stamp text;

alter table public.orders
  drop constraint if exists orders_invoice_snapshot_object;
alter table public.orders
  add constraint orders_invoice_snapshot_object
  check (
    invoice_snapshot is null
    or jsonb_typeof(invoice_snapshot) = 'object'
  );

update public.orders o
set invoice_snapshot = jsonb_build_object(
  'snapshot_version', 1,
  'restaurant_name', r.name,
  'restaurant_phone', r.phone,
  'restaurant_address', r.address,
  'invoice_stamp', r.invoice_stamp,
  'table_name', (
    select t.name
    from public.restaurant_tables t
    where t.id = o.table_id
      and t.restaurant_id = o.restaurant_id
  ),
  'table_code', (
    select t.code
    from public.restaurant_tables t
    where t.id = o.table_id
      and t.restaurant_id = o.restaurant_id
  ),
  'legacy_backfill', true
)
from public.restaurants r
where o.restaurant_id = r.id
  and o.invoice_issued
  and o.invoice_snapshot is null;

update public.orders
set invoice_issued_at = created_at
where invoice_issued
  and invoice_issued_at is null;

create index if not exists orders_issued_invoice_date_idx
  on public.orders (restaurant_id, invoice_issued_at desc)
  where invoice_issued;

create or replace function public.capture_order_invoice_snapshot()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_restaurant public.restaurants%rowtype;
  v_table public.restaurant_tables%rowtype;
  v_should_snapshot boolean := false;
begin
  if tg_op = 'DELETE' then
    if old.invoice_issued then
      raise exception 'Issued invoices cannot be deleted';
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE' then
    if old.invoice_issued then
      new.invoice_issued := true;
      new.invoice_snapshot := old.invoice_snapshot;
      new.invoice_issued_at := old.invoice_issued_at;
      new.restaurant_id := old.restaurant_id;
      new.table_id := old.table_id;
      new.order_number := old.order_number;
      new.created_at := old.created_at;
      new.customer_name := old.customer_name;
      new.customer_phone := old.customer_phone;
      new.notes := old.notes;
      new.total := old.total;
      new.payment_method := old.payment_method;
      new.payment_provider := old.payment_provider;
      new.payment_proof_data := old.payment_proof_data;
      return new;
    end if;
  end if;

  if tg_op = 'INSERT' then
    v_should_snapshot := new.invoice_issued;
  elsif tg_op = 'UPDATE' then
    v_should_snapshot := new.invoice_issued and not old.invoice_issued;
  end if;

  if v_should_snapshot then
    select *
      into v_restaurant
      from public.restaurants r
     where r.id = new.restaurant_id;

    if new.table_id is not null then
      select *
        into v_table
        from public.restaurant_tables t
       where t.id = new.table_id
         and t.restaurant_id = new.restaurant_id;
    end if;

    new.invoice_snapshot := jsonb_build_object(
      'snapshot_version', 1,
      'restaurant_name', v_restaurant.name,
      'restaurant_phone', v_restaurant.phone,
      'restaurant_address', v_restaurant.address,
      'invoice_stamp', v_restaurant.invoice_stamp,
      'table_name', v_table.name,
      'table_code', v_table.code,
      'legacy_backfill', false
    );
    new.invoice_issued_at := clock_timestamp();
  elsif not new.invoice_issued then
    new.invoice_issued_at := null;
  end if;

  return new;
end;
$$;

revoke all on function public.capture_order_invoice_snapshot()
  from public, anon, authenticated;

drop trigger if exists orders_capture_invoice_snapshot on public.orders;
create trigger orders_capture_invoice_snapshot
before insert or update or delete on public.orders
for each row
execute function public.capture_order_invoice_snapshot();

create or replace function public.prevent_issued_invoice_item_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id uuid;
begin
  if tg_op = 'DELETE' or tg_op = 'UPDATE' then
    v_order_id := old.order_id;
    if exists (
      select 1 from public.orders o
      where o.id = v_order_id and o.invoice_issued
    ) then
      raise exception 'Issued invoice items are immutable';
    end if;
  end if;

  if tg_op = 'INSERT' or tg_op = 'UPDATE' then
    if exists (
      select 1 from public.orders o
      where o.id = new.order_id and o.invoice_issued
    ) then
      raise exception 'Issued invoice items are immutable';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function public.prevent_issued_invoice_item_changes()
  from public, anon, authenticated;

drop trigger if exists order_items_prevent_issued_invoice_changes
  on public.order_items;
create trigger order_items_prevent_issued_invoice_changes
before insert or update or delete on public.order_items
for each row
execute function public.prevent_issued_invoice_item_changes();

commit;
