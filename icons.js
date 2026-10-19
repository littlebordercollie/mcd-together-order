const paths = {
  sound:
    '<path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
  back: '<path d="M19 12H5m6-6-6 6 6 6"/>',
  burger:
    '<path d="M3 10c0-10 18-10 18 0H3Zm0 7h18c0 5-18 5-18 0Zm0-3h18M8 6h.01M15 7h.01"/>',
  fries: '<path d="M5 10h14l-2 11H7L5 10ZM7 10V3h3v7m1 0V1h3v9m1 0V4h3v6"/>',
  cup: '<path d="M5 7h14l-2 14H7L5 7ZM4 7h16M12 7l2-5h5"/>',
  tray: '<path d="M2 17h20l-2 4H4l-2-4Zm2-3c0-10 16-10 16 0H4Zm8-11V1"/>',
  heart:
    '<path d="M20 5c-3-3-7-1-8 1-1-2-5-4-8-1-4 5 3 11 8 15 5-4 12-10 8-15Z"/>',
  person: '<circle cx="12" cy="7" r="4"/><path d="M4 22v-4a8 8 0 0 1 16 0v4"/>',
  location:
    '<path d="M20 9c0 6-8 13-8 13S4 15 4 9a8 8 0 1 1 16 0Z"/><circle cx="12" cy="9" r="2.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  repeat:
    '<path d="M20 8A9 9 0 0 0 4 6L2 9m0-6v6h6m-4 7a9 9 0 0 0 16 2l2-3m0 6v-6h-6"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  bag: '<path d="M4 7h16l1 15H3L4 7Zm4 0V5a4 4 0 0 1 8 0v2"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',
  home: '<path d="m2 10 10-8 10 8M5 8v14h14V8M9 22v-8h6v8"/>',
};
export const icon = (name, cls = "") =>
  `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.heart}</svg>`;
// Original companion: a little plate with a napkin. No school mascot or brand character.
export const buddy = (cls = "") =>
  `<svg class="buddy ${cls}" viewBox="0 0 180 150" aria-hidden="true"><path d="m31 91-18 18m135-18 18 13M60 126l-9 17m65-17 11 15" fill="none" stroke="#253a52" stroke-width="5" stroke-linecap="round"/><ellipse cx="90" cy="78" rx="66" ry="57" fill="#ffe395" stroke="#253a52" stroke-width="4"/><ellipse cx="90" cy="78" rx="50" ry="42" fill="#fffdf5" stroke="#253a52" stroke-width="2"/><circle cx="73" cy="76" r="4" fill="#253a52"/><circle cx="108" cy="76" r="4" fill="#253a52"/><path d="M80 91q10 10 20 0" fill="none" stroke="#253a52" stroke-width="3" stroke-linecap="round"/><path d="m126 25 19-15 12 31-25 4" fill="#a8c8df" stroke="#253a52" stroke-width="3"/><path d="m36 18 2-9m-12 17-8-3m27-3 8-6" stroke="#658f78" stroke-width="3" stroke-linecap="round"/></svg>`;
