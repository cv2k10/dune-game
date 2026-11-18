export const MAP_WIDTH = 64;
export const MAP_HEIGHT = 48;
export const TILE_SIZE = 32;

export type House = "atreides" | "harkonnen" | "ordos";
export type Owner = "player" | "enemy";
export type TerrainKind = "sand" | "spice" | "rock" | "mountain" | "slab";
export type UnitType =
  | "infantry"
  | "trike"
  | "tank"
  | "harvester"
  | "sonic"
  | "devastator"
  | "raider";
export type BuildingType =
  | "slab"
  | "yard"
  | "windtrap"
  | "refinery"
  | "barracks"
  | "factory"
  | "turret"
  | "silo";
export type UnitOrder = "guard" | "move" | "attack" | "attackMove" | "harvest" | "return";
export type CommandMode = "move" | "attack" | "harvest";

export interface Point {
  x: number;
  y: number;
}

export interface Tile {
  kind: TerrainKind;
  spice: number;
  detail: number;
  explored: boolean;
  visible: boolean;
}

export interface Unit {
  id: number;
  owner: Owner;
  type: UnitType;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  order: UnitOrder;
  targetX: number;
  targetY: number;
  targetId: number | null;
  cargo: number;
  cooldown: number;
  facing: number;
  path: Point[];
  pathGoal: string;
  repathAt: number;
}

export interface Building {
  id: number;
  owner: Owner;
  type: Exclude<BuildingType, "slab">;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  progress: number;
  cooldown: number;
}

export interface ProductionOrder {
  type: UnitType;
  progress: number;
}

export interface Effect {
  kind: "explosion" | "dust" | "shot" | "marker" | "harvest";
  x: number;
  y: number;
  toX?: number;
  toY?: number;
  age: number;
  life: number;
  color?: string;
}

export interface Worm {
  x: number;
  y: number;
  life: number;
  active: boolean;
}

export interface GameEvent {
  text: string;
  tone: "info" | "success" | "warning";
}

export interface GameState {
  house: House;
  enemyHouse: House;
  tiles: Tile[][];
  units: Unit[];
  buildings: Building[];
  effects: Effect[];
  events: GameEvent[];
  production: ProductionOrder[];
  credits: number;
  harvested: number;
  time: number;
  nextId: number;
  nextWave: number;
  wave: number;
  nextWorm: number;
  worm: Worm;
  fogTimer: number;
  status: "playing" | "victory" | "defeat";
}

export interface BuildingDefinition {
  name: string;
  cost: number;
  width: number;
  height: number;
  hp: number;
  buildTime: number;
  description: string;
  requires?: Exclude<BuildingType, "slab">;
  power?: number;
  powerUse?: number;
}

export interface UnitDefinition {
  name: string;
  cost: number;
  hp: number;
  speed: number;
  damage: number;
  range: number;
  fireRate: number;
  trainTime: number;
  producer: "barracks" | "factory";
  description: string;
}

export const HOUSES: Record<House, { name: string; color: string; light: string; motto: string; specialty: UnitType }> = {
  atreides: {
    name: "Atreides",
    color: "#5aa9c8",
    light: "#9bd5e0",
    motto: "Honor. Loyalty. Victory.",
    specialty: "sonic",
  },
  harkonnen: {
    name: "Harkonnen",
    color: "#d65a48",
    light: "#f2a081",
    motto: "Power through force.",
    specialty: "devastator",
  },
  ordos: {
    name: "Ordos",
    color: "#83aa72",
    light: "#b8d3a0",
    motto: "Profit is power.",
    specialty: "raider",
  },
};

export const BUILDING_DEFS: Record<BuildingType, BuildingDefinition> = {
  slab: {
    name: "Concrete Slab",
    cost: 45,
    width: 1,
    height: 1,
    hp: 1,
    buildTime: 0,
    description: "A stable foundation for your base.",
  },
  yard: {
    name: "Construction Yard",
    cost: 900,
    width: 3,
    height: 3,
    hp: 900,
    buildTime: 9,
    description: "The heart of every base.",
    powerUse: 15,
  },
  windtrap: {
    name: "Wind Trap",
    cost: 300,
    width: 2,
    height: 2,
    hp: 500,
    buildTime: 5,
    description: "Generates power for your structures.",
    power: 100,
  },
  refinery: {
    name: "Spice Refinery",
    cost: 650,
    width: 3,
    height: 2,
    hp: 650,
    buildTime: 7,
    description: "Turns harvested spice into credits.",
    requires: "windtrap",
    powerUse: 25,
  },
  barracks: {
    name: "Barracks",
    cost: 380,
    width: 2,
    height: 2,
    hp: 440,
    buildTime: 5,
    description: "Trains infantry for the front line.",
    requires: "windtrap",
    powerUse: 15,
  },
  factory: {
    name: "Light Factory",
    cost: 750,
    width: 3,
    height: 2,
    hp: 620,
    buildTime: 8,
    description: "Manufactures combat vehicles.",
    requires: "refinery",
    powerUse: 30,
  },
  turret: {
    name: "Gun Turret",
    cost: 450,
    width: 1,
    height: 1,
    hp: 460,
    buildTime: 6,
    description: "Automated base defense.",
    requires: "barracks",
    powerUse: 20,
  },
  silo: {
    name: "Spice Silo",
    cost: 200,
    width: 2,
    height: 2,
    hp: 370,
    buildTime: 4,
    description: "Stores the wealth of Arrakis.",
    requires: "refinery",
    powerUse: 5,
  },
};

export const UNIT_DEFS: Record<UnitType, UnitDefinition> = {
  infantry: {
    name: "Infantry",
    cost: 100,
    hp: 90,
    speed: 2.25,
    damage: 13,
    range: 3.2,
    fireRate: 0.85,
    trainTime: 3.2,
    producer: "barracks",
    description: "Versatile ground soldiers.",
  },
  trike: {
    name: "Trike",
    cost: 280,
    hp: 180,
    speed: 3.4,
    damage: 22,
    range: 3.7,
    fireRate: 1.1,
    trainTime: 5,
    producer: "factory",
    description: "Fast reconnaissance vehicle.",
  },
  tank: {
    name: "Combat Tank",
    cost: 520,
    hp: 360,
    speed: 1.85,
    damage: 46,
    range: 4.5,
    fireRate: 1.55,
    trainTime: 8,
    producer: "factory",
    description: "Heavy armor and firepower.",
  },
  harvester: {
    name: "Harvester",
    cost: 650,
    hp: 400,
    speed: 1.55,
    damage: 0,
    range: 0,
    fireRate: 0,
    trainTime: 9,
    producer: "factory",
    description: "Collects spice from the dunes.",
  },
  sonic: {
    name: "Sonic Tank",
    cost: 850,
    hp: 310,
    speed: 1.75,
    damage: 62,
    range: 5.3,
    fireRate: 1.8,
    trainTime: 12,
    producer: "factory",
    description: "Atreides sonic-wave weaponry.",
  },
  devastator: {
    name: "Devastator",
    cost: 900,
    hp: 540,
    speed: 1.3,
    damage: 72,
    range: 4.3,
    fireRate: 1.8,
    trainTime: 13,
    producer: "factory",
    description: "Harkonnen's armored juggernaut.",
  },
  raider: {
    name: "Raider",
    cost: 380,
    hp: 210,
    speed: 4.1,
    damage: 26,
    range: 3.5,
    fireRate: 1,
    trainTime: 5.5,
    producer: "factory",
    description: "Ordos high-speed assault craft.",
  },
};

export const BUILD_MENU: BuildingType[] = ["slab", "windtrap", "refinery", "barracks", "factory", "turret", "silo"];
export const UNIT_MENU_BASE: UnitType[] = ["infantry", "trike", "tank", "harvester"];