// issue-quote-token — 簽 SSO JWT 給報價系統用
//
// 流程:
//   1. 前端帶 Supabase auth session 呼叫
//   2. 用 service_role key 驗證 session → 拿 user.app_metadata
//   3. 從 app_metadata 讀 employee_id / role / display_name
//   4. 用 QUOTE_SSO_SECRET(HMAC-SHA256)簽一份 JWT
//   5. 回傳 { token: 'eyJ...' }
//
// 報價系統端應驗:
//   - HS256 簽章(用同一 QUOTE_SSO_SECRET)
//   - iss === 'fy-cms'
//   - aud === 'fy-quote'
//   - exp > now
//
// JWT payload:
//   { sub: employee_id, name: display_name, role: 'advisor'|'manager',
//     iss: 'fy-cms', aud: 'fy-quote', iat, exp }

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { create, getNumericDate } from "https://deno.land/x/djwt@v3.0.2/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonResp(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResp(401, { error: "缺少 Authorization header" });
    }
    const sessionToken = authHeader.replace(/^Bearer\s+/i, "");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const { data: userData, error: userErr } = await supabase.auth.getUser(sessionToken);
    if (userErr || !userData.user) {
      return jsonResp(401, { error: "Session 無效或已過期" });
    }
    const user = userData.user;

    // 從 raw_app_meta_data 讀(管理員在 Studio 手動填,或之後做 user_profiles table)
    const meta = (user.app_metadata ?? {}) as Record<string, unknown>;
    const employee_id = typeof meta.employee_id === "string" ? meta.employee_id : null;
    const role = typeof meta.role === "string" ? meta.role : "advisor";
    const display_name = typeof meta.display_name === "string"
      ? meta.display_name
      : (user.email ?? "—");

    if (!employee_id) {
      return jsonResp(403, {
        error: "顧問尚未綁定員編。請管理員在 Supabase Studio 的 auth.users 設 raw_app_meta_data.employee_id",
      });
    }

    const secret = Deno.env.get("QUOTE_SSO_SECRET");
    if (!secret) {
      return jsonResp(500, {
        error: "QUOTE_SSO_SECRET 未設定。請至 Supabase Studio → Edge Functions → Secrets 設定",
      });
    }

    // HMAC-SHA256
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );

    const jwt = await create(
      { alg: "HS256", typ: "JWT" },
      {
        sub: employee_id,
        name: display_name,
        role,
        iss: "fy-cms",
        aud: "fy-quote",
        iat: getNumericDate(0),
        exp: getNumericDate(60 * 60), // 1 小時
      },
      key,
    );

    return jsonResp(200, { token: jwt });
  } catch (err) {
    console.error("issue-quote-token error:", String(err));
    return jsonResp(500, { error: String(err) });
  }
});
