  import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
  import webpush from "npm:web-push@3.6.7";

  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "content-type, x-waiter-webhook-secret",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  };

  const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
  const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
  const vapidSubject = Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@example.com";
  const webhookSecret = Deno.env.get("WAITER_PUSH_WEBHOOK_SECRET") ?? "";

  if (vapidPublicKey && vapidPrivateKey) {
    webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
  }

  function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  Deno.serve(async (request) => {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });

    // The VAPID public key is intentionally public; the private key is only an Edge secret.
    if (request.method === "GET") {
      return vapidPublicKey ? json({ publicKey: vapidPublicKey }) : json({ error: "Push is not configured." }, 503);
    }

    if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);
    if (!webhookSecret || request.headers.get("x-waiter-webhook-secret") !== webhookSecret) {
      console.warn("Rejected waiter Push request with an invalid webhook secret.");
      return json({ error: "Unauthorized." }, 401);
    }
    if (!vapidPublicKey || !vapidPrivateKey) return json({ error: "Push is not configured." }, 503);

    try {
      const event = await request.json();
      const admin = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      );
      const isCustomerReward = event?.type === "customer_reward";
      const call = event?.record ?? event;
      if (isCustomerReward && (!event?.transaction_id || !event?.restaurant_id || !event?.customer_id)) {
        return json({ error: "Invalid customer reward payload." }, 400);
      }
      if (!isCustomerReward && (!call?.id || !call?.restaurant_id)) {
        return json({ error: "Invalid waiter-call payload." }, 400);
      }

      let subscriptionQuery = admin
        .from(isCustomerReward ? "customer_reward_push_subscriptions" : "push_subscriptions")
        .select("id, endpoint, p256dh_key, auth_key")
        .eq("restaurant_id", isCustomerReward ? event.restaurant_id : call.restaurant_id);
      if (isCustomerReward) {
        subscriptionQuery = subscriptionQuery.eq("restaurant_customer_id", event.customer_id);
      }
      const { data: subscriptions, error } = await subscriptionQuery;
      if (error) throw error;

      const table = call.table_code ? ` — طاولة ${call.table_code}` : "";
      const payload = JSON.stringify(isCustomerReward
        ? {
            type: "customer_reward",
            title: event.title || "مكافأة جديدة",
            body: event.body || "ربحت نقاطًا جديدة!",
            tag: `customer-reward-${event.transaction_id}`,
            url: `/Pages/Menu.html?restaurant_id=${encodeURIComponent(event.restaurant_id)}`,
          }
        : {
            title: "نداء جديد",
            body: `الضيف: ${call.guest_name || "ضيف"}${table}`,
            tag: `waiter-call-${call.id}`,
            url: "/Pages/WaiterDashboard.html",
          });

      let delivered = 0;
      await Promise.all((subscriptions ?? []).map(async (subscription) => {
        try {
          await webpush.sendNotification({
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.p256dh_key, auth: subscription.auth_key },
          }, payload, { TTL: 120, urgency: "high" });
          delivered += 1;
        } catch (error: any) {
          const status = error?.statusCode;
          console.error("Waiter Push delivery failed:", subscription.id, status ?? error);
          if (status === 404 || status === 410) {
            await admin
              .from(isCustomerReward ? "customer_reward_push_subscriptions" : "push_subscriptions")
              .delete()
              .eq("id", subscription.id);
          }
        }
      }));

      console.info("Push processed.", {
        type: isCustomerReward ? "customer_reward" : "waiter_call",
        eventId: isCustomerReward ? event.transaction_id : call.id,
        restaurantId: isCustomerReward ? event.restaurant_id : call.restaurant_id,
        delivered,
      });
      return json({ delivered });
    } catch (error: any) {
      console.error("Waiter Push function error:", error);
      return json({ error: error?.message || "Unexpected error." }, 500);
    }
  });
