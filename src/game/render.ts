import { placementIssue, type Entity, isUnit } from "./engine";
import {
  BUILDING_DEFS,
  HOUSES,
  MAP_HEIGHT,
  MAP_WIDTH,
  TILE_SIZE,
  type Building,
  type BuildingType,
  type Effect,
  type GameState,
  type Point,
  type Tile,
  type Unit,
} from "./types";

export interface Camera {
  x: number;
  y: number;
}

export interface DragBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

const sandColors = ["#bd8250", "#c68b54", "#c1844c", "#b97c48", "#ca8e56", "#bb8050"];
const spiceColors = ["#ad622c", "#bb6b2c", "#b46028", "#c47531", "#a95b2c"];
const rockColors = ["#665e50", "#6b6152", "#62594c", "#706555", "#5c554a"];

function tileDetail(ctx: CanvasRenderingContext2D, tile: Tile, x: number, y: number, time: number) {
  const value = tile.detail;
  const a = value % 23;
  const b = Math.floor(value / 7) % 22;
  const c = Math.floor(value / 13) % 20;
  if (tile.kind === "sand") {
    ctx.fillStyle = value % 3 === 0 ? "#d89a5b" : "#aa6d40";
    ctx.fillRect(x + a, y + 6 + (value % 5), 11, 2);
    ctx.fillStyle = "#da9c5e";
    ctx.fillRect(x + b, y + 19 + (value % 6), 8, 1);
    ctx.fillStyle = "#98643e";
    ctx.fillRect(x + c, y + 26, 2, 2);
    if (value % 4 === 0) {
      ctx.fillStyle = "#d79a5f";
      ctx.fillRect(x + 3, y + 14, 17, 1);
      ctx.fillRect(x + 8, y + 15, 13, 1);
    }
  } else if (tile.kind === "spice") {
    ctx.fillStyle = "#d68736";
    ctx.fillRect(x + 2, y + a, 13, 3);
    ctx.fillRect(x + b, y + 20, 10, 2);
    ctx.fillStyle = "#823f25";
    ctx.fillRect(x + 17, y + 7 + (value % 7), 8, 3);
    ctx.fillRect(x + c, y + 26, 5, 2);
    ctx.fillStyle = "#ee9a42";
    ctx.fillRect(x + 6 + (value % 12), y + 9, 3, 2);
    if (Math.sin(time * 2 + value) > 0.92) {
      ctx.fillStyle = "#f7bb69";
      ctx.fillRect(x + (value % 25), y + (Math.floor(value / 9) % 25), 2, 2);
    }
  } else if (tile.kind === "rock") {
    ctx.fillStyle = "#81735e";
    ctx.fillRect(x + a, y + 4, 13, 2);
    ctx.fillRect(x + 2, y + b, 8, 1);
    ctx.fillStyle = "#49483f";
    ctx.fillRect(x + c, y + 19, 11, 2);
    ctx.fillRect(x + 21, y + 25, 5, 2);
    if (value % 3 === 0) {
      ctx.strokeStyle = "#4f4b41";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + 5, y + 20);
      ctx.lineTo(x + 12, y + 14);
      ctx.lineTo(x + 18, y + 16);
      ctx.stroke();
    }
  } else if (tile.kind === "mountain") {
    ctx.fillStyle = "#2d302f";
    ctx.beginPath();
    ctx.moveTo(x - 2, y + 31);
    ctx.lineTo(x + a - 4, y + 3);
    ctx.lineTo(x + 20, y + 29);
    ctx.lineTo(x + 30, y + 8);
    ctx.lineTo(x + 34, y + 32);
    ctx.fill();
    ctx.fillStyle = "#73624e";
    ctx.beginPath();
    ctx.moveTo(x + a - 4, y + 3);
    ctx.lineTo(x + a + 1, y + 12);
    ctx.lineTo(x + 7, y + 19);
    ctx.fill();
    ctx.fillStyle = "#918069";
    ctx.fillRect(x + 22, y + 13, 2, 8);
  } else {
    ctx.fillStyle = "#89826c";
    ctx.fillRect(x, y, 31, 31);
    ctx.fillStyle = "#aaa087";
    ctx.fillRect(x + 1, y + 1, 30, 2);
    ctx.fillRect(x + 1, y + 1, 2, 29);
    ctx.fillStyle = "#4b4a43";
    ctx.fillRect(x + 29, y + 2, 2, 29);
    ctx.fillRect(x + 2, y + 29, 29, 2);
    ctx.fillStyle = "#6e6a5a";
    ctx.fillRect(x + 10, y + 10, 3, 2);
    ctx.fillRect(x + 24, y + 21, 2, 2);
  }
}

function drawTile(ctx: CanvasRenderingContext2D, tile: Tile, x: number, y: number, time: number) {
  const variant = tile.detail % 6;
  if (tile.kind === "sand") ctx.fillStyle = sandColors[variant];
  else if (tile.kind === "spice") ctx.fillStyle = spiceColors[tile.detail % spiceColors.length];
  else if (tile.kind === "rock") ctx.fillStyle = rockColors[tile.detail % rockColors.length];
  else if (tile.kind === "mountain") ctx.fillStyle = "#504a41";
  else ctx.fillStyle = "#77715f";
  ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
  tileDetail(ctx, tile, x, y, time);
}

function drawHealth(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, percent: number, ownerColor: string) {
  ctx.fillStyle = "#151c1d";
  ctx.fillRect(x - width / 2 - 1, y - 1, width + 2, 5);
  ctx.fillStyle = "#6e3b30";
  ctx.fillRect(x - width / 2, y, width, 3);
  ctx.fillStyle = percent < 0.35 ? "#e4a14d" : ownerColor;
  ctx.fillRect(x - width / 2, y, Math.max(0, width * percent), 3);
}

function drawBuildingSprite(ctx: CanvasRenderingContext2D, building: Building, color: string, time: number) {
  const def = BUILDING_DEFS[building.type];
  const width = def.width * TILE_SIZE;
  const height = def.height * TILE_SIZE;
  ctx.save();
  ctx.translate(building.x * TILE_SIZE, building.y * TILE_SIZE);

  ctx.fillStyle = "rgba(15, 18, 18, .34)";
  ctx.fillRect(7, 12, width - 6, height - 5);
  ctx.fillStyle = "#262f31";
  ctx.fillRect(3, 9, width - 7, height - 13);
  ctx.fillStyle = "#373d3d";
  ctx.fillRect(5, 5, width - 11, height - 16);
  ctx.fillStyle = "#6c6658";
  ctx.fillRect(8, 4, width - 17, 4);
  ctx.fillStyle = color;
  ctx.fillRect(5, 5, width - 11, 4);
  ctx.fillStyle = "rgba(9, 20, 23, .55)";
  ctx.fillRect(6, height - 13, width - 13, 6);

  if (building.type === "yard") {
    ctx.fillStyle = "#484c49";
    ctx.fillRect(13, 16, width - 26, height - 36);
    ctx.fillStyle = "#293c3d";
    ctx.fillRect(21, 23, width - 42, height - 48);
    ctx.fillStyle = color;
    ctx.fillRect(23, 25, width - 46, 5);
    ctx.fillRect(23, height - 29, width - 46, 4);
    ctx.fillStyle = "#c5a574";
    ctx.fillRect(44, 13, 6, 49);
    ctx.fillRect(42, 13, 20, 4);
    ctx.fillRect(55, 17, 3, 14);
    ctx.fillStyle = "#d8c596";
    ctx.fillRect(46, 19, 2, 28);
    ctx.fillStyle = "#171f22";
    ctx.fillRect(9, 19, 9, 17);
    ctx.fillRect(width - 19, 19, 9, 17);
    ctx.fillRect(9, 53, 11, 16);
    ctx.fillRect(width - 21, 53, 11, 16);
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = i === 1 ? "#e9b666" : color;
      ctx.fillRect(29 + i * 10, 44, 5, 4);
    }
  } else if (building.type === "windtrap") {
    ctx.fillStyle = "#535b59";
    ctx.fillRect(9, 12, 46, 39);
    ctx.fillStyle = "#242f32";
    ctx.fillRect(11, 15, 42, 34);
    for (const cx of [22, 43]) {
      ctx.fillStyle = "#9d967e";
      ctx.fillRect(cx - 10, 19, 19, 19);
      ctx.fillStyle = "#18272b";
      ctx.fillRect(cx - 7, 22, 13, 13);
      ctx.save();
      ctx.translate(cx, 28);
      ctx.rotate(time * 0.75);
      ctx.fillStyle = color;
      ctx.fillRect(-2, -8, 4, 16);
      ctx.fillRect(-8, -2, 16, 4);
      ctx.restore();
      ctx.fillStyle = "#cbb48c";
      ctx.fillRect(cx - 2, 26, 4, 4);
    }
    ctx.fillStyle = color;
    ctx.fillRect(14, 42, 36, 3);
  } else if (building.type === "refinery") {
    ctx.fillStyle = "#79715e";
    ctx.fillRect(11, 13, 54, 38);
    ctx.fillStyle = "#2d3b3c";
    ctx.fillRect(15, 17, 45, 30);
    ctx.fillStyle = color;
    ctx.fillRect(15, 18, 45, 5);
    ctx.fillStyle = "#c9a36c";
    ctx.fillRect(20, 30, 30, 4);
    ctx.fillStyle = "#101d21";
    ctx.fillRect(22, 38, 26, 10);
    for (const cx of [69, 82]) {
      ctx.fillStyle = "#ad9b77";
      ctx.beginPath();
      ctx.ellipse(cx, 32, 7, 17, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#514f45";
      ctx.fillRect(cx - 5, 27, 10, 12);
      ctx.fillStyle = "#d9bb85";
      ctx.fillRect(cx - 4, 19, 8, 3);
    }
    ctx.fillStyle = "#d0a75c";
    ctx.fillRect(13, 49, 68, 3);
  } else if (building.type === "barracks") {
    ctx.fillStyle = "#57605c";
    ctx.fillRect(9, 12, 46, 39);
    ctx.fillStyle = "#2b3738";
    ctx.fillRect(13, 16, 38, 32);
    ctx.fillStyle = color;
    ctx.fillRect(13, 16, 38, 6);
    ctx.fillStyle = "#132328";
    ctx.fillRect(25, 35, 14, 16);
    ctx.fillStyle = "#d3b47e";
    for (let i = 0; i < 3; i++) ctx.fillRect(17 + i * 13, 26, 7, 4);
    ctx.fillStyle = "#8c8b76";
    ctx.fillRect(11, 53, 43, 3);
  } else if (building.type === "factory") {
    ctx.fillStyle = "#5e665f";
    ctx.fillRect(10, 11, 77, 44);
    ctx.fillStyle = "#344448";
    ctx.fillRect(13, 15, 70, 36);
    ctx.fillStyle = color;
    ctx.fillRect(13, 15, 70, 6);
    ctx.fillStyle = "#18272b";
    ctx.fillRect(26, 31, 54, 23);
    ctx.fillStyle = "#7c8377";
    for (let i = 0; i < 4; i++) ctx.fillRect(28, 35 + i * 5, 50, 2);
    ctx.fillStyle = "#c5a66d";
    ctx.fillRect(17, 24, 8, 5);
    ctx.fillRect(70, 24, 8, 5);
    ctx.fillStyle = "#22292c";
    ctx.fillRect(16, 3, 10, 14);
    ctx.fillStyle = "#a79a7b";
    ctx.fillRect(18, 1, 6, 5);
  } else if (building.type === "turret") {
    ctx.fillStyle = "#66726d";
    ctx.fillRect(5, 7, 23, 20);
    ctx.fillStyle = "#202e32";
    ctx.fillRect(9, 11, 15, 14);
    ctx.fillStyle = color;
    ctx.fillRect(10, 12, 13, 4);
    ctx.fillStyle = "#c9bd98";
    ctx.fillRect(14, 1, 5, 16);
    ctx.fillRect(11, 4, 11, 4);
  } else if (building.type === "silo") {
    for (const cx of [21, 44]) {
      ctx.fillStyle = "#928a70";
      ctx.beginPath();
      ctx.ellipse(cx, 31, 11, 23, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#34403e";
      ctx.fillRect(cx - 8, 25, 16, 22);
      ctx.fillStyle = color;
      ctx.fillRect(cx - 7, 17, 14, 4);
      ctx.fillStyle = "#d6ba83";
      ctx.fillRect(cx - 5, 11, 10, 3);
    }
  }

  if (building.progress < 1) {
    const unbuilt = 1 - building.progress;
    ctx.fillStyle = "rgba(18, 21, 22, .72)";
    ctx.fillRect(4, 5, width - 9, (height - 12) * unbuilt);
    ctx.strokeStyle = "#d3ac68";
    ctx.lineWidth = 2;
    ctx.strokeRect(3, 4, width - 7, height - 10);
    ctx.fillStyle = "#e7b764";
    ctx.fillRect(5, height - 7, (width - 10) * building.progress, 3);
  }
  if (building.hp / building.maxHp < 0.48) {
    ctx.fillStyle = "rgba(25, 24, 22, .52)";
    ctx.fillRect(width * 0.58, 13, 12, 14);
    ctx.fillRect(width * 0.44, 9, 8, 5);
  }
  ctx.restore();
}

export function drawUnitSprite(ctx: CanvasRenderingContext2D, unit: Unit, color: string, time: number) {
  ctx.save();
  ctx.translate(unit.x * TILE_SIZE, unit.y * TILE_SIZE);
  ctx.fillStyle = "rgba(20, 21, 17, .38)";
  ctx.beginPath();
  ctx.ellipse(2, 7, unit.type === "infantry" ? 6 : 16, unit.type === "infantry" ? 4 : 9, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.rotate(unit.facing + Math.PI / 2);

  if (unit.type === "infantry") {
    ctx.fillStyle = "#222b2b";
    ctx.fillRect(-4, -1, 3, 8);
    ctx.fillRect(2, -1, 3, 8);
    ctx.fillStyle = color;
    ctx.fillRect(-5, -6, 10, 8);
    ctx.fillStyle = "#d3b78c";
    ctx.fillRect(-3, -10, 6, 5);
    ctx.fillStyle = "#263235";
    ctx.fillRect(-4, -11, 8, 3);
    ctx.fillStyle = "#e5ca95";
    ctx.fillRect(5, -6, 2, 10);
  } else if (unit.type === "harvester") {
    ctx.fillStyle = "#292d2b";
    ctx.fillRect(-16, -12, 6, 24);
    ctx.fillRect(10, -12, 6, 24);
    ctx.fillStyle = "#6a6455";
    for (let i = -9; i <= 8; i += 5) {
      ctx.fillRect(-15, i, 4, 2);
      ctx.fillRect(11, i, 4, 2);
    }
    ctx.fillStyle = "#495352";
    ctx.fillRect(-11, -14, 22, 27);
    ctx.fillStyle = color;
    ctx.fillRect(-9, -12, 18, 5);
    ctx.fillStyle = "#ac8756";
    ctx.fillRect(-8, -4, 16, 13);
    ctx.fillStyle = unit.cargo > 15 ? "#d78436" : "#735c42";
    ctx.fillRect(-6, -2, 12, 9);
    ctx.fillStyle = "#d8b982";
    ctx.fillRect(-12, -17, 24, 4);
    ctx.fillStyle = "#232e2f";
    ctx.fillRect(-6, -18, 12, 4);
  } else if (unit.type === "trike" || unit.type === "raider") {
    ctx.fillStyle = "#232a29";
    ctx.fillRect(-12, 3, 7, 7);
    ctx.fillRect(5, 3, 7, 7);
    ctx.fillRect(-4, -13, 8, 7);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, -13);
    ctx.lineTo(8, 7);
    ctx.lineTo(0, 4);
    ctx.lineTo(-8, 7);
    ctx.fill();
    ctx.fillStyle = "#d2bd91";
    ctx.fillRect(-2, -8, 4, 9);
    ctx.fillStyle = unit.type === "raider" ? "#b5d8a0" : "#e4ca97";
    ctx.fillRect(-2, -15, 4, 4);
    ctx.fillStyle = "#263035";
    ctx.fillRect(-4, 3, 8, 4);
  } else {
    const heavy = unit.type === "devastator";
    const half = heavy ? 15 : 13;
    ctx.fillStyle = "#242b2a";
    ctx.fillRect(-half, -12, 6, 25);
    ctx.fillRect(half - 6, -12, 6, 25);
    ctx.fillStyle = "#747367";
    for (let i = -9; i < 12; i += 5) {
      ctx.fillRect(-half + 1, i, 4, 2);
      ctx.fillRect(half - 5, i, 4, 2);
    }
    ctx.fillStyle = "#3c4847";
    ctx.fillRect(-half + 5, -13, half * 2 - 10, 26);
    ctx.fillStyle = color;
    ctx.fillRect(-half + 6, -11, half * 2 - 12, 5);
    ctx.fillRect(-half + 6, 8, half * 2 - 12, 3);
    ctx.fillStyle = "#b6aa88";
    ctx.fillRect(-7, -6, 14, 11);
    ctx.fillStyle = "#28383b";
    ctx.fillRect(-5, -4, 10, 8);
    if (unit.type === "sonic") {
      ctx.fillStyle = "#91c9cc";
      ctx.fillRect(-6, -21, 4, 19);
      ctx.fillRect(2, -21, 4, 19);
      ctx.fillStyle = "#d1f0e7";
      ctx.fillRect(-6, -22, 12, 3);
    } else {
      ctx.fillStyle = "#c5bb99";
      ctx.fillRect(-2, -21, 4, 18);
      if (heavy) {
        ctx.fillRect(-8, -19, 3, 15);
        ctx.fillRect(5, -19, 3, 15);
      }
    }
    ctx.fillStyle = "#e3cd9b";
    ctx.fillRect(-3, -5, 6, 3);
  }
  ctx.restore();

  if (unit.type === "harvester" && unit.order === "harvest" && Math.sin(time * 7 + unit.id) > 0.55) {
    ctx.fillStyle = "#efb255";
    ctx.fillRect(unit.x * TILE_SIZE - 10, unit.y * TILE_SIZE + 12, 4, 3);
  }
}

function drawWorm(ctx: CanvasRenderingContext2D, game: GameState) {
  const worm = game.worm;
  if (!worm.active) return;
  const x = worm.x * TILE_SIZE;
  const y = worm.y * TILE_SIZE;
  const pulse = Math.sin(game.time * 9) * 2;
  ctx.fillStyle = "rgba(46, 32, 24, .25)";
  ctx.beginPath();
  ctx.ellipse(x, y + 3, 34 + pulse, 21 + pulse, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#e2a05c";
  ctx.beginPath();
  ctx.ellipse(x, y, 25 + pulse, 20 + pulse, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#9b6341";
  ctx.beginPath();
  ctx.ellipse(x, y, 20, 16, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#342c29";
  ctx.beginPath();
  ctx.ellipse(x, y, 12, 10, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#f5cc8b";
  ctx.lineWidth = 2;
  for (let i = 0; i < 12; i++) {
    const angle = (i / 12) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(angle) * 13, y + Math.sin(angle) * 11);
    ctx.lineTo(x + Math.cos(angle) * 7, y + Math.sin(angle) * 5);
    ctx.stroke();
  }
}

function drawEffect(ctx: CanvasRenderingContext2D, effect: Effect) {
  const x = effect.x * TILE_SIZE;
  const y = effect.y * TILE_SIZE;
  const progress = effect.age / effect.life;
  ctx.save();
  ctx.globalAlpha = Math.max(0, 1 - progress);
  if (effect.kind === "shot" && effect.toX !== undefined && effect.toY !== undefined) {
    ctx.strokeStyle = effect.color ?? "#f8d187";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(effect.toX * TILE_SIZE, effect.toY * TILE_SIZE);
    ctx.stroke();
    ctx.fillStyle = "#fff0b4";
    ctx.fillRect(effect.toX * TILE_SIZE - 3, effect.toY * TILE_SIZE - 3, 6, 6);
  } else if (effect.kind === "explosion") {
    const radius = 5 + progress * 18;
    ctx.fillStyle = progress < 0.45 ? "#f9dfa0" : "#de7942";
    ctx.fillRect(x - radius / 2, y - radius / 2, radius, radius);
    ctx.fillStyle = "#f2ad5d";
    ctx.fillRect(x - radius, y - 2, radius * 2, 4);
    ctx.fillRect(x - 2, y - radius, 4, radius * 2);
  } else if (effect.kind === "marker") {
    const radius = 8 + progress * 11;
    ctx.strokeStyle = effect.color ?? "#a8d9dd";
    ctx.lineWidth = 2;
    ctx.strokeRect(x - radius, y - radius, radius * 2, radius * 2);
    ctx.fillStyle = effect.color ?? "#a8d9dd";
    ctx.fillRect(x - 2, y - 2, 4, 4);
  } else if (effect.kind === "harvest") {
    ctx.fillStyle = "#efae5a";
    ctx.fillRect(x - 9 - progress * 5, y + 10 - progress * 9, 5, 5);
    ctx.fillRect(x + 7 + progress * 4, y + 8 - progress * 12, 3, 3);
  } else {
    ctx.fillStyle = "#dfb273";
    const size = 4 + progress * 12;
    ctx.fillRect(x - size / 2 - 8, y - progress * 8, size, size / 2);
    ctx.fillRect(x + 5, y - 5 - progress * 11, size * 0.7, size * 0.5);
  }
  ctx.restore();
}

export function drawWorld(
  ctx: CanvasRenderingContext2D,
  game: GameState,
  camera: Camera,
  width: number,
  height: number,
  selectedIds: number[],
  placement: BuildingType | null,
  pointer: Point | null,
  drag: DragBox | null,
) {
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#242824";
  ctx.fillRect(0, 0, width, height);
  const startX = Math.max(0, Math.floor(camera.x));
  const startY = Math.max(0, Math.floor(camera.y));
  const endX = Math.min(MAP_WIDTH, Math.ceil(camera.x + width / TILE_SIZE) + 1);
  const endY = Math.min(MAP_HEIGHT, Math.ceil(camera.y + height / TILE_SIZE) + 1);

  ctx.save();
  ctx.translate(-Math.round(camera.x * TILE_SIZE), -Math.round(camera.y * TILE_SIZE));
  for (let y = startY; y < endY; y++) {
    for (let x = startX; x < endX; x++) {
      drawTile(ctx, game.tiles[y][x], x * TILE_SIZE, y * TILE_SIZE, game.time);
    }
  }

  const buildings = game.buildings.filter((building) =>
    building.x + BUILDING_DEFS[building.type].width >= startX && building.x <= endX &&
    building.y + BUILDING_DEFS[building.type].height >= startY && building.y <= endY &&
    (building.owner === "player" || game.tiles[building.y]?.[building.x]?.visible),
  );
  buildings.forEach((building) => {
    const color = HOUSES[building.owner === "player" ? game.house : game.enemyHouse].color;
    drawBuildingSprite(ctx, building, color, game.time);
    if (selectedIds.includes(building.id) || building.hp < building.maxHp * 0.72) {
      const def = BUILDING_DEFS[building.type];
      drawHealth(ctx, (building.x + def.width / 2) * TILE_SIZE, building.y * TILE_SIZE - 6, Math.min(64, def.width * 24), building.hp / building.maxHp, color);
    }
    if (selectedIds.includes(building.id)) {
      const def = BUILDING_DEFS[building.type];
      ctx.strokeStyle = "#e2d5a2";
      ctx.lineWidth = 2;
      ctx.strokeRect(building.x * TILE_SIZE + 1, building.y * TILE_SIZE + 1, def.width * TILE_SIZE - 2, def.height * TILE_SIZE - 2);
    }
  });

  game.units.forEach((unit) => {
    if (unit.x < startX - 1 || unit.x > endX + 1 || unit.y < startY - 1 || unit.y > endY + 1) return;
    if (unit.owner === "enemy" && !game.tiles[Math.floor(unit.y)]?.[Math.floor(unit.x)]?.visible) return;
    const color = HOUSES[unit.owner === "player" ? game.house : game.enemyHouse].color;
    drawUnitSprite(ctx, unit, color, game.time);
    if (selectedIds.includes(unit.id)) {
      ctx.strokeStyle = "#ede4ba";
      ctx.lineWidth = 2;
      ctx.strokeRect(unit.x * TILE_SIZE - 17, unit.y * TILE_SIZE - 17, 34, 34);
    }
    if (selectedIds.includes(unit.id) || unit.hp < unit.maxHp * 0.65) {
      drawHealth(ctx, unit.x * TILE_SIZE, unit.y * TILE_SIZE - 24, 26, unit.hp / unit.maxHp, color);
    }
  });
  if (game.worm.active && game.tiles[Math.floor(game.worm.y)]?.[Math.floor(game.worm.x)]?.visible) drawWorm(ctx, game);
  game.effects.forEach((effect) => {
    if (effect.x >= startX - 1 && effect.x <= endX + 1 && effect.y >= startY - 1 && effect.y <= endY + 1) drawEffect(ctx, effect);
  });

  for (let y = startY; y < endY; y++) {
    for (let x = startX; x < endX; x++) {
      const tile = game.tiles[y][x];
      if (tile.visible) continue;
      ctx.fillStyle = tile.explored ? "rgba(16, 23, 23, .48)" : "rgba(16, 22, 23, .94)";
      ctx.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
      if (!tile.explored && tile.detail % 3 === 0) {
        ctx.fillStyle = "rgba(105, 94, 72, .1)";
        ctx.fillRect(x * TILE_SIZE + 5, y * TILE_SIZE + 16, 17, 1);
      }
    }
  }

  if (placement && pointer) {
    const x = Math.floor(pointer.x);
    const y = Math.floor(pointer.y);
    const def = BUILDING_DEFS[placement];
    const valid = !placementIssue(game, placement, x, y);
    const px = x * TILE_SIZE;
    const py = y * TILE_SIZE;
    ctx.fillStyle = valid ? "rgba(121, 199, 166, .35)" : "rgba(233, 106, 80, .34)";
    ctx.fillRect(px, py, def.width * TILE_SIZE, def.height * TILE_SIZE);
    ctx.strokeStyle = valid ? "#a9e4b9" : "#ee8a6c";
    ctx.lineWidth = 2;
    ctx.strokeRect(px + 1, py + 1, def.width * TILE_SIZE - 2, def.height * TILE_SIZE - 2);
    for (let i = 1; i < def.width; i++) {
      ctx.beginPath();
      ctx.moveTo(px + i * TILE_SIZE, py);
      ctx.lineTo(px + i * TILE_SIZE, py + def.height * TILE_SIZE);
      ctx.stroke();
    }
    for (let i = 1; i < def.height; i++) {
      ctx.beginPath();
      ctx.moveTo(px, py + i * TILE_SIZE);
      ctx.lineTo(px + def.width * TILE_SIZE, py + i * TILE_SIZE);
      ctx.stroke();
    }
  }

  if (drag) {
    const x = Math.min(drag.x1, drag.x2) * TILE_SIZE;
    const y = Math.min(drag.y1, drag.y2) * TILE_SIZE;
    const w = Math.abs(drag.x2 - drag.x1) * TILE_SIZE;
    const h = Math.abs(drag.y2 - drag.y1) * TILE_SIZE;
    ctx.fillStyle = "rgba(126, 193, 203, .14)";
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = "#a9d6dc";
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, w, h);
  }
  ctx.restore();

  const vignette = ctx.createLinearGradient(0, 0, width, 0);
  vignette.addColorStop(0, "rgba(12, 18, 18, .13)");
  vignette.addColorStop(0.18, "rgba(12, 18, 18, 0)");
  vignette.addColorStop(0.82, "rgba(12, 18, 18, 0)");
  vignette.addColorStop(1, "rgba(12, 18, 18, .22)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, width, height);
}

export function drawMinimap(ctx: CanvasRenderingContext2D, game: GameState, camera: Camera, viewportWidth: number, viewportHeight: number, width: number, height: number) {
  ctx.fillStyle = "#111c20";
  ctx.fillRect(0, 0, width, height);
  const tileWidth = width / MAP_WIDTH;
  const tileHeight = height / MAP_HEIGHT;
  for (let y = 0; y < MAP_HEIGHT; y++) {
    for (let x = 0; x < MAP_WIDTH; x++) {
      const tile = game.tiles[y][x];
      if (!tile.explored) continue;
      if (tile.kind === "rock" || tile.kind === "slab") ctx.fillStyle = tile.visible ? "#786e5a" : "#4c4d45";
      else if (tile.kind === "spice") ctx.fillStyle = tile.visible ? "#d2843b" : "#7d5135";
      else if (tile.kind === "mountain") ctx.fillStyle = "#353735";
      else ctx.fillStyle = tile.visible ? "#a8764c" : "#655344";
      ctx.fillRect(x * tileWidth, y * tileHeight, Math.ceil(tileWidth), Math.ceil(tileHeight));
    }
  }
  game.buildings.forEach((building) => {
    if (building.owner === "enemy" && !game.tiles[building.y]?.[building.x]?.visible) return;
    const def = BUILDING_DEFS[building.type];
    ctx.fillStyle = HOUSES[building.owner === "player" ? game.house : game.enemyHouse].light;
    ctx.fillRect(building.x * tileWidth, building.y * tileHeight, Math.max(2, def.width * tileWidth), Math.max(2, def.height * tileHeight));
  });
  game.units.forEach((unit) => {
    if (unit.owner === "enemy" && !game.tiles[Math.floor(unit.y)]?.[Math.floor(unit.x)]?.visible) return;
    ctx.fillStyle = HOUSES[unit.owner === "player" ? game.house : game.enemyHouse].light;
    ctx.fillRect(unit.x * tileWidth - 1, unit.y * tileHeight - 1, 3, 3);
  });
  if (game.worm.active && game.tiles[Math.floor(game.worm.y)]?.[Math.floor(game.worm.x)]?.visible) {
    ctx.fillStyle = "#f4e1a7";
    ctx.fillRect(game.worm.x * tileWidth - 2, game.worm.y * tileHeight - 2, 5, 5);
  }
  ctx.strokeStyle = "#e9d69d";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(camera.x * tileWidth + 0.5, camera.y * tileHeight + 0.5, viewportWidth / TILE_SIZE * tileWidth, viewportHeight / TILE_SIZE * tileHeight);
}

export function drawPortrait(ctx: CanvasRenderingContext2D, game: GameState, entity: Entity | undefined, width: number, height: number) {
  ctx.fillStyle = "#1b282a";
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = "rgba(128, 151, 142, .11)";
  ctx.lineWidth = 1;
  for (let y = 9; y < height; y += 11) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }
  ctx.fillStyle = "rgba(180, 143, 83, .12)";
  ctx.fillRect(0, height - 20, width, 20);
  if (!entity) {
    ctx.strokeStyle = "#466469";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(width / 2, height / 2, 21, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(width / 2, height / 2, 10, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "#7ba6a5";
    ctx.fillRect(width / 2 - 2, height / 2 - 2, 4, 4);
    return;
  }
  const color = HOUSES[entity.owner === "player" ? game.house : game.enemyHouse].color;
  ctx.save();
  if (isUnit(entity)) {
    const scale = entity.type === "infantry" ? 3.3 : 2.05;
    ctx.translate(width / 2 - entity.x * TILE_SIZE * scale, height / 2 - entity.y * TILE_SIZE * scale + 7);
    ctx.scale(scale, scale);
    drawUnitSprite(ctx, entity, color, game.time);
  } else {
    const def = BUILDING_DEFS[entity.type];
    const scale = Math.min((width - 8) / (def.width * TILE_SIZE), (height - 8) / (def.height * TILE_SIZE));
    ctx.translate((width - def.width * TILE_SIZE * scale) / 2 - entity.x * TILE_SIZE * scale, (height - def.height * TILE_SIZE * scale) / 2 - entity.y * TILE_SIZE * scale);
    ctx.scale(scale, scale);
    drawBuildingSprite(ctx, entity, color, game.time);
  }
  ctx.restore();
}