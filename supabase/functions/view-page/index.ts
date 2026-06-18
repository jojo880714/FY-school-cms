// view-page — 公開 LP 服務 EF
//
// 用途:接 ?slug=<xxx>,從 supabase.generated_pages 撈該 slug 的 html_content,
// 直接吐 HTML 出去當公開連結用。
//
// 補進 repo:2026-06-18(Phase 20 Group 2 prep)— 此檔之前 deployed-only,
// 早期透過 Supabase Studio 直接 deploy 留下無 source 的技術債。
// 用 mcp__supabase__get_edge_function('view-page') 拉回 v6 source,落 repo 留底。
//
// **重要**:repo 內這份是 v6 的 snapshot。實際 deployed 仍是 v6;
// 之後重新 deploy 才會以 repo 為準。

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req: Request) => {
  const url = new URL(req.url);
  const slug = url.searchParams.get("slug");

  if (!slug) {
    return new Response("<h1>Missing slug</h1>", {
      status: 400,
      headers: { "Content-Type": "text/html; charset=UTF-8" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const { data, error } = await supabase
    .from("generated_pages")
    .select("html_content")
    .eq("slug", slug)
    .single();

  if (error || !data?.html_content) {
    return new Response("<h1>Page not found</h1>", {
      status: 404,
      headers: { "Content-Type": "text/html; charset=UTF-8" },
    });
  }

  const encoder = new TextEncoder();
  const bytes = encoder.encode(data.html_content);

  return new Response(bytes, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=UTF-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
});
