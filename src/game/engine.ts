import {
  BUILDING_DEFS,
  HOUSES,
  MAP_HEIGHT,
  MAP_WIDTH,
  UNIT_DEFS,
  type Building,
  type BuildingType,
  type GameState,
  type House,
  type Point,
  type Tile,
  type Unit,
  type UnitType,
} from "./types";

export type Entity = Unit | Building;

function noise(x: number, y: number, seed = 0): number {
  let value = Math.imul(x + seed * 19, 374761393) + Math.imul(y + seed * 7, 668265263);
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
}

function inBounds(x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < MAP_WIDTH && y < MAP_HEIGHT;
}

function makeMap(): Tile[][] {
  const tiles: Tile[][] = Array.from({ length: MAP_HEIGHT }, (_, y) =>
    Array.from({ length: MAP_WIDTH }, (_, x) => ({
      kind: "sand" as const,
      spice: 0,
      detail: Math.floor(noise(x, y, 2) * 1000),
      explored: false,
      visible: false,
    })),
  );

  const paintEllipse = (
    cx: number,
    cy: number,
    rx: number,
    ry: number,
    kind: "rock" | "mountain" | "spice",
  ) => {
    for (let y = Math.max(0, Math.floor(cy - ry - 1)); y < Math.min(MAP_HEIGHT, cy + ry + 2); y++) {
      for (let x = Math.max(0, Math.floor(cx - rx - 1)); x < Math.min(MAP_WIDTH, cx + rx + 2); x++) {
        const distortion = (noise(x, y, 8) - 0.5) * 0.25;
        const distance = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
        if (distance > 1 + distortion) continue;
        const tile = tiles[y][x];
        if (kind === "spice") {
          if (tile.kind !== "sand") continue;
          tile.kind = "spice";
          tile.spice = 80 + Math.floor(noise(x, y, 9) * 105);
        } else {
          tile.kind = kind;
          tile.spice = 0;
        }
      }
    }
  };

  paintEllipse(13, 19, 9.2, 11.5, "rock");
  paintEllipse(17, 24, 4.5, 5.5, "rock");
  paintEllipse(50, 20, 9.5, 11, "rock");
  paintEllipse(46, 16, 4, 5, "rock");
  paintEllipse(33, 5, 4.3, 2.7, "mountain");
  paintEllipse(33, 39, 5, 3.1, "mountain");
  paintEllipse(3, 42, 4.2, 3.2, "mountain");
  paintEllipse(60, 41, 3.8, 3, "mountain");
  paintEllipse(25, 19, 4.5, 4.1, "spice");
  paintEllipse(31, 27, 5, 3.6, "spice");
  paintEllipse(29, 10, 3.3, 2.8, "spice");
  paintEllipse(39, 20, 4.1, 3.5, "spice");
  paintEllipse(38, 33, 3.5, 3, "spice");
  paintEllipse(19, 35, 3.8, 2.6, "spice");
  paintEllipse(57, 7, 3.5, 3, "spice");

  // Keep the starting footprints clear even where the rocky edge is irregular.
  for (let y = 12; y <= 27; y++) {
    for (let x = 8; x <= 19; x++) tiles[y][x].kind = "rock";
  }
  for (let y = 13; y <= 27; y++) {
    for (let x = 44; x <= 55; x++) tiles[y][x].kind = "rock";
  }
  return tiles;
}

function announce(game: GameState, text: string, tone: "info" | "success" | "warning" = "info") {
  game.events.push({ text, tone });
}

function addBuilding(
  game: GameState,
  type: Exclude<BuildingType, "slab">,
  owner: "player" | "enemy",
  x: number,
  y: number,
  finished = true,
  foundation = true,
): Building {
  const def = BUILDING_DEFS[type];
  const building: Building = {
    id: game.nextId++,
    owner,
    type,
    x,
    y,
    hp: def.hp,
    maxHp: def.hp,
    progress: finished ? 1 : 0,
    cooldown: 0,
  };
  game.buildings.push(building);
  if (foundation) {
    for (let ty = y; ty < y + def.height; ty++) {
      for (let tx = x; tx < x + def.width; tx++) {
        if (inBounds(tx, ty)) game.tiles[ty][tx].kind = "slab";
      }
    }
  }
  return building;
}

function addUnit(
  game: GameState,
  type: UnitType,
  owner: "player" | "enemy",
  x: number,
  y: number,
): Unit {
  const def = UNIT_DEFS[type];
  const unit: Unit = {
    id: game.nextId++,
    owner,
    type,
    x,
    y,
    hp: def.hp,
    maxHp: def.hp,
    order: type === "harvester" ? "harvest" : "guard",
    targetX: x,
    targetY: y,
    targetId: null,
    cargo: 0,
    cooldown: 0,
    facing: -Math.PI / 2,
    path: [],
    pathGoal: "",
    repathAt: 0,
  };
  game.units.push(unit);
  return unit;
}

export function createGame(house: House): GameState {
  const enemyHouse: House = house === "atreides" ? "harkonnen" : "atreides";
  const game: GameState = {
    house,
    enemyHouse,
    tiles: makeMap(),
    units: [],
    buildings: [],
    effects: [],
    events: [],
    production: [],
    credits: 2450,
    harvested: 0,
    time: 0,
    nextId: 1,
    nextWave: 28,
    wave: 0,
    nextWorm: 65,
    worm: { x: 31, y: 29, life: 0, active: false },
    fogTimer: 0,
    status: "playing",
  };

  // The opening survey reveals terrain, while enemy contacts remain hidden until scouted.
  for (let y = 0; y < MAP_HEIGHT; y++) {
    for (let x = 0; x < 42; x++) game.tiles[y][x].explored = true;
  }

  addBuilding(game, "yard", "player", 9, 18);
  addBuilding(game, "windtrap", "player", 9, 13);
  addBuilding(game, "refinery", "player", 13, 18);
  addBuilding(game, "barracks", "player", 13, 14);

  addBuilding(game, "yard", "enemy", 49, 18);
  addBuilding(game, "windtrap", "enemy", 49, 13);
  addBuilding(game, "refinery", "enemy", 45, 23);
  addBuilding(game, "barracks", "enemy", 45, 14);
  addBuilding(game, "factory", "enemy", 52, 23);
  addBuilding(game, "turret", "enemy", 44, 20);

  addUnit(game, "harvester", "player", 22.5, 19.5);
  addUnit(game, "infantry", "player", 16.5, 15.5);
  addUnit(game, "infantry", "player", 17.5, 16.5);
  addUnit(game, "trike", "player", 19.5, 19.5);
  addUnit(game, "tank", "player", 18.5, 23.5);

  addUnit(game, "harvester", "enemy", 41.5, 22.5);
  addUnit(game, "tank", "enemy", 43.5, 18.5);
  addUnit(game, "infantry", "enemy", 44.5, 17.5);
  addUnit(game, "trike", "enemy", 34.5, 20.5);

  updateVisibility(game);
  announce(game, "Welcome to Arrakis, Commander. Harvest spice and destroy the enemy base.");
  return game;
}

export function getEntity(game: GameState, id: number): Entity | undefined {
  return game.units.find((unit) => unit.id === id) ?? game.buildings.find((building) => building.id === id);
}

export function isUnit(entity: Entity): entity is Unit {
  return "order" in entity;
}

export function getEntityAt(game: GameState, x: number, y: number): Entity | undefined {
  for (let index = game.units.length - 1; index >= 0; index--) {
    const unit = game.units[index];
    if (unit.owner === "enemy" && !game.tiles[Math.floor(unit.y)]?.[Math.floor(unit.x)]?.visible) continue;
    if (Math.hypot(unit.x - x, unit.y - y) < 0.56) return unit;
  }
  for (let index = game.buildings.length - 1; index >= 0; index--) {
    const building = game.buildings[index];
    const def = BUILDING_DEFS[building.type];
    if (building.owner === "enemy" && !game.tiles[building.y]?.[building.x]?.visible) continue;
    if (x >= building.x && x < building.x + def.width && y >= building.y && y < building.y + def.height) {
      return building;
    }
  }
  return undefined;
}

export function getPower(game: GameState): { produced: number; used: number } {
  let produced = 0;
  let used = 0;
  for (const building of game.buildings) {
    if (building.owner !== "player" || building.progress < 1) continue;
    const def = BUILDING_DEFS[building.type];
    produced += def.power ?? 0;
    used += def.powerUse ?? 0;
  }
  return { produced, used };
}

export function getStorageCapacity(game: GameState): number {
  return (
    3000 +
    game.buildings.filter((building) => building.owner === "player" && building.type === "silo").length * 1500
  );
}

export function canBuild(game: GameState, type: BuildingType): string | null {
  if (!game.buildings.some((building) => building.owner === "player" && building.type === "yard" && building.progress >= 1)) {
    return "Construction Yard required";
  }
  const def = BUILDING_DEFS[type];
  if (def.requires && !game.buildings.some((building) => building.owner === "player" && building.type === def.requires && building.progress >= 1)) {
    return `${BUILDING_DEFS[def.requires].name} required`;
  }
  if (game.credits < def.cost) return "Insufficient credits";
  return null;
}

export function canTrain(game: GameState, type: UnitType): string | null {
  const def = UNIT_DEFS[type];
  if (["sonic", "devastator", "raider"].includes(type) && HOUSES[game.house].specialty !== type) {
    return "Not available to this House";
  }
  if (!game.buildings.some((building) => building.owner === "player" && building.type === def.producer && building.progress >= 1)) {
    return `${BUILDING_DEFS[def.producer].name} required`;
  }
  if (game.production.length >= 5) return "Production queue full";
  if (game.credits < def.cost) return "Insufficient credits";
  return null;
}

export function queueUnit(game: GameState, type: UnitType): boolean {
  const issue = canTrain(game, type);
  if (issue) {
    announce(game, issue, "warning");
    return false;
  }
  game.credits -= UNIT_DEFS[type].cost;
  game.production.push({ type, progress: 0 });
  announce(game, `${UNIT_DEFS[type].name} production started.`, "success");
  return true;
}

function isOccupied(game: GameState, x: number, y: number): boolean {
  return game.buildings.some((building) => {
    const def = BUILDING_DEFS[building.type];
    return x >= building.x && x < building.x + def.width && y >= building.y && y < building.y + def.height;
  });
}

export function placementIssue(game: GameState, type: BuildingType, x: number, y: number): string | null {
  const def = BUILDING_DEFS[type];
  if (x < 0 || y < 0 || x + def.width > MAP_WIDTH || y + def.height > MAP_HEIGHT) return "Outside the map";
  for (let ty = y; ty < y + def.height; ty++) {
    for (let tx = x; tx < x + def.width; tx++) {
      const tile = game.tiles[ty][tx];
      if (tile.kind !== "rock" && tile.kind !== "slab") return "Build on rocky terrain";
      if (isOccupied(game, tx, ty)) return "Space is occupied";
      if (type === "slab" && tile.kind === "slab") return "Concrete already placed";
    }
  }

  const connected = game.buildings.some((building) => {
    if (building.owner !== "player") return false;
    const other = BUILDING_DEFS[building.type];
    const dx = Math.max(building.x - (x + def.width), x - (building.x + other.width), 0);
    const dy = Math.max(building.y - (y + def.height), y - (building.y + other.height), 0);
    return dx <= 2 && dy <= 2;
  });
  if (!connected) return "Place near your base";
  return null;
}

export function placeBuilding(game: GameState, type: BuildingType, x: number, y: number): boolean {
  const issue = canBuild(game, type) ?? placementIssue(game, type, x, y);
  if (issue) {
    announce(game, issue, "warning");
    return false;
  }
  game.credits -= BUILDING_DEFS[type].cost;
  if (type === "slab") {
    game.tiles[y][x].kind = "slab";
    announce(game, "Concrete foundation placed.", "success");
  } else {
    addBuilding(game, type, "player", x, y, false, false);
    announce(game, `${BUILDING_DEFS[type].name} construction underway.`, "success");
  }
  return true;
}

export function repairBuilding(game: GameState, id: number): boolean {
  const building = game.buildings.find((item) => item.id === id && item.owner === "player");
  if (!building || building.hp >= building.maxHp || building.progress < 1) return false;
  const healed = Math.min(building.maxHp - building.hp, building.maxHp * 0.35);
  const cost = Math.ceil(healed * 0.42);
  if (game.credits < cost) {
    announce(game, "Insufficient credits for repairs.", "warning");
    return false;
  }
  game.credits -= cost;
  building.hp += healed;
  announce(game, `${BUILDING_DEFS[building.type].name} repaired for ${cost} credits.`, "success");
  return true;
}

function nearestSpice(game: GameState, x: number, y: number, near?: Point): Point | null {
  let best: Point | null = null;
  let bestScore = Infinity;
  for (let ty = 0; ty < MAP_HEIGHT; ty++) {
    for (let tx = 0; tx < MAP_WIDTH; tx++) {
      const tile = game.tiles[ty][tx];
      if (tile.kind !== "spice" || tile.spice < 2) continue;
      const distance = Math.hypot(tx + 0.5 - x, ty + 0.5 - y);
      const preference = near ? Math.hypot(tx + 0.5 - near.x, ty + 0.5 - near.y) * 2 : 0;
      const score = distance + preference;
      if (score < bestScore) {
        bestScore = score;
        best = { x: tx + 0.5, y: ty + 0.5 };
      }
    }
  }
  return best;
}

export function issueOrder(
  game: GameState,
  ids: number[],
  mode: "move" | "attack" | "harvest" | "guard" | "stop",
  x = 0,
  y = 0,
  targetId: number | null = null,
): boolean {
  let changed = false;
  ids.forEach((id, index) => {
    const unit = game.units.find((item) => item.id === id && item.owner === "player");
    if (!unit) return;
    if (mode === "harvest") {
      if (unit.type !== "harvester") return;
      const spice = nearestSpice(game, unit.x, unit.y, { x, y });
      if (!spice) {
        announce(game, "No spice fields remain in this sector.", "warning");
        return;
      }
      unit.order = "harvest";
      unit.targetX = spice.x;
      unit.targetY = spice.y;
      unit.targetId = null;
    } else if (mode === "stop" || mode === "guard") {
      unit.order = "guard";
      unit.targetId = null;
      unit.targetX = unit.x;
      unit.targetY = unit.y;
    } else if (mode === "attack") {
      unit.order = targetId ? "attack" : "attackMove";
      unit.targetId = targetId;
      unit.targetX = x + (index % 3) * 0.35;
      unit.targetY = y + Math.floor(index / 3) * 0.35;
    } else {
      unit.order = "move";
      unit.targetId = null;
      unit.targetX = x + (index % 3) * 0.4;
      unit.targetY = y + Math.floor(index / 3) * 0.4;
    }
    unit.path = [];
    unit.pathGoal = "";
    changed = true;
  });
  if (changed && (mode === "move" || mode === "attack")) {
    game.effects.push({ kind: "marker", x, y, age: 0, life: 0.65, color: mode === "attack" ? "#e97754" : "#a6d4d6" });
  }
  return changed;
}

function walkable(game: GameState, x: number, y: number): boolean {
  return inBounds(x, y) && game.tiles[y][x].kind !== "mountain" && !isOccupied(game, x, y);
}

function closestOpenTile(game: GameState, x: number, y: number, fromX: number, fromY: number): Point {
  const tx = Math.max(0, Math.min(MAP_WIDTH - 1, Math.floor(x)));
  const ty = Math.max(0, Math.min(MAP_HEIGHT - 1, Math.floor(y)));
  if (walkable(game, tx, ty)) return { x: tx, y: ty };
  for (let radius = 1; radius <= 8; radius++) {
    let best: Point | null = null;
    let bestScore = Infinity;
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
        const px = tx + dx;
        const py = ty + dy;
        if (!walkable(game, px, py)) continue;
        const score = Math.hypot(px - fromX, py - fromY) + Math.hypot(dx, dy) * 0.3;
        if (score < bestScore) {
          best = { x: px, y: py };
          bestScore = score;
        }
      }
    }
    if (best) return best;
  }
  return { x: tx, y: ty };
}

function findPath(game: GameState, sx: number, sy: number, gx: number, gy: number): Point[] {
  const start = sy * MAP_WIDTH + sx;
  const goal = gy * MAP_WIDTH + gx;
  if (start === goal) return [];
  const size = MAP_WIDTH * MAP_HEIGHT;
  const gScore = new Float32Array(size);
  const fScore = new Float32Array(size);
  const cameFrom = new Int32Array(size);
  const closed = new Uint8Array(size);
  gScore.fill(Infinity);
  fScore.fill(Infinity);
  cameFrom.fill(-1);
  gScore[start] = 0;
  fScore[start] = Math.hypot(gx - sx, gy - sy);
  const open = [start];
  const directions = [
    [1, 0], [-1, 0], [0, 1], [0, -1],
    [1, 1], [1, -1], [-1, 1], [-1, -1],
  ];

  let iterations = 0;
  while (open.length && iterations++ < 2200) {
    let bestIndex = 0;
    for (let index = 1; index < open.length; index++) {
      if (fScore[open[index]] < fScore[open[bestIndex]]) bestIndex = index;
    }
    const current = open.splice(bestIndex, 1)[0];
    if (current === goal) {
      const path: Point[] = [];
      let node = current;
      while (node !== start && node !== -1) {
        path.push({ x: (node % MAP_WIDTH) + 0.5, y: Math.floor(node / MAP_WIDTH) + 0.5 });
        node = cameFrom[node];
      }
      return path.reverse();
    }
    closed[current] = 1;
    const x = current % MAP_WIDTH;
    const y = Math.floor(current / MAP_WIDTH);
    for (const [dx, dy] of directions) {
      const nx = x + dx;
      const ny = y + dy;
      if (!walkable(game, nx, ny)) continue;
      if (dx && dy && (!walkable(game, x + dx, y) || !walkable(game, x, y + dy))) continue;
      const neighbor = ny * MAP_WIDTH + nx;
      if (closed[neighbor]) continue;
      const tentative = gScore[current] + (dx && dy ? 1.414 : 1);
      if (tentative >= gScore[neighbor]) continue;
      cameFrom[neighbor] = current;
      gScore[neighbor] = tentative;
      fScore[neighbor] = tentative + Math.hypot(gx - nx, gy - ny);
      if (!open.includes(neighbor)) open.push(neighbor);
    }
  }
  return [];
}

function moveTo(game: GameState, unit: Unit, x: number, y: number, dt: number): boolean {
  const goal = closestOpenTile(game, x, y, unit.x, unit.y);
  const key = `${goal.x}:${goal.y}`;
  if (unit.pathGoal !== key || (game.time >= unit.repathAt && unit.path.length === 0)) {
    unit.path = findPath(game, Math.floor(unit.x), Math.floor(unit.y), goal.x, goal.y);
    unit.pathGoal = key;
    unit.repathAt = game.time + 1.4;
  }
  const waypoint = unit.path[0];
  if (!waypoint) return Math.hypot(unit.x - goal.x - 0.5, unit.y - goal.y - 0.5) < 0.55;
  const dx = waypoint.x - unit.x;
  const dy = waypoint.y - unit.y;
  const distance = Math.hypot(dx, dy);
  const speed = UNIT_DEFS[unit.type].speed * (game.tiles[Math.floor(unit.y)]?.[Math.floor(unit.x)]?.kind === "spice" ? 0.88 : 1);
  const step = speed * dt;
  if (distance <= step || distance < 0.06) {
    unit.x = waypoint.x;
    unit.y = waypoint.y;
    unit.path.shift();
  } else {
    unit.x += (dx / distance) * step;
    unit.y += (dy / distance) * step;
  }
  unit.facing = Math.atan2(dy, dx);
  if (unit.type !== "infantry" && noise(Math.floor(game.time * 22), unit.id, 12) > 0.85 && Math.random() < dt * 3) {
    game.effects.push({ kind: "dust", x: unit.x, y: unit.y, age: 0, life: 0.5 });
  }
  return unit.path.length === 0;
}

function entityCenter(entity: Entity): Point {
  if (isUnit(entity)) return { x: entity.x, y: entity.y };
  const def = BUILDING_DEFS[entity.type];
  return { x: entity.x + def.width / 2, y: entity.y + def.height / 2 };
}

function distanceToEntity(x: number, y: number, entity: Entity): number {
  if (isUnit(entity)) return Math.hypot(x - entity.x, y - entity.y);
  const def = BUILDING_DEFS[entity.type];
  const dx = Math.max(entity.x - x, x - (entity.x + def.width), 0);
  const dy = Math.max(entity.y - y, y - (entity.y + def.height), 0);
  return Math.hypot(dx, dy);
}

function nearestEnemy(game: GameState, owner: "player" | "enemy", x: number, y: number, range: number): Entity | null {
  let closest: Entity | null = null;
  let bestDistance = range;
  for (const entity of [...game.units, ...game.buildings]) {
    if (entity.owner === owner || entity.hp <= 0 || (!isUnit(entity) && entity.progress < 1)) continue;
    const distance = distanceToEntity(x, y, entity);
    if (distance < bestDistance) {
      closest = entity;
      bestDistance = distance;
    }
  }
  return closest;
}

function fire(game: GameState, attacker: Unit | Building, target: Entity, damage: number, color: string) {
  const from = entityCenter(attacker);
  const to = entityCenter(target);
  target.hp -= damage;
  game.effects.push({ kind: "shot", x: from.x, y: from.y, toX: to.x, toY: to.y, age: 0, life: 0.2, color });
  game.effects.push({ kind: "explosion", x: to.x, y: to.y, age: 0, life: 0.32 });
}

function updateHarvester(game: GameState, unit: Unit, dt: number) {
  if (unit.order !== "harvest" && unit.order !== "return") return;
  if (unit.order === "return" || unit.cargo >= 110) {
    unit.order = "return";
    const refineries = game.buildings.filter((building) => building.owner === unit.owner && building.type === "refinery" && building.progress >= 1);
    const refinery = refineries.sort((a, b) => distanceToEntity(unit.x, unit.y, a) - distanceToEntity(unit.x, unit.y, b))[0];
    if (!refinery) {
      unit.order = "guard";
      if (unit.owner === "player") announce(game, "A refinery is needed to unload spice.", "warning");
      return;
    }
    const center = entityCenter(refinery);
    if (distanceToEntity(unit.x, unit.y, refinery) < 0.85 || moveTo(game, unit, center.x, center.y, dt)) {
      if (unit.owner === "player" && unit.cargo > 0) {
        const value = Math.floor(unit.cargo * 3);
        const available = Math.max(0, getStorageCapacity(game) - game.credits);
        game.credits += Math.min(value, available);
        game.harvested += value;
        announce(game, `Spice delivered. +${Math.min(value, available)} credits.`, "success");
      }
      unit.cargo = 0;
      unit.order = "harvest";
      unit.path = [];
      unit.pathGoal = "";
      unit.targetX = 0;
      unit.targetY = 0;
    }
    return;
  }

  const tx = Math.floor(unit.targetX);
  const ty = Math.floor(unit.targetY);
  if (!inBounds(tx, ty) || game.tiles[ty][tx].kind !== "spice" || game.tiles[ty][tx].spice < 2) {
    const field = nearestSpice(game, unit.x, unit.y);
    if (!field) {
      unit.order = unit.cargo > 0 ? "return" : "guard";
      if (unit.owner === "player" && unit.cargo === 0) announce(game, "Spice in this sector has been exhausted.", "warning");
      return;
    }
    unit.targetX = field.x;
    unit.targetY = field.y;
    unit.path = [];
    unit.pathGoal = "";
  }
  if (Math.hypot(unit.x - unit.targetX, unit.y - unit.targetY) > 0.48) {
    moveTo(game, unit, unit.targetX, unit.targetY, dt);
  } else {
    const tile = game.tiles[Math.floor(unit.targetY)][Math.floor(unit.targetX)];
    const mined = Math.min(23 * dt, tile.spice, 110 - unit.cargo);
    unit.cargo += mined;
    tile.spice -= mined;
    if (Math.random() < dt * 3.5) game.effects.push({ kind: "harvest", x: unit.x, y: unit.y, age: 0, life: 0.45 });
    if (tile.spice < 2) {
      tile.kind = "sand";
      tile.spice = 0;
    }
    if (unit.cargo >= 109) {
      unit.order = "return";
      unit.path = [];
      unit.pathGoal = "";
    }
  }
}

function updateCombatUnit(game: GameState, unit: Unit, dt: number) {
  const def = UNIT_DEFS[unit.type];
  if (unit.order === "move") {
    if (moveTo(game, unit, unit.targetX, unit.targetY, dt)) unit.order = "guard";
    return;
  }

  if (unit.order === "guard" || unit.order === "attackMove") {
    const enemy = nearestEnemy(game, unit.owner, unit.x, unit.y, unit.order === "guard" ? 5.8 : 6.5);
    if (enemy) {
      unit.order = "attack";
      unit.targetId = enemy.id;
      unit.path = [];
      unit.pathGoal = "";
    } else if (unit.order === "attackMove" && moveTo(game, unit, unit.targetX, unit.targetY, dt)) {
      unit.order = "guard";
    }
    return;
  }

  if (unit.order !== "attack") return;
  const target = unit.targetId === null ? undefined : getEntity(game, unit.targetId);
  if (!target || target.hp <= 0) {
    unit.order = "guard";
    unit.targetId = null;
    unit.path = [];
    return;
  }
  const distance = distanceToEntity(unit.x, unit.y, target);
  if (distance <= def.range) {
    if (unit.cooldown <= 0 && def.damage > 0) {
      const house = unit.owner === "player" ? game.house : game.enemyHouse;
      const bonus = house === "harkonnen" && ["tank", "devastator"].includes(unit.type) ? 1.12 : 1;
      fire(game, unit, target, def.damage * bonus, unit.type === "sonic" ? "#a9e6ef" : "#f4d482");
      unit.cooldown = def.fireRate;
      unit.facing = Math.atan2(entityCenter(target).y - unit.y, entityCenter(target).x - unit.x);
    }
  } else {
    const center = entityCenter(target);
    moveTo(game, unit, center.x, center.y, dt);
  }
}

function spawnNear(game: GameState, building: Building): Point {
  const center = entityCenter(building);
  const tile = closestOpenTile(game, center.x, building.y + BUILDING_DEFS[building.type].height + 0.5, center.x, center.y);
  return { x: tile.x + 0.5, y: tile.y + 0.5 };
}

function updateProduction(game: GameState, dt: number) {
  const order = game.production[0];
  if (!order) return;
  const def = UNIT_DEFS[order.type];
  const producer = game.buildings.find((building) => building.owner === "player" && building.type === def.producer && building.progress >= 1);
  if (!producer) return;
  const power = getPower(game);
  order.progress += (dt / def.trainTime) * (power.produced < power.used ? 0.55 : 1);
  if (order.progress < 1) return;
  const spawn = spawnNear(game, producer);
  addUnit(game, order.type, "player", spawn.x, spawn.y);
  game.production.shift();
  announce(game, `${def.name} ready for orders.`, "success");
}

function updateEnemy(game: GameState) {
  if (game.time < game.nextWave) return;
  game.wave++;
  game.nextWave = game.time + Math.max(27, 39 - game.wave * 2);
  const factory = game.buildings.find((building) => building.owner === "enemy" && building.type === "factory");
  const barracks = game.buildings.find((building) => building.owner === "enemy" && building.type === "barracks");
  const playerTarget = game.buildings.find((building) => building.owner === "player" && building.type === "refinery")
    ?? game.buildings.find((building) => building.owner === "player");
  if (!playerTarget) return;
  const waveTypes: UnitType[] = game.wave % 3 === 0 ? ["tank", "trike", "infantry"] : ["trike", "infantry", "infantry"];
  if (game.wave > 2) waveTypes.push(game.wave % 2 ? "tank" : "trike");
  let spawned = 0;
  waveTypes.forEach((type, index) => {
    const producer = type === "infantry" ? barracks : factory;
    if (!producer) return;
    const point = spawnNear(game, producer);
    const unit = addUnit(game, type, "enemy", point.x + index * 0.3, point.y + index * 0.35);
    unit.order = "attack";
    unit.targetId = playerTarget.id;
    spawned++;
  });
  if (spawned) announce(game, "Enemy forces are advancing. Defend your base!", "warning");
}

function updateWorm(game: GameState, dt: number) {
  const worm = game.worm;
  if (!worm.active && game.time >= game.nextWorm) {
    const harvester = game.units.find((unit) => unit.owner === "player" && unit.type === "harvester" && game.tiles[Math.floor(unit.y)]?.[Math.floor(unit.x)]?.kind !== "rock");
    if (!harvester) {
      game.nextWorm = game.time + 16;
      return;
    }
    worm.x = Math.max(1, Math.min(MAP_WIDTH - 2, harvester.x + 4));
    worm.y = Math.max(1, Math.min(MAP_HEIGHT - 2, harvester.y + 3));
    worm.life = 19;
    worm.active = true;
    announce(game, "WORM SIGN! Move your harvester off the open sand!", "warning");
  }
  if (!worm.active) return;
  worm.life -= dt;
  const targets = game.units.filter((unit) => unit.type === "harvester" && game.tiles[Math.floor(unit.y)]?.[Math.floor(unit.x)]?.kind !== "rock");
  targets.sort((a, b) => Math.hypot(a.x - worm.x, a.y - worm.y) - Math.hypot(b.x - worm.x, b.y - worm.y));
  const target = targets[0];
  if (target) {
    const dx = target.x - worm.x;
    const dy = target.y - worm.y;
    const distance = Math.hypot(dx, dy);
    if (distance > 0.01) {
      worm.x += (dx / distance) * Math.min(distance, 1.7 * dt);
      worm.y += (dy / distance) * Math.min(distance, 1.7 * dt);
    }
    if (Math.random() < dt * 8) game.effects.push({ kind: "dust", x: worm.x, y: worm.y, age: 0, life: 0.6 });
    if (distance < 0.8) {
      target.hp = 0;
      game.effects.push({ kind: "explosion", x: target.x, y: target.y, age: 0, life: 0.8 });
      if (target.owner === "player") announce(game, "A sandworm has swallowed your harvester!", "warning");
      worm.active = false;
    }
  }
  if (worm.life <= 0 || !target) worm.active = false;
  if (!worm.active) game.nextWorm = game.time + 58;
}

function updateVisibility(game: GameState) {
  for (const row of game.tiles) for (const tile of row) tile.visible = false;
  const reveal = (x: number, y: number, radius: number) => {
    const minX = Math.max(0, Math.floor(x - radius));
    const maxX = Math.min(MAP_WIDTH - 1, Math.ceil(x + radius));
    const minY = Math.max(0, Math.floor(y - radius));
    const maxY = Math.min(MAP_HEIGHT - 1, Math.ceil(y + radius));
    for (let ty = minY; ty <= maxY; ty++) {
      for (let tx = minX; tx <= maxX; tx++) {
        if (Math.hypot(tx + 0.5 - x, ty + 0.5 - y) > radius) continue;
        game.tiles[ty][tx].visible = true;
        game.tiles[ty][tx].explored = true;
      }
    }
  };
  game.buildings.forEach((building) => {
    if (building.owner === "player") {
      const center = entityCenter(building);
      reveal(center.x, center.y, building.type === "yard" ? 10.5 : 7.8);
    }
  });
  game.units.forEach((unit) => {
    if (unit.owner === "player") reveal(unit.x, unit.y, unit.type === "trike" ? 7.5 : 5.8);
  });
}

export function tickGame(game: GameState, dt: number) {
  if (game.status !== "playing") return;
  game.time += dt;
  game.effects.forEach((effect) => { effect.age += dt; });
  game.effects = game.effects.filter((effect) => effect.age < effect.life);

  for (const building of game.buildings) {
    building.cooldown = Math.max(0, building.cooldown - dt);
    if (building.progress < 1) {
      building.progress = Math.min(1, building.progress + dt / BUILDING_DEFS[building.type].buildTime);
      if (building.progress === 1) {
        announce(game, `${BUILDING_DEFS[building.type].name} construction complete.`, "success");
        if (building.type === "refinery" && building.owner === "player") {
          const spawn = spawnNear(game, building);
          addUnit(game, "harvester", "player", spawn.x, spawn.y);
        }
      }
    } else if (building.owner === "player" && game.time > 12) {
      const def = BUILDING_DEFS[building.type];
      let bareTiles = 0;
      for (let y = building.y; y < building.y + def.height; y++) {
        for (let x = building.x; x < building.x + def.width; x++) {
          if (game.tiles[y][x].kind !== "slab") bareTiles++;
        }
      }
      if (bareTiles) building.hp -= dt * 0.1 * bareTiles;
    }
    if (building.type === "turret" && building.progress >= 1 && building.cooldown <= 0) {
      const center = entityCenter(building);
      const target = nearestEnemy(game, building.owner, center.x, center.y, 6.1);
      if (target) {
        fire(game, building, target, 38, "#f6c274");
        building.cooldown = 1.2;
      }
    }
  }

  for (const unit of game.units) {
    if (unit.hp <= 0) continue;
    unit.cooldown = Math.max(0, unit.cooldown - dt);
    if (unit.type === "harvester") updateHarvester(game, unit, dt);
    else updateCombatUnit(game, unit, dt);
  }

  updateProduction(game, dt);
  updateEnemy(game);
  updateWorm(game, dt);

  const destroyedUnits = game.units.filter((unit) => unit.hp <= 0);
  const destroyedBuildings = game.buildings.filter((building) => building.hp <= 0);
  destroyedUnits.forEach((unit) => game.effects.push({ kind: "explosion", x: unit.x, y: unit.y, age: 0, life: 0.75 }));
  destroyedBuildings.forEach((building) => {
    const center = entityCenter(building);
    game.effects.push({ kind: "explosion", x: center.x, y: center.y, age: 0, life: 1.1 });
    if (building.owner === "player") announce(game, `${BUILDING_DEFS[building.type].name} has been destroyed!`, "warning");
    else announce(game, `Enemy ${BUILDING_DEFS[building.type].name} destroyed.`, "success");
  });
  game.units = game.units.filter((unit) => unit.hp > 0);
  game.buildings = game.buildings.filter((building) => building.hp > 0);

  game.fogTimer += dt;
  if (game.fogTimer > 0.4) {
    updateVisibility(game);
    game.fogTimer = 0;
  }
  if (!game.buildings.some((building) => building.owner === "enemy")) {
    game.status = "victory";
    announce(game, "Arrakis is yours. The enemy base has fallen!", "success");
  } else if (!game.buildings.some((building) => building.owner === "player")) {
    game.status = "defeat";
    announce(game, "Your base has fallen. Arrakis is lost.", "warning");
  }
}