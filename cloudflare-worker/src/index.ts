export interface Env {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
}

const NOT_FOUND_HTML = `<!DOCTYPE html>
<html lang="zh-TW"><head><meta charset="UTF-8"><title>404</title>
<style>body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f9fafb;color:#374151}main{text-align:center}h1{font-size:48px;margin:0 0 8px;color:#C41E3A}p{margin:0;color:#6b7280}</style>
</head><body><main><h1>404</h1><p>找不到此比較頁面</p></main></body></html>`;

const MISSING_SLUG_HTML = `<!DOCTYPE html>
<html lang="zh-TW"><head><meta charset="UTF-8"><title>Missing slug</title>
<style>body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f9fafb;color:#374151}main{text-align:center}h1{font-size:32px;margin:0 0 8px;color:#C41E3A}p{margin:0;color:#6b7280}</style>
</head><body><main><h1>Missing slug</h1><p>請在網址加上 ?slug=xxx</p></main></body></html>`;

function htmlResponse(body: string, status: number, extraHeaders: Record<string, string> = {}): Response {
  return new Response(body, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=UTF-8',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer-when-downgrade',
      ...extraHeaders,
    },
  });
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
    }

    const url = new URL(request.url);
    const slug = url.searchParams.get('slug');
    if (!slug) return htmlResponse(MISSING_SLUG_HTML, 400);

    const cache = caches.default;
    const cacheKey = new Request(url.toString(), { method: 'GET' });
    const cached = await cache.match(cacheKey);
    if (cached) return cached;

    const restUrl = `${env.SUPABASE_URL}/rest/v1/generated_pages?slug=eq.${encodeURIComponent(slug)}&select=html_content,status&limit=1`;
    const dbRes = await fetch(restUrl, {
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        Accept: 'application/json',
      },
    });

    if (!dbRes.ok) {
      return htmlResponse(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Error</title></head><body><h1>讀取失敗 (${dbRes.status})</h1></body></html>`, 502);
    }

    const rows = (await dbRes.json()) as Array<{ html_content: string | null; status: string | null }>;
    const row = rows[0];
    if (!row?.html_content) return htmlResponse(NOT_FOUND_HTML, 404);

    const response = htmlResponse(row.html_content, 200, {
      'Cache-Control': 'public, max-age=60, s-maxage=300',
    });

    ctx.waitUntil(cache.put(cacheKey, response.clone()));
    return response;
  },
} satisfies ExportedHandler<Env>;
