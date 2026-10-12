-- Create customer orders with their validated session account already linked.
-- This lets served-order triggers count missions even when checkout has no phone number.
create or replace function public.create_guest_order_for_customer_session(
  p_restaurant_id uuid,
  p_table_id uuid,
  p_customer_name text,
  p_customer_phone text,
  p_notes text,
  p_total numeric,
  p_items jsonb,
  p_customer_session_token text,
  p_payment_method text default 'cash',
  p_payment_provider text default null,
  p_payment_proof_data text default null,
  p_qr_seed integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer_account_id uuid;
  v_order jsonb;
  v_order_id uuid;
  v_updated integer;
begin
  v_customer_account_id := public.customer_session_account_id(
    p_restaurant_id, p_customer_session_token
  );
  if v_customer_account_id is null then
    raise exception 'CUSTOMER_SESSION_INVALID';
  end if;

  v_order := public.create_guest_order(
    p_restaurant_id,
    p_table_id,
    p_customer_name,
    p_customer_phone,
    p_notes,
    p_total,
    p_items,
    p_payment_method,
    p_payment_provider,
    p_payment_proof_data,
    p_qr_seed
  );
  v_order_id := nullif(v_order ->> 'id', '')::uuid;
  if v_order_id is null then
    raise exception 'ORDER_ID_MISSING';
  end if;

  update public.orders
     set restaurant_customer_id = v_customer_account_id
   where id = v_order_id
     and restaurant_id = p_restaurant_id;
  get diagnostics v_updated = row_count;

  if v_updated <> 1 then
    raise exception 'ORDER_CUSTOMER_LINK_FAILED';
  end if;

  return v_order;
end;
$$;

revoke all on function public.create_guest_order_for_customer_session(
  uuid, uuid, text, text, text, numeric, jsonb, text, text, text, text, integer
) from public;
grant execute on function public.create_guest_order_for_customer_session(
  uuid, uuid, text, text, text, numeric, jsonb, text, text, text, text, integer
) to anon, authenticated;
