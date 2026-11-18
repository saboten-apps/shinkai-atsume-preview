const paths = {
  vehicle: 'M3 14l2-7h14l2 7v5H3ZM3 14h18M6 19v2M18 19v2M7 16h.01M17 16h.01',
  back: 'M14 6l-6 6 6 6M8 12h12',
  menu: 'M4 6h16M4 12h16M4 18h16',
  close: 'M6 6l12 12M18 6L6 18',
  camera: 'M8 6l2-2h4l2 2h4v14H4V6h4M16 13a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
  pin: 'M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0ZM14 10a2 2 0 1 1-4 0 2 2 0 0 1 4 0',
  map: 'M3 5l6-2 6 2 6-2v16l-6 2-6-2-6 2ZM9 3v16M15 5v16',
  fly: 'M12 21V3M5 10l7-7 7 7M6 17l6-6 6 6',
  fish: 'M5 12C9 4 17 4 21 12c-4 8-12 8-16 0ZM5 12l-3-4v8ZM16 10h.01',
};
export type HudIconName = keyof typeof paths;
export function HudIcon({name}: {name:HudIconName}) {
  return <svg className="hud-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]}/></svg>;
}
