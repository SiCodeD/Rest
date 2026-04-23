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
    const { school_name, admin_email, location, plan } = await req.json();

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // 1. إنشاء المدرسة
    const { data: school, error: schoolError } = await supabaseAdmin
      .from("schools")
      .insert([{ name: school_name, location, plan }])
      .select()
      .single();

    if (schoolError) {
      return new Response(JSON.stringify(schoolError), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. إرسال الدعوة
    const { data: user, error: inviteError } =
      await supabaseAdmin.auth.admin.inviteUserByEmail(admin_email, {
        data: { role: "admin", school_id: school.id },
      });

    if (inviteError) {
      return new Response(JSON.stringify(inviteError), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3. إنشاء البروفايل
    await supabaseAdmin.from("profiles").insert([
      {
        id: user.user.id,
        school_id: school.id,
        full_name: "School Admin",
        role: "admin",
      },
    ]);

    return new Response(JSON.stringify({ message: "Success" }), {
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