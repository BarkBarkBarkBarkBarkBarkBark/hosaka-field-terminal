// Vercel Edge Function — SPA reads /api/health for feature flags (settings gear,
// web browsing tab). Hosted builds must not expose those to casual visitors.

export const config = {
  runtime: "edge",
};

export default async function handler(): Promise<Response> {
  return new Response(
    JSON.stringify({
      web: "ok",
      settings_enabled: false,
      web_panel_enabled: false,
    }),
    { headers: { "content-type": "application/json" } },
  );
}
