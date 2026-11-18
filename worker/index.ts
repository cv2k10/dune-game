interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
}

const PLAYER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_SAVE_BYTES = 1_500_000; // D1 rows cap out at 2 MB.

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

async function handleSave(request: Request, env: Env, playerId: string): Promise<Response> {
  if (!PLAYER_ID.test(playerId)) return json({ error: "Invalid player id" }, 400);

  switch (request.method) {
    case "GET": {
      const row = await env.DB.prepare("SELECT data, updated_at FROM saves WHERE player_id = ?")
        .bind(playerId)
        .first<{ data: string; updated_at: string }>();
      if (!row) return json({ error: "No save found" }, 404);
      return new Response(`{"updatedAt":${JSON.stringify(row.updated_at)},"save":${row.data}}`, {
        headers: { "content-type": "application/json", "cache-control": "no-store" },
      });
    }
    case "PUT": {
      const text = await request.text();
      if (text.length > MAX_SAVE_BYTES) return json({ error: "Save too large" }, 413);
      let save: { game?: { house?: unknown; tiles?: unknown; units?: unknown; buildings?: unknown } };
      try {
        save = JSON.parse(text);
      } catch {
        return json({ error: "Invalid JSON" }, 400);
      }
      const game = save?.game;
      if (!game || typeof game.house !== "string" || !Array.isArray(game.tiles) || !Array.isArray(game.units) || !Array.isArray(game.buildings)) {
        return json({ error: "Invalid save payload" }, 400);
      }
      await env.DB.prepare(
        `INSERT INTO saves (player_id, house, data) VALUES (?1, ?2, ?3)
         ON CONFLICT(player_id) DO UPDATE SET house = excluded.house, data = excluded.data, updated_at = datetime('now')`,
      )
        .bind(playerId, game.house, text)
        .run();
      return json({ ok: true });
    }
    case "DELETE": {
      await env.DB.prepare("DELETE FROM saves WHERE player_id = ?").bind(playerId).run();
      return json({ ok: true });
    }
    default:
      return json({ error: "Method not allowed" }, 405);
  }
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/health") {
      const row = await env.DB.prepare("SELECT COUNT(*) AS saves FROM saves").first<{ saves: number }>();
      return json({ ok: true, saves: row?.saves ?? 0 });
    }

    const match = url.pathname.match(/^\/api\/saves\/([^/]+)$/);
    if (match) {
      try {
        return await handleSave(request, env, match[1]);
      } catch (error) {
        console.error("save handler failed", error);
        return json({ error: "Internal error" }, 500);
      }
    }

    if (url.pathname.startsWith("/api/")) return json({ error: "Not found" }, 404);
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
