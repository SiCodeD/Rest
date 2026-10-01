import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*", // للتطوير
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  // 🔥 حل مشكلة CORS (preflight)
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  try {
    const payload = await req.json();
    const restaurantName = String(payload.restaurant_name || "").trim();
    const slug = String(payload.slug || "").trim().toLowerCase();
    const adminName = String(payload.admin_name || "").trim();
    const adminId = String(payload.admin_id || "").trim();
    const adminPhone = String(payload.admin_phone || "").trim();
    const username = String(payload.admin_username || "").trim().toLowerCase();
    const password = String(payload.admin_password || "");
    const location = String(payload.location || "").trim();
    const plan = String(payload.plan || "starter").trim();

    if (!/^[a-z0-9._-]{3,60}$/.test(username)) {
      return new Response(JSON.stringify({ error: "اسم المستخدم غير صالح." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!restaurantName || !adminName || password.length < 6) {
      return new Response(JSON.stringify({ error: "أكمل بيانات المطعم والمدير، واجعل كلمة المرور 6 أحرف على الأقل." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length < 3 || slug.length > 60) {
      return new Response(JSON.stringify({ error: "رابط المنيو غير صالح. استخدم أحرفاً إنجليزية صغيرة وأرقاماً وشرطة فقط." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!["starter", "professional", "enterprise"].includes(plan)) {
      return new Response(JSON.stringify({ error: "الخطة المحددة غير صالحة." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Supabase Auth still needs an email-shaped identifier internally.
    // The manager only uses the username shown in the dashboard.
    const internalEmail = `${username}@auth.internal`;

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const token = (req.headers.get("Authorization") || "")
      .replace(/^Bearer\s+/i, "")
      .trim();
    const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !authData.user) {
      return new Response(JSON.stringify({ error: "انتهت جلسة الدخول." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: callerProfile, error: callerError } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", authData.user.id)
      .maybeSingle();
    if (callerError || callerProfile?.role !== "super-admin") {
      return new Response(JSON.stringify({ error: "ليس لديك صلاحية إنشاء المطاعم." }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1. Create the restaurant
    const { data: restaurant, error: restaurantError } = await supabaseAdmin
      .from("restaurants")
      .insert([{ name: restaurantName, slug, address: location || null, plan }])
      .select()
      .single();

    if (restaurantError) {
      return new Response(JSON.stringify(restaurantError), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. إنشاء المستخدم مباشرة بالباسورد المقدمة
    const { data: user, error: createError } =
      await supabaseAdmin.auth.admin.createUser({
        email: internalEmail,
        password,
        email_confirm: true, // تفعيل الإيميل مباشرة
        user_metadata: { role: "admin", restaurant_id: restaurant.id },
      });

    if (createError) {
      const { error: cleanupError } = await supabaseAdmin
        .from("restaurants")
        .delete()
        .eq("id", restaurant.id);
      const usernameAlreadyUsed = /already (been )?registered|already exists/i.test(
        createError.message || "",
      );
      return new Response(JSON.stringify({
        error: usernameAlreadyUsed
          ? "اسم المستخدم مستخدم مسبقاً. اختر اسماً آخر."
          : createError.message,
        cleanup_error: cleanupError?.message,
      }), {
        status: usernameAlreadyUsed ? 409 : 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3. إنشاء البروفايل
    const { error: profileError } = await supabaseAdmin.from("profiles").insert([
      {
        id: user.user.id,
        restaurant_id: restaurant.id,
        full_name: adminName,
        username,
        national_id: adminId || null,
        phone: adminPhone || null,
        role: "admin",
      },
    ]);
    if (profileError) {
      const { error: userCleanupError } = await supabaseAdmin.auth.admin.deleteUser(
        user.user.id,
      );
      const { error: restaurantCleanupError } = await supabaseAdmin
        .from("restaurants")
        .delete()
        .eq("id", restaurant.id);
      return new Response(JSON.stringify({
        error: profileError.message,
        cleanup_error:
          userCleanupError?.message || restaurantCleanupError?.message,
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ message: "تم إنشاء المطعم وحساب المدير بنجاح.", username }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});