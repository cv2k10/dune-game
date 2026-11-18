import type { BuildingType, House, UnitType } from "../game/types";

export function Icon({ name, size = 18 }: { name: string; size?: number }) {
  const shared = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "square" as const, strokeLinejoin: "miter" as const };
  if (name === "arrow") return <svg {...shared}><path d="M4 12h15M13 6l6 6-6 6" /></svg>;
  if (name === "play") return <svg {...shared}><path d="m7 4 13 8-13 8V4Z" fill="currentColor" stroke="none" /></svg>;
  if (name === "pause") return <svg {...shared}><path d="M7 4h3v16H7zM14 4h3v16h-3z" fill="currentColor" stroke="none" /></svg>;
  if (name === "close") return <svg {...shared}><path d="M5 5 19 19M19 5 5 19" /></svg>;
  if (name === "sound") return <svg {...shared}><path d="M4 9v6h4l5 4V5L8 9H4ZM17 8c2 2 2 6 0 8M20 5c4 4 4 10 0 14" /></svg>;
  if (name === "mute") return <svg {...shared}><path d="M4 9v6h4l5 4V5L8 9H4ZM17 9l5 6M22 9l-5 6" /></svg>;
  if (name === "target") return <svg {...shared}><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3" /><path d="M12 1v5M12 18v5M1 12h5M18 12h5" /></svg>;
  if (name === "move") return <svg {...shared}><path d="M12 2v20M2 12h20M12 2l-3 3m3-3 3 3M12 22l-3-3m3 3 3-3M2 12l3-3m-3 3 3 3M22 12l-3-3m3 3-3 3" /></svg>;
  if (name === "guard") return <svg {...shared}><path d="m12 2 8 3v6c0 5-3 9-8 11-5-2-8-6-8-11V5l8-3Z" /><path d="m8 12 3 3 5-6" /></svg>;
  if (name === "harvest") return <svg {...shared}><path d="M4 17c4-6 8-9 16-10M5 12l-2 5 5 1M11 8l-1 5 5 1M17 5l-1 5 5 1M4 21h16" /></svg>;
  if (name === "repair") return <svg {...shared}><path d="M14 5a5 5 0 0 0-6 6L3 16l5 5 5-5a5 5 0 0 0 6-6l-3 3-4-4 3-4Z" /></svg>;
  if (name === "menu") return <svg {...shared}><path d="M3 6h18M3 12h18M3 18h18" /></svg>;
  if (name === "info") return <svg {...shared}><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7h.01" /></svg>;
  return null;
}

export function HouseEmblem({ house, size = 29 }: { house: House; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" aria-hidden="true">
      {house === "atreides" && <><path d="M3 13 17 9l5 5 15-2-11 8-5 13-6-11L3 13Z" fill="currentColor" opacity=".88" /><path d="m17 9 4 11 16-8M15 22l6-2 5 0" stroke="#17282c" strokeWidth="2" /></>}
      {house === "harkonnen" && <><path d="m4 5 9 9 7-5 7 5 9-9-5 17-11 13L9 22 4 5Z" fill="currentColor" opacity=".9" /><path d="m13 14 7 7 7-7M14 25h12" stroke="#2a1c1b" strokeWidth="2" /></>}
      {house === "ordos" && <><path d="M20 3c9 0 15 7 15 16S28 35 20 37C11 35 5 28 5 19S11 3 20 3Z" stroke="currentColor" strokeWidth="3" /><path d="M7 20c8-9 19-9 26 0-8 9-18 9-26 0Z" fill="currentColor" /><path d="M20 14c4 3 4 9 0 12-4-3-4-9 0-12Z" fill="#1f2b22" /></>}
    </svg>
  );
}

export function BlueprintIcon({ type, isBuilding }: { type: BuildingType | UnitType; isBuilding: boolean }) {
  return (
    <svg viewBox="0 0 40 40" width="35" height="35" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      {isBuilding ? (
        type === "slab" ? <><path d="m5 14 15-8 15 8v17l-15 6L5 31V14Z" /><path d="m5 14 15 7 15-7M20 21v16M12 18v15M27 18v16" /></> :
        type === "windtrap" ? <><rect x="5" y="10" width="30" height="23" /><circle cx="14" cy="21" r="6" /><circle cx="27" cy="21" r="6" /><path d="M14 15v12m-6-6h12M27 15v12m-6-6h12M9 7h22" /></> :
        type === "refinery" ? <><path d="M4 32V14h17v18M21 32V11l5-4 5 4v21M31 32V14l5-3v21M4 32h32M8 19h9M8 24h9" /></> :
        type === "barracks" ? <><path d="M5 33V14L20 6l15 8v19H5ZM5 17h30M16 33V22h8v11M9 22h4m14 0h4" /></> :
        type === "factory" ? <><path d="M3 33V17l10-6 6 5 8-8 10 7v18H3ZM10 33V23h20v10M13 26h14M13 29h14" /></> :
        type === "turret" ? <><path d="M7 34V17h26v17H7ZM12 17V9h16v8M18 9V3h4v6M4 34h32M13 23h14v6H13z" /></> :
        <><path d="M5 32V13c0-5 11-5 11 0v19M21 32V13c0-5 14-5 14 0v19M3 32h34M5 13c0 5 11 5 11 0M21 13c0 5 14 5 14 0" /></>
      ) : (
        type === "infantry" ? <><circle cx="20" cy="9" r="5" /><path d="M14 33V19l6-5 6 5v14M11 38h18M11 23l-5 10m23-10 5 10M17 33l-2 5m8-5 2 5" /></> :
        type === "harvester" ? <><path d="M5 15h30v17H5V15ZM9 12h22v3M11 20h18v8H11zM2 20v10m36-10v10M4 35h32" /><path d="M15 20v8m6-8v8" /></> :
        type === "trike" || type === "raider" ? <><circle cx="8" cy="30" r="5" /><circle cx="32" cy="30" r="5" /><circle cx="20" cy="8" r="5" /><path d="m20 11-9 17h18L20 11ZM14 21h12" /></> :
        <><path d="M4 13h6v21H4zM30 13h6v21h-6zM10 15h20v17H10zM15 18h10v10H15zM18 3h4v16M13 34h14" />{type === "sonic" && <path d="M12 5v10m16-10v10" />}{type === "devastator" && <path d="M13 4h3v12M24 4h3v12" />}</>
      )}
    </svg>
  );
}