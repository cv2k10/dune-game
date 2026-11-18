import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { BlueprintIcon, HouseEmblem, Icon } from "./components/GameIcons";
import {
  canBuild, canTrain, createGame, getEntity, getEntityAt, getPower, getStorageCapacity,
  isUnit, issueOrder, placeBuilding, queueUnit, repairBuilding, tickGame,
} from "./game/engine";
import { SoundEngine } from "./game/audio";
import { drawMinimap, drawPortrait, drawWorld, type Camera, type DragBox } from "./game/render";
import {
  BUILDING_DEFS, BUILD_MENU, HOUSES, MAP_HEIGHT, MAP_WIDTH, TILE_SIZE, UNIT_DEFS,
  UNIT_MENU_BASE, type BuildingType, type CommandMode, type GameEvent, type GameState,
  type House, type Point,
} from "./game/types";

const SAVE_KEY = "dune-ii-browser-campaign-v1";
const PLAYER_KEY = "dune-ii-player-id";

type SaveData = { game: GameState; camera: Camera };

/** Anonymous per-browser identity used as the save slot key in the D1 database. */
function getPlayerId(): string {
  try {
    let id = localStorage.getItem(PLAYER_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(PLAYER_KEY, id);
    }
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

const saveUrl = () => `/api/saves/${getPlayerId()}`;

async function fetchCloudSave(): Promise<SaveData | null> {
  const response = await fetch(saveUrl(), { cache: "no-store" });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Load failed: ${response.status}`);
  return ((await response.json()) as { save: SaveData }).save;
}

async function putCloudSave(data: SaveData): Promise<void> {
  const response = await fetch(saveUrl(), {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error(`Save failed: ${response.status}`);
}

function readLocalSave(): SaveData | null {
  try {
    const saved = localStorage.getItem(SAVE_KEY);
    return saved ? (JSON.parse(saved) as SaveData) : null;
  } catch {
    return null;
  }
}

const NAME_KEY = "dune-ii-commander-name";


type LeaderboardEntry = { name: string; house: House; time: number; spice: number; date: string };
type SubmitState = { status: "idle" | "sending" | "sent" | "error"; rank?: number | null; message?: string };

async function fetchLeaderboard(): Promise<{ scores: LeaderboardEntry[]; total: number }> {
  const response = await fetch("/api/scores?limit=10", { cache: "no-store" });
  if (!response.ok) throw new Error(`Leaderboard failed: ${response.status}`);
  return response.json();
}

function Leaderboard({ entries, total, error }: { entries: LeaderboardEntry[] | null; total: number; error: boolean }) {
  return (
    <section className="leaderboard" aria-label="Leaderboard">
      <div className="leaderboard-heading"><span>HALL OF COMMANDERS</span><span className="leaderboard-sub">FASTEST VICTORIES</span></div>
      {error ? <p className="leaderboard-empty">Leaderboard unavailable right now.</p>
        : entries === null ? <p className="leaderboard-empty">Receiving transmission…</p>
        : entries.length === 0 ? <p className="leaderboard-empty">No victories recorded yet. Be the first to conquer Arrakis.</p>
        : (
          <ol className="leaderboard-list">
            {entries.map((entry, index) => (
              <li key={`${entry.name}-${entry.date}-${index}`} style={{ "--row-faction": HOUSES[entry.house]?.color } as CSSProperties}>
                <span className="lb-rank">{String(index + 1).padStart(2, "0")}</span>
                <span className="lb-emblem"><HouseEmblem house={entry.house} size={16} /></span>
                <span className="lb-name" title={`${entry.name} / House ${HOUSES[entry.house]?.name ?? entry.house}`}>{entry.name}</span>
                <span className="lb-time">{formatTime(entry.time)}</span>
                <span className="lb-spice">{Math.floor(entry.spice).toLocaleString("en-US")}</span>
              </li>
            ))}
          </ol>
        )}
      {entries !== null && entries.length > 0 && <div className="leaderboard-foot"><span>TIME</span><span>SPICE</span><span>{total} VICTOR{total === 1 ? "Y" : "IES"} LOGGED</span></div>}
    </section>
  );
}

function Modal({ children, onClose, className = "" }: { children: ReactNode; onClose: () => void; className?: string }) {
  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className={`modal-panel ${className}`} role="dialog" aria-modal="true">{children}</section>
    </div>
  );
}

function formatTime(time: number) {
  return `${Math.floor(time / 60).toString().padStart(2, "0")}:${Math.floor(time % 60).toString().padStart(2, "0")}`;
}

export default function App() {
  const [screen, setScreen] = useState<"title" | "game">("title");
  const [house, setHouse] = useState<House>("atreides");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [placement, setPlacement] = useState<BuildingType | null>(null);
  const [command, setCommand] = useState<CommandMode | null>(null);
  const [activeTab, setActiveTab] = useState<"buildings" | "units">("buildings");
  const [paused, setPaused] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const [notice, setNotice] = useState<GameEvent>({ text: "Awaiting orders, Commander.", tone: "info" });
  const [saveFeedback, setSaveFeedback] = useState(false);
  const [hasSave, setHasSave] = useState(() => { try { return Boolean(localStorage.getItem(SAVE_KEY)); } catch { return false; } });
  const [, setRevision] = useState(0);
  const [leaderboard, setLeaderboard] = useState<{ scores: LeaderboardEntry[] | null; total: number; error: boolean }>({ scores: null, total: 0, error: false });
  const [commanderName, setCommanderName] = useState(() => { try { return localStorage.getItem(NAME_KEY) ?? ""; } catch { return ""; } });
  const [submit, setSubmit] = useState<SubmitState>({ status: "idle" });
  const matchIdRef = useRef<string>(crypto.randomUUID());

  useEffect(() => {
    if (screen !== "title") return;
    let cancelled = false;
    fetchLeaderboard()
      .then((data) => { if (!cancelled) setLeaderboard({ scores: data.scores, total: data.total, error: false }); })
      .catch(() => { if (!cancelled) setLeaderboard((current) => ({ ...current, error: true })); });
    return () => { cancelled = true; };
  }, [screen]);

  useEffect(() => {
    let cancelled = false;
    fetch(saveUrl(), { method: "GET", cache: "no-store" })
      .then((response) => { if (!cancelled && response.ok) setHasSave(true); })
      .catch(() => { /* Offline: rely on the local copy. */ });
    return () => { cancelled = true; };
  }, []);

  const gameRef = useRef<GameState | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const minimapRef = useRef<HTMLCanvasElement | null>(null);
  const portraitRef = useRef<HTMLCanvasElement | null>(null);
  const cameraRef = useRef<Camera>({ x: 0, y: 0 });
  const cameraInitializedRef = useRef(false);
  const selectedRef = useRef<number[]>([]);
  const placementRef = useRef<BuildingType | null>(null);
  const commandRef = useRef<CommandMode | null>(null);
  const pausedRef = useRef(false);
  const soundRef = useRef(true);
  const audioRef = useRef<SoundEngine>(new SoundEngine());
  const keysRef = useRef<Set<string>>(new Set());
  const pointerRef = useRef<{ x: number; y: number; inside: boolean }>({ x: 0, y: 0, inside: false });
  const worldPointerRef = useRef<Point | null>(null);
  const downRef = useRef<{ x: number; y: number; world: Point; camera: Camera; touch: boolean; moved: boolean } | null>(null);
  const dragRef = useRef<DragBox | null>(null);

  const theme = { "--faction": HOUSES[house].color, "--faction-light": HOUSES[house].light } as CSSProperties;
  const game = gameRef.current;
  const selectedEntities = game ? selectedIds.map((id) => getEntity(game, id)).filter((entity) => entity !== undefined) : [];
  const primary = selectedEntities[0];
  const friendlyUnits = selectedEntities.filter((entity) => entity.owner === "player" && isUnit(entity));
  const friendlyBuilding = primary && !isUnit(primary) && primary.owner === "player" ? primary : null;
  const power = game ? getPower(game) : { produced: 0, used: 0 };
  const enemyBuildings = game?.buildings.filter((building) => building.owner === "enemy").length ?? 0;

  function playTone(kind: "click" | "success" | "warning" = "click") {
    if (soundRef.current) audioRef.current.ui(kind);
  }

  function select(ids: number[]) {
    selectedRef.current = ids;
    setSelectedIds(ids);
  }

  function choosePlacement(type: BuildingType | null) {
    placementRef.current = type;
    setPlacement(type);
    commandRef.current = null;
    setCommand(null);
  }

  function chooseCommand(mode: CommandMode | null) {
    commandRef.current = mode;
    setCommand(mode);
    placementRef.current = null;
    setPlacement(null);
  }

  function pauseGame(value: boolean) {
    pausedRef.current = value;
    setPaused(value);
    keysRef.current.clear();
  }

  function startGame(nextHouse = house) {
    const nextGame = createGame(nextHouse);
    matchIdRef.current = crypto.randomUUID();
    setSubmit({ status: "idle" });
    gameRef.current = nextGame;
    setHouse(nextHouse);
    cameraInitializedRef.current = false;
    select([nextGame.buildings[0].id]);
    choosePlacement(null);
    setActiveTab("buildings");
    pauseGame(false);
    setShowHelp(false);
    setNotice({ text: "Harvest the spice. Build your forces. Destroy the enemy base.", tone: "info" });
    setScreen("game");
    playTone("success");
  }

  async function continueGame() {
    let data: SaveData | null = null;
    try {
      data = await fetchCloudSave();
    } catch {
      // Cloud unavailable: fall back to the copy kept in this browser.
    }
    data ??= readLocalSave();
    try {
      if (!data?.game?.tiles || !data.game.units || !data.game.buildings) throw new Error("Invalid save");
      gameRef.current = data.game;
      gameRef.current.events = [];
      matchIdRef.current = crypto.randomUUID();
      setSubmit({ status: "idle" });
      setHouse(data.game.house);
      cameraRef.current = data.camera ?? { x: 0, y: 0 };
      cameraInitializedRef.current = true;
      select([]);
      choosePlacement(null);
      pauseGame(false);
      setShowHelp(false);
      setNotice({ text: "Campaign restored. Your forces await orders.", tone: "success" });
      setScreen("game");
      playTone("success");
    } catch {
      setHasSave(false);
      try { localStorage.removeItem(SAVE_KEY); } catch { /* Ignore storage errors. */ }
      fetch(saveUrl(), { method: "DELETE" }).catch(() => { /* Ignore network errors. */ });
    }
  }

  async function saveGame() {
    if (!gameRef.current) return;
    const data: SaveData = { game: gameRef.current, camera: cameraRef.current };
    let savedLocally = false;
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
      savedLocally = true;
    } catch { /* Ignore storage errors; the cloud copy is primary. */ }
    try {
      await putCloudSave(data);
    } catch {
      if (!savedLocally) {
        setNotice({ text: "The campaign could not be saved.", tone: "warning" });
        playTone("warning");
        return;
      }
      setNotice({ text: "Cloud save unavailable. Campaign saved in this browser only.", tone: "warning" });
    }
    setHasSave(true);
    setSaveFeedback(true);
    window.setTimeout(() => setSaveFeedback(false), 2500);
    playTone("success");
  }

  async function submitScore() {
    const current = gameRef.current;
    const name = commanderName.trim().slice(0, 20);
    if (!current || current.status !== "victory" || !name || submit.status === "sending" || submit.status === "sent") return;
    try { localStorage.setItem(NAME_KEY, name); } catch { /* Ignore storage errors. */ }
    setSubmit({ status: "sending" });
    try {
      const response = await fetch("/api/scores", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          matchId: matchIdRef.current, playerId: getPlayerId(), name, house: current.house,
          result: current.status, time: current.time, spice: Math.floor(current.harvested),
        }),
      });
      const data = (await response.json().catch(() => ({}))) as { rank?: number | null; error?: string };
      if (!response.ok) throw new Error(data.error ?? `Submit failed: ${response.status}`);
      setSubmit({ status: "sent", rank: data.rank ?? null });
      playTone("success");
    } catch (error) {
      setSubmit({ status: "error", message: error instanceof Error ? error.message : "Submit failed" });
      playTone("warning");
    }
  }

  function returnToTitle() {
    pauseGame(false);
    setShowHelp(false);
    setScreen("title");
  }

  useEffect(() => {
    if (screen !== "game") return;
    const canvas = canvasRef.current;
    const minimap = minimapRef.current;
    const portrait = portraitRef.current;
    if (!canvas || !minimap || !portrait) return;
    const context = canvas.getContext("2d");
    const miniContext = minimap.getContext("2d");
    const portraitContext = portrait.getContext("2d");
    if (!context || !miniContext || !portraitContext) return;
    let width = 1;
    let height = 1;
    let miniWidth = 1;
    let miniHeight = 1;
    let portraitWidth = 1;
    let portraitHeight = 1;
    let dpr = 1;

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      const fieldRect = canvas.getBoundingClientRect();
      const miniRect = minimap.getBoundingClientRect();
      const portraitRect = portrait.getBoundingClientRect();
      width = Math.max(1, fieldRect.width);
      height = Math.max(1, fieldRect.height);
      miniWidth = Math.max(1, miniRect.width);
      miniHeight = Math.max(1, miniRect.height);
      portraitWidth = Math.max(1, portraitRect.width);
      portraitHeight = Math.max(1, portraitRect.height);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      minimap.width = Math.round(miniWidth * dpr);
      minimap.height = Math.round(miniHeight * dpr);
      portrait.width = Math.round(portraitWidth * dpr);
      portrait.height = Math.round(portraitHeight * dpr);
      if (!cameraInitializedRef.current) {
        const focusX = width < 600 ? 14.6 : width < 900 ? 16.5 : 20.5;
        cameraRef.current = { x: focusX - width / TILE_SIZE / 2, y: 20 - height / TILE_SIZE / 2 };
        cameraInitializedRef.current = true;
      }
      cameraRef.current.x = Math.max(0, Math.min(MAP_WIDTH - width / TILE_SIZE, cameraRef.current.x));
      cameraRef.current.y = Math.max(0, Math.min(MAP_HEIGHT - height / TILE_SIZE, cameraRef.current.y));
    };

    resize();
    window.addEventListener("resize", resize);
    let request = 0;
    let last = performance.now();
    let lastUi = 0;
    const frame = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.055);
      last = now;
      const current = gameRef.current;
      if (current) {
        if (!pausedRef.current && current.status === "playing") {
          const keys = keysRef.current;
          const pointer = pointerRef.current;
          let horizontal = Number(keys.has("d") || keys.has("arrowright")) - Number(keys.has("a") || keys.has("arrowleft"));
          let vertical = Number(keys.has("s") || keys.has("arrowdown")) - Number(keys.has("w") || keys.has("arrowup"));
          if (pointer.inside && !downRef.current && !placementRef.current) {
            if (pointer.x < 20) horizontal -= 1;
            if (pointer.x > width - 20) horizontal += 1;
            if (pointer.y < 20) vertical -= 1;
            if (pointer.y > height - 20) vertical += 1;
          }
          if (horizontal || vertical) {
            const factor = 8 * dt / Math.max(1, Math.hypot(horizontal, vertical));
            cameraRef.current.x = Math.max(0, Math.min(MAP_WIDTH - width / TILE_SIZE, cameraRef.current.x + horizontal * factor));
            cameraRef.current.y = Math.max(0, Math.min(MAP_HEIGHT - height / TILE_SIZE, cameraRef.current.y + vertical * factor));
          }
          tickGame(current, dt);
          // Effects created this tick still have age 0: give them combat sound.
          if (soundRef.current) {
            const fresh = current.effects.filter((effect) => effect.age === 0);
            if (fresh.length) {
              const halfWidth = width / TILE_SIZE / 2;
              const halfHeight = height / TILE_SIZE / 2;
              audioRef.current.combat(fresh, { x: cameraRef.current.x + halfWidth, y: cameraRef.current.y + halfHeight, halfWidth, halfHeight });
            }
          }
        }
        context.setTransform(dpr, 0, 0, dpr, 0, 0);
        drawWorld(context, current, cameraRef.current, width, height, selectedRef.current, placementRef.current, worldPointerRef.current, dragRef.current);
        miniContext.setTransform(dpr, 0, 0, dpr, 0, 0);
        drawMinimap(miniContext, current, cameraRef.current, width, height, miniWidth, miniHeight);
        portraitContext.setTransform(dpr, 0, 0, dpr, 0, 0);
        drawPortrait(portraitContext, current, selectedRef.current.length ? getEntity(current, selectedRef.current[0]) : undefined, portraitWidth, portraitHeight);
        if (current.events.length) {
          const latest = current.events[current.events.length - 1];
          current.events.length = 0;
          setNotice(latest);
          if (latest.tone !== "info") playTone(latest.tone);
        }
        if (now - lastUi > 180) {
          setRevision((revision) => revision + 1);
          lastUi = now;
        }
      }
      request = requestAnimationFrame(frame);
    };
    request = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(request);
      window.removeEventListener("resize", resize);
    };
  }, [screen]);

  useEffect(() => {
    if (screen !== "game") return;
    const down = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(key)) event.preventDefault();
      if (key === "escape") {
        if (showHelp) setShowHelp(false);
        else if (pausedRef.current) pauseGame(false);
        else if (placementRef.current) choosePlacement(null);
        else if (commandRef.current) chooseCommand(null);
        else pauseGame(true);
        return;
      }
      if (showHelp) return;
      if (key === " " || key === "p") {
        if (!event.repeat && gameRef.current?.status === "playing") pauseGame(!pausedRef.current);
        return;
      }
      if (pausedRef.current) return;
      if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(key)) keysRef.current.add(key);
      if (event.repeat) return;
      if (key === "m") chooseCommand("move");
      if (key === "f") chooseCommand("attack");
      if (key === "h") chooseCommand("harvest");
      if (key === "g" && gameRef.current) {
        issueOrder(gameRef.current, selectedRef.current, "guard");
        chooseCommand(null);
      }
    };
    const up = (event: KeyboardEvent) => keysRef.current.delete(event.key.toLowerCase());
    const hidden = () => { if (document.hidden && gameRef.current?.status === "playing") pauseGame(true); };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      document.removeEventListener("visibilitychange", hidden);
      keysRef.current.clear();
    };
  }, [screen, showHelp]);

  function worldFromPointer(clientX: number, clientY: number, element: HTMLCanvasElement): Point {
    const rect = element.getBoundingClientRect();
    return { x: cameraRef.current.x + (clientX - rect.left) / TILE_SIZE, y: cameraRef.current.y + (clientY - rect.top) / TILE_SIZE };
  }

  function handleLeftClick(point: Point, shiftKey: boolean) {
    const current = gameRef.current;
    if (!current || current.status !== "playing" || pausedRef.current) return;
    if (placementRef.current) {
      const placed = placeBuilding(current, placementRef.current, Math.floor(point.x), Math.floor(point.y));
      if (placed) { choosePlacement(null); playTone("success"); }
      else playTone("warning");
      setRevision((revision) => revision + 1);
      return;
    }
    if (commandRef.current) {
      const target = getEntityAt(current, point.x, point.y);
      const targetId = commandRef.current === "attack" && target?.owner === "enemy" ? target.id : null;
      if (issueOrder(current, selectedRef.current, commandRef.current, point.x, point.y, targetId)) {
        setNotice({ text: "Orders received.", tone: "info" });
        playTone();
      }
      chooseCommand(null);
      return;
    }
    const entity = getEntityAt(current, point.x, point.y);
    if (entity) {
      if (shiftKey && entity.owner === "player" && isUnit(entity)) select([...new Set([...selectedRef.current, entity.id])]);
      else select([entity.id]);
      playTone();
    } else select([]);
  }

  function handleRightClick(point: Point) {
    const current = gameRef.current;
    if (!current || current.status !== "playing" || pausedRef.current) return;
    if (placementRef.current) { choosePlacement(null); return; }
    chooseCommand(null);
    const ids = selectedRef.current.filter((id) => current.units.some((unit) => unit.id === id && unit.owner === "player"));
    if (!ids.length) return;
    const target = getEntityAt(current, point.x, point.y);
    if (target?.owner === "enemy") issueOrder(current, ids, "attack", point.x, point.y, target.id);
    else if (current.tiles[Math.floor(point.y)]?.[Math.floor(point.x)]?.kind === "spice") {
      const harvesters = ids.filter((id) => current.units.find((unit) => unit.id === id)?.type === "harvester");
      const others = ids.filter((id) => !harvesters.includes(id));
      if (harvesters.length) issueOrder(current, harvesters, "harvest", point.x, point.y);
      if (others.length) issueOrder(current, others, "move", point.x, point.y);
    } else issueOrder(current, ids, "move", point.x, point.y);
    setNotice({ text: target?.owner === "enemy" ? "Attack order confirmed." : "Moving to position.", tone: "info" });
    playTone();
  }

  function onFieldPointerDown(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (event.button !== 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    downRef.current = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
      world: worldFromPointer(event.clientX, event.clientY, event.currentTarget),
      camera: { ...cameraRef.current },
      touch: event.pointerType === "touch",
      moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onFieldPointerMove(event: ReactPointerEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    pointerRef.current = { x: event.clientX - rect.left, y: event.clientY - rect.top, inside: event.pointerType !== "touch" };
    const point = worldFromPointer(event.clientX, event.clientY, event.currentTarget);
    worldPointerRef.current = point;
    const down = downRef.current;
    if (down?.touch) {
      const dx = event.clientX - rect.left - down.x;
      const dy = event.clientY - rect.top - down.y;
      if (Math.hypot(dx, dy) > 7) down.moved = true;
      if (down.moved) {
        cameraRef.current.x = Math.max(0, Math.min(MAP_WIDTH - rect.width / TILE_SIZE, down.camera.x - dx / TILE_SIZE));
        cameraRef.current.y = Math.max(0, Math.min(MAP_HEIGHT - rect.height / TILE_SIZE, down.camera.y - dy / TILE_SIZE));
      }
      return;
    }
    if (down && !placementRef.current && !commandRef.current && Math.hypot(event.clientX - rect.left - down.x, event.clientY - rect.top - down.y) > 7) {
      dragRef.current = { x1: down.world.x, y1: down.world.y, x2: point.x, y2: point.y };
    }
  }

  function onFieldPointerUp(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (event.button !== 0 || !downRef.current) return;
    if (downRef.current.touch && downRef.current.moved) {
      downRef.current = null;
      worldPointerRef.current = null;
      return;
    }
    const point = worldFromPointer(event.clientX, event.clientY, event.currentTarget);
    const drag = dragRef.current;
    if (drag && gameRef.current && !pausedRef.current) {
      const minX = Math.min(drag.x1, drag.x2);
      const maxX = Math.max(drag.x1, drag.x2);
      const minY = Math.min(drag.y1, drag.y2);
      const maxY = Math.max(drag.y1, drag.y2);
      const ids = gameRef.current.units.filter((unit) => unit.owner === "player" && unit.x >= minX && unit.x <= maxX && unit.y >= minY && unit.y <= maxY).map((unit) => unit.id);
      select(ids);
      if (ids.length) playTone();
    } else handleLeftClick(point, event.shiftKey);
    downRef.current = null;
    dragRef.current = null;
  }

  function onMinimapPointer(event: ReactPointerEvent<HTMLCanvasElement>) {
    const field = canvasRef.current;
    if (!field) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * MAP_WIDTH;
    const y = ((event.clientY - rect.top) / rect.height) * MAP_HEIGHT;
    cameraRef.current.x = Math.max(0, Math.min(MAP_WIDTH - field.clientWidth / TILE_SIZE, x - field.clientWidth / TILE_SIZE / 2));
    cameraRef.current.y = Math.max(0, Math.min(MAP_HEIGHT - field.clientHeight / TILE_SIZE, y - field.clientHeight / TILE_SIZE / 2));
  }

  return (
    <>
      {screen === "title" ? (
        <main className="title-screen" style={theme}>
          <div className="title-art" aria-hidden="true" />
          <div className="title-overlay" aria-hidden="true" />
          <div className="title-grain" aria-hidden="true" />
          <header className="title-header">
            <div className="archive-mark"><span className="archive-diamond" /><span>WESTWOOD ARCHIVES</span><span className="archive-divider">/</span><span className="archive-year">1992 REIMAGINED</span></div>
            <button className="title-header-link" onClick={() => setShowHelp(true)}>FIELD MANUAL <Icon name="arrow" size={15} /></button>
          </header>
          <div className="title-main">
            <div className="title-kicker"><span className="kicker-line" /> THE BATTLE FOR ARRAKIS BEGINS</div>
            <h1 className="dune-logo">DUNE<span>II</span></h1>
            <div className="title-subtitle"><span className="subtitle-rule" /> THE BUILDING OF A DYNASTY <span className="subtitle-rule" /></div>
            <p className="title-description">Three Houses. One planet. Harvest the spice, build your forces, and command the desert in real time.</p>
            <div className="title-ctas">
              <button className="primary-cta" onClick={() => startGame()}><span>BEGIN CAMPAIGN</span><Icon name="arrow" size={19} /></button>
              {hasSave && <button className="continue-cta" onClick={continueGame}><Icon name="play" size={15} /> CONTINUE GAME</button>}
            </div>
          </div>
          <Leaderboard entries={leaderboard.scores} total={leaderboard.total} error={leaderboard.error} />
          <div className="house-select">
            <div className="house-heading"><span>CHOOSE YOUR HOUSE</span><span className="house-heading-number">01 / 03</span></div>
            <div className="house-options">
              {(["atreides", "harkonnen", "ordos"] as House[]).map((option, index) => (
                <button key={option} className={`house-option ${house === option ? "active" : ""}`} onClick={() => { setHouse(option); playTone(); }} aria-pressed={house === option}>
                  <span className="house-option-index">0{index + 1}</span>
                  <HouseEmblem house={option} size={29} />
                  <span className="house-option-name">{HOUSES[option].name}</span>
                  <span className="house-option-arrow"><Icon name="arrow" size={16} /></span>
                </button>
              ))}
            </div>
            <div className="house-motto"><span className="motto-dot" /> HOUSE {HOUSES[house].name.toUpperCase()} <span className="motto-separator">/</span> {HOUSES[house].motto}</div>
          </div>
          <footer className="title-footer"><span>AN INTERACTIVE TRIBUTE TO THE 1992 REAL-TIME STRATEGY CLASSIC</span><span>DESIGNED FOR DESKTOP <span className="footer-star">*</span> PLAYABLE IN YOUR BROWSER</span></footer>
        </main>
      ) : game && (
        <main className="game-screen" style={theme}>
          <header className="game-header">
            <button className="game-brand" onClick={() => pauseGame(true)} aria-label="Open game menu"><span className="game-brand-title">DUNE<span>II</span></span><span className="game-brand-sub">THE BUILDING OF A DYNASTY</span></button>
            <div className="mission-heading"><span className="mission-signal" /><span>CAMPAIGN / MISSION 01</span><span className="mission-heading-divider">/</span><strong>THE BATTLE FOR ARRAKIS</strong></div>
            <div className="header-actions"><span className="game-clock">{formatTime(game.time)}</span><button className="header-icon-button" title={soundOn ? "Mute audio" : "Enable audio"} aria-label={soundOn ? "Mute audio" : "Enable audio"} onClick={() => { soundRef.current = !soundRef.current; setSoundOn(soundRef.current); if (soundRef.current) playTone(); }}><Icon name={soundOn ? "sound" : "mute"} size={18} /></button><button className="header-icon-button" title="Field manual" aria-label="Field manual" onClick={() => setShowHelp(true)}><Icon name="info" size={18} /></button><button className="header-menu-button" onClick={() => pauseGame(true)}><Icon name="menu" size={17} /><span>MENU</span></button></div>
          </header>

          <div className="game-main">
            <section className="battlefield" aria-label="Arrakis tactical battlefield">
              <div className="field-topline"><span><i className="field-live-dot" /> LIVE TACTICAL FEED</span><span>ARRAKIS / SECTOR 06</span></div>
              <canvas ref={canvasRef} className={`world-canvas ${placement ? "placing" : ""} ${command ? "commanding" : ""}`} onPointerDown={onFieldPointerDown} onPointerMove={onFieldPointerMove} onPointerUp={onFieldPointerUp} onPointerLeave={() => { pointerRef.current.inside = false; worldPointerRef.current = null; }} onContextMenu={(event) => { event.preventDefault(); handleRightClick(worldFromPointer(event.clientX, event.clientY, event.currentTarget)); }} />
              <div className="field-corner field-corner-tl" /><div className="field-corner field-corner-tr" /><div className="field-corner field-corner-bl" /><div className="field-corner field-corner-br" />
              {placement && <div className="field-instruction"><span className="instruction-pulse" /> PLACE {BUILDING_DEFS[placement].name.toUpperCase()} ON ROCK <span className="instruction-small">RIGHT CLICK TO CANCEL</span></div>}
              {command && <div className="field-instruction"><span className="instruction-pulse" /> SELECT {command === "attack" ? "A TARGET" : command === "harvest" ? "A SPICE FIELD" : "A DESTINATION"} <span className="instruction-small">ESC TO CANCEL</span></div>}
              <div className="field-bottom-label"><span>CAM 01 / SURFACE VIEW</span><span>WASD TO PAN <b>+</b> RIGHT CLICK TO COMMAND</span><span className="mobile-pan-label">DRAG TO PAN</span></div>
            </section>

            <aside className="command-panel">
              <div className="panel-top"><div className="panel-house-emblem"><HouseEmblem house={house} size={31} /></div><div><span className="panel-eyebrow">COMMAND CENTER</span><strong>HOUSE {HOUSES[house].name.toUpperCase()}</strong></div><span className="panel-rank">01</span></div>
              <div className="radar-block"><div className="section-heading"><span>TACTICAL MAP</span><span className="section-heading-alt">LIVE / 01</span></div><div className="minimap-frame"><canvas ref={minimapRef} className="minimap-canvas" onPointerDown={onMinimapPointer} onPointerMove={(event) => { if (event.buttons === 1) onMinimapPointer(event); }} aria-label="Click to navigate the map" /><div className="minimap-scanline" /></div></div>
              <div className="resources-block"><div className="credit-readout"><div><span className="resource-label">SPICE CREDITS</span><strong>{Math.floor(game.credits).toLocaleString("en-US")}</strong></div><span className="credit-symbol">CR</span></div><div className="resource-track"><span style={{ width: `${Math.min(100, game.credits / getStorageCapacity(game) * 100)}%` }} /></div><div className="power-row"><span>POWER GRID</span><span className={power.produced < power.used ? "power-low" : "power-good"}>{power.used} / {power.produced}</span></div><div className="power-track"><span className={power.produced < power.used ? "low" : ""} style={{ width: `${Math.min(100, power.produced ? power.used / power.produced * 100 : 0)}%` }} /></div></div>
              <div className="selection-block"><div className="section-heading"><span>{selectedEntities.length > 1 ? `${selectedEntities.length} UNITS SELECTED` : "SELECTION"}</span><span className="section-heading-alt">{primary?.owner === "enemy" ? "HOSTILE" : primary ? "FRIENDLY" : "STANDBY"}</span></div><div className="selection-content"><canvas ref={portraitRef} className="portrait-canvas" /><div className="selection-info"><strong>{primary ? (isUnit(primary) ? UNIT_DEFS[primary.type].name : BUILDING_DEFS[primary.type].name) : "Awaiting orders"}</strong><span>{primary ? (isUnit(primary) ? primary.type === "harvester" ? `${Math.floor(primary.cargo)} / 110 SPICE` : `${primary.order.toUpperCase()} MODE` : primary.progress < 1 ? `BUILDING ${Math.floor(primary.progress * 100)}%` : "STRUCTURE ONLINE") : "SELECT A UNIT OR BUILDING"}</span><div className="health-track"><span style={{ width: `${primary ? Math.max(0, primary.hp / primary.maxHp * 100) : 0}%` }} /></div><small>{primary ? `${Math.ceil(Math.max(0, primary.hp))} / ${primary.maxHp} INTEGRITY` : "NO ACTIVE SELECTION"}</small></div></div><div className="orders-row">{friendlyUnits.length ? <><button className={command === "move" ? "active" : ""} onClick={() => chooseCommand("move")} title="Move (M)"><Icon name="move" size={17} /><span>MOVE</span></button><button className={command === "attack" ? "active" : ""} onClick={() => chooseCommand("attack")} title="Attack (F)"><Icon name="target" size={17} /><span>ATTACK</span></button><button onClick={() => { issueOrder(game, selectedRef.current, "guard"); chooseCommand(null); playTone(); }} title="Guard (G)"><Icon name="guard" size={17} /><span>GUARD</span></button>{friendlyUnits.some((unit) => unit.type === "harvester") && <button className={command === "harvest" ? "active" : ""} onClick={() => chooseCommand("harvest")} title="Harvest (H)"><Icon name="harvest" size={17} /><span>HARVEST</span></button>}</> : friendlyBuilding ? <button className="repair-button" disabled={friendlyBuilding.hp >= friendlyBuilding.maxHp || friendlyBuilding.progress < 1} onClick={() => { repairBuilding(game, friendlyBuilding.id); playTone("success"); }}><Icon name="repair" size={16} /> REPAIR STRUCTURE <span>{Math.ceil(Math.min(friendlyBuilding.maxHp - friendlyBuilding.hp, friendlyBuilding.maxHp * .35) * .42)} CR</span></button> : <span className="orders-empty">{primary?.owner === "enemy" ? "Enemy target identified" : "Click a unit to issue commands"}</span>}</div></div>
              <div className="production-block"><div className="production-tabs"><button className={activeTab === "buildings" ? "active" : ""} onClick={() => { setActiveTab("buildings"); playTone(); }}>STRUCTURES</button><button className={activeTab === "units" ? "active" : ""} onClick={() => { setActiveTab("units"); playTone(); }}>UNITS</button></div><div className="production-list">{activeTab === "buildings" ? BUILD_MENU.map((type) => { const def = BUILDING_DEFS[type]; const issue = canBuild(game, type); return <button key={type} className={`production-item ${issue ? "unavailable" : ""} ${placement === type ? "selected" : ""}`} disabled={Boolean(issue)} title={issue ?? def.description} onClick={() => { choosePlacement(type); playTone(); }}><span className="production-icon"><BlueprintIcon type={type} isBuilding /></span><span className="production-copy"><strong>{def.name}</strong><small>{issue ?? def.description}</small></span><span className="production-cost">{def.cost}<small>CR</small></span></button>; }) : [...UNIT_MENU_BASE, HOUSES[house].specialty].map((type) => { const def = UNIT_DEFS[type]; const issue = canTrain(game, type); return <button key={type} className={`production-item ${issue ? "unavailable" : ""}`} disabled={Boolean(issue)} title={issue ?? def.description} onClick={() => { if (queueUnit(game, type)) playTone("success"); setRevision((revision) => revision + 1); }}><span className="production-icon"><BlueprintIcon type={type} isBuilding={false} /></span><span className="production-copy"><strong>{def.name}</strong><small>{issue ?? def.description}</small></span><span className="production-cost">{def.cost}<small>CR</small></span></button>; })}</div>{game.production.length > 0 && <div className="queue-status"><div><span>PRODUCING: {UNIT_DEFS[game.production[0].type].name.toUpperCase()}</span><span>{Math.floor(game.production[0].progress * 100)}% {game.production.length > 1 ? `+${game.production.length - 1} QUEUED` : ""}</span></div><div className="queue-track"><span style={{ width: `${Math.min(100, game.production[0].progress * 100)}%` }} /></div></div>}</div>
              <div className="panel-objective"><span className="objective-square" /><div><small>MISSION OBJECTIVE</small><strong>DESTROY ENEMY BASE</strong></div><span className="objective-count">{enemyBuildings} LEFT</span></div>
            </aside>
          </div>
          <footer className="game-footer"><div className="transmission-prefix"><span className={`transmission-light ${notice.tone}`} /> MENTAT TRANSMISSION</div><p>{notice.text}</p><span className="footer-coordinates">SECTOR 06 <span>/</span> {Math.floor(cameraRef.current.x).toString().padStart(2, "0")}:{Math.floor(cameraRef.current.y).toString().padStart(2, "0")}</span></footer>

          {paused && game.status === "playing" && !showHelp && <Modal onClose={() => pauseGame(false)} className="pause-modal"><div className="modal-topline">CAMPAIGN PAUSED <span>ARRAKIS / 01</span></div><div className="pause-emblem"><HouseEmblem house={house} size={43} /></div><h2>COMMAND ON HOLD</h2><p>The desert waits for no one, Commander.</p><div className="pause-actions"><button className="primary-cta" onClick={() => pauseGame(false)}>RESUME CAMPAIGN <Icon name="arrow" size={18} /></button><button onClick={saveGame}>{saveFeedback ? "CAMPAIGN SAVED" : "SAVE CAMPAIGN"}</button><button onClick={() => setShowHelp(true)}>FIELD MANUAL</button><button onClick={() => startGame(house)}>RESTART MISSION</button><button onClick={returnToTitle}>RETURN TO TITLE</button></div><div className="pause-hint">PRESS SPACE OR ESC TO RESUME</div></Modal>}
          {game.status !== "playing" && <Modal onClose={returnToTitle} className="result-modal"><div className="modal-topline">MISSION 01 / {game.status === "victory" ? "COMPLETE" : "FAILED"}<span>ARRAKIS</span></div><div className="result-glyph"><HouseEmblem house={house} size={62} /></div><h2>{game.status === "victory" ? "ARRAKIS IS YOURS" : "THE DESERT CLAIMS ALL"}</h2><p>{game.status === "victory" ? `House ${HOUSES[house].name} has seized the spice. Your dynasty begins here.` : "Your forces have fallen. Regroup and reclaim the spice."}</p><div className="result-stats"><span>TIME <strong>{formatTime(game.time)}</strong></span><span>SPICE HARVESTED <strong>{Math.floor(game.harvested).toLocaleString()}</strong></span></div>{game.status === "victory" && (submit.status === "sent"
            ? <div className="score-submitted">SCORE LOGGED{submit.rank ? <> / RANK <strong>#{submit.rank}</strong></> : null}</div>
            : <form className="score-form" onSubmit={(event) => { event.preventDefault(); void submitScore(); }}><label htmlFor="commander-name">ENTER THE HALL OF COMMANDERS</label><div className="score-form-row"><input id="commander-name" value={commanderName} maxLength={20} placeholder="Commander name" autoComplete="nickname" onChange={(event) => setCommanderName(event.target.value)} onKeyDown={(event) => event.stopPropagation()} /><button type="submit" disabled={!commanderName.trim() || submit.status === "sending"}>{submit.status === "sending" ? "SENDING…" : "SUBMIT SCORE"}</button></div>{submit.status === "error" && <small className="score-error">{submit.message}</small>}</form>)}<button className="primary-cta" onClick={() => startGame(house)}>PLAY AGAIN <Icon name="arrow" size={18} /></button><button className="result-title-link" onClick={returnToTitle}>RETURN TO TITLE</button></Modal>}
        </main>
      )}

      {showHelp && <Modal onClose={() => setShowHelp(false)} className="help-modal"><div className="modal-topline">FIELD MANUAL <span>WESTWOOD ARCHIVES / 1992</span></div><button className="modal-close" onClick={() => setShowHelp(false)} aria-label="Close field manual"><Icon name="close" size={18} /></button><span className="manual-kicker">COMMANDER'S GUIDE / 01</span><h2>CONTROL THE SPICE.<br /><em>CONTROL ARRAKIS.</em></h2><p className="manual-intro">Build a base on rock, send harvesters into the spice fields, and turn your credits into an army. Destroy every enemy structure to win.</p><div className="manual-steps"><div><b>01</b><strong>HARVEST</strong><span>Harvesters collect orange spice automatically and deliver it to your refinery. Protect them from raiders and sandworms.</span></div><div><b>02</b><strong>CONSTRUCT</strong><span>Choose a structure in the command panel, then click an open rocky area near your base. Lay concrete first to prevent decay.</span></div><div><b>03</b><strong>COMMAND</strong><span>Click or drag to select units. Right-click to move or attack. On touchscreens, drag the battlefield to pan.</span></div></div><div className="manual-controls"><span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> PAN MAP</span><span><kbd>SPACE</kbd> PAUSE</span><span><kbd>ESC</kbd> CANCEL / MENU</span><span><kbd>F</kbd> ATTACK</span></div><button className="manual-close-cta" onClick={() => setShowHelp(false)}>{screen === "title" ? "BACK TO TITLE" : "BACK TO CAMPAIGN"} <Icon name="arrow" size={16} /></button></Modal>}
    </>
  );
}
