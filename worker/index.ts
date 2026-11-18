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

const HOUSES = ["atreides", "harkonnen", "ordos"];
// Ranking: fastest victory first, more spice harvested breaks ties.
const RANK_ORDER = "time_sec ASC, spice DESC, created_at ASC";

async function listScores(url: URL, env: Env): Promise<Response> {
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit")) || 10));
  const { results } = await env.DB.prepare(
    `SELECT name, house, time_sec AS time, spice, created_at AS date FROM scores
     WHERE result = 'victory' ORDER BY ${RANK_ORDER} LIMIT ?`,
  ).bind(limit).all();
  const total = await env.DB.prepare("SELECT COUNT(*) AS n FROM scores WHERE result = 'victory'").first<{ n: number }>();
  return json({ scores: results, total: total?.n ?? 0 });
}

async function submitScore(request: Request, env: Env): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  const { matchId, playerId, house, result } = body;
  const name = typeof body.name === "string" ? body.name.replace(/[\u0000-\u001f]/g, "").trim().slice(0, 20) : "";
  const time = Number(body.time);
  const spice = Math.floor(Number(body.spice));
  if (
    typeof matchId !== "string" || !PLAYER_ID.test(matchId) ||
    typeof playerId !== "string" || !PLAYER_ID.test(playerId) ||
    typeof house !== "string" || !HOUSES.includes(house) ||
    (result !== "victory" && result !== "defeat") ||
    !name || !Number.isFinite(time) || time <= 0 || time > 86_400 ||
    !Number.isFinite(spice) || spice < 0 || spice > 10_000_000
  ) {
    return json({ error: "Invalid score" }, 400);
  }
  const inserted = await env.DB.prepare(
    `INSERT INTO scores (match_id, player_id, name, house, result, time_sec, spice)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7) ON CONFLICT(match_id) DO NOTHING`,
  ).bind(matchId, playerId, name, house, result, time, spice).run();
  if (!inserted.meta.changes) return json({ error: "Score already submitted" }, 409);
  let rank: number | null = null;
  if (result === "victory") {
    const row = await env.DB.prepare(
      `SELECT COUNT(*) + 1 AS rank FROM scores WHERE result = 'victory'
       AND (time_sec < ?1 OR (time_sec = ?1 AND spice > ?2))`,
    ).bind(time, spice).first<{ rank: number }>();
    rank = row?.rank ?? null;
  }
  return json({ ok: true, rank }, 201);
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/health") {
      const row = await env.DB.prepare("SELECT COUNT(*) AS saves FROM saves").first<{ saves: number }>();
      return json({ ok: true, saves: row?.saves ?? 0 });
    }

    if (url.pathname === "/api/scores") {
      try {
        if (request.method === "GET") return await listScores(url, env);
        if (request.method === "POST") return await submitScore(request, env);
        return json({ error: "Method not allowed" }, 405);
      } catch (error) {
        console.error("scores handler failed", error);
        return json({ error: "Internal error" }, 500);
      }
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
