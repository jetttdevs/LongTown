// longtown's own icon set: rounded 24px line icons with a soft duotone fill.
// They take their colour from CSS (currentColor), so one set works everywhere.
const F = 'fill="currentColor" fill-opacity=".22"';

const PATHS = {
  // the logo: a lamppost with a warm lamp
  lamp: `<path d="M12 22V10" /><path d="M8.5 22h7" /><path d="M9 6.5 12 3l3 3.5v2.5a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1z" ${F}/><path d="M12 13.5h3.5" /><circle cx="12" cy="7.6" r="1.1" fill="currentColor" stroke="none"/>`,
  // channels
  inn: `<path d="M3.5 11 12 4l8.5 7" /><path d="M5.5 9.5V20h13V9.5" ${F}/><path d="M10 20v-5a2 2 0 0 1 4 0v5" /><path d="M16.5 12.5h.01" stroke-width="2.6"/><path d="M7.5 12.5h.01" stroke-width="2.6"/>`,
  fountain: `<path d="M4 15h16l-1.5 4.2a1.2 1.2 0 0 1-1.1.8H6.6a1.2 1.2 0 0 1-1.1-.8z" ${F}/><path d="M12 15V8" /><path d="M8.5 11h7" /><path d="M12 8c0-2.5-2-4-4-3.5M12 8c0-2.5 2-4 4-3.5" /><path d="M6 8.5v1.5M18 8.5v1.5" />`,
  schoolhouse: `<path d="M12 6.5C10 5 7 4.5 3.5 5v13c3.5-.5 6.5 0 8.5 1.5 2-1.5 5-2 8.5-1.5V5C17 4.5 14 5 12 6.5z" ${F}/><path d="M12 6.5v13" />`,
  noticeboard: `<rect x="3.5" y="4.5" width="17" height="12" rx="2" ${F}/><path d="M7 20l2-3.5M17 20l-2-3.5" /><path d="M7.5 8.5h5M7.5 12h8" /><circle cx="16.5" cy="8.5" r="1.3" fill="currentColor" stroke="none"/>`,
  workshop: `<path d="M14.5 5.5a4 4 0 0 0-5 5L4 16a2.1 2.1 0 0 0 3 3l5.5-5.5a4 4 0 0 0 5-5l-2.5 2.5-2.5-.5-.5-2.5z" ${F}/>`,
  market: `<path d="M4 9h16l-1.5-4.5h-13z" ${F}/><path d="M4 9v1.5a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0 2.7 2.7 0 0 0 5.3 0V9" /><path d="M5.5 12.5V20h13v-7.5" /><path d="M10 20v-4h4v4" />`,
  lantern: `<path d="M9 3.5h6M12 3.5v2" /><path d="M8 7.5c0-1.1.9-2 2-2h4a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2z" ${F}/><path d="M12 10c1.2 1.2 1.2 3 0 4.2-1.2-1.2-1.2-3 0-4.2z" fill="currentColor" stroke="none"/><path d="M10 20.5h4" />`,
  channel: `<path d="M4.5 5.5h15v10h-9l-4 3.5v-3.5h-2z" ${F}/><path d="M8.5 10.5h.01M12 10.5h.01M15.5 10.5h.01" stroke-width="2.6"/>`,
  // pages
  map: `<path d="M3.5 6.5 9 4.5l6 2 5.5-2v13l-5.5 2-6-2-5.5 2z" ${F}/><path d="M9 4.5v13M15 6.5v13" />`,
  roster: `<circle cx="8.5" cy="9" r="3" ${F}/><circle cx="16" cy="10" r="2.5" /><path d="M3.5 19c.5-3 2.5-4.5 5-4.5s4.5 1.5 5 4.5" /><path d="M14 15c2.5-.5 5 .8 5.5 4" />`,
  podium: `<path d="M9 20V9h6v11" ${F}/><path d="M3.5 20v-6H9M15 12h5.5v8M2.5 20h19" /><path d="M12 4.5l.8 1.6 1.7.2-1.2 1.2.3 1.7-1.6-.8-1.6.8.3-1.7-1.2-1.2 1.7-.2z" fill="currentColor" stroke-width="1"/>`,
  scroll: `<path d="M7 4.5h10.5a2 2 0 0 1 2 2V8h-3" /><path d="M16.5 6.5V17.5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V16h10.5" ${F}/><path d="M7 4.5a2 2 0 0 0-2 2V16M8.5 9h5M8.5 12.5h5" />`,
  search: `<circle cx="11" cy="11" r="6.5" ${F}/><path d="m20 20-4.2-4.2" />`,
  // ideas
  key: `<circle cx="8" cy="15" r="4" ${F}/><path d="m11 12 8.5-8.5M16.5 6.5l2 2M14 9l1.5 1.5" />`,
  chat: `<path d="M4 5.5h11v8H9l-3.5 3v-3H4z" ${F}/><path d="M18 9.5h2v8h-1.5v2.5L15.5 17.5H11v-2" />`,
  visitor: `<circle cx="12" cy="7.5" r="3.5" ${F}/><path d="M5.5 20c.6-3.8 3.1-6 6.5-6s5.9 2.2 6.5 6" />`,
  hat: `<path d="M8 15V6a1.5 1.5 0 0 1 1.5-1.5h5A1.5 1.5 0 0 1 16 6v9" ${F}/><path d="M8 11.5h8" /><path d="M4 15h16l-1.5 3h-13z" />`,
  coin: `<ellipse cx="12" cy="7" rx="7" ry="3" ${F}/><path d="M5 7v5c0 1.7 3.1 3 7 3s7-1.3 7-3V7" /><path d="M5 12v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5" />`,
  lock: `<rect x="5" y="10.5" width="14" height="10" rx="2.5" ${F}/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" /><path d="M12 14.5v2" />`,
  pulse: `<path d="M3 12h4l2.5-6 5 12 2.5-6h4" />`,
  sparkle: `<path d="M12 3.5c.6 4.2 2.3 5.9 6.5 6.5-4.2.6-5.9 2.3-6.5 6.5-.6-4.2-2.3-5.9-6.5-6.5 4.2-.6 5.9-2.3 6.5-6.5z" ${F}/><path d="M18.5 16v4M16.5 18h4" />`,
  arrow: `<path d="M5 12h14M13 6l6 6-6 6" />`,
};

export const CHANNEL_ICONS = {
  inn: 'inn', fountain: 'fountain', schoolhouse: 'schoolhouse', noticeboard: 'noticeboard',
  workshop: 'workshop', market: 'market', lamplighters: 'lantern',
};

export function icon(name, cls = '') {
  const d = PATHS[name] || PATHS.channel;
  return `<svg class="ico${cls ? ' ' + cls : ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
}

export const channelIcon = (slug, cls = '') => icon(CHANNEL_ICONS[slug] || 'channel', cls);

// the wordmark's mark: a lime tile with the lamppost
export const LOGO = `<svg class="logo-mark" viewBox="0 0 48 48" aria-hidden="true"><rect x="2" y="2" width="44" height="44" rx="14" fill="#a8e063"/><circle cx="24" cy="17" r="9" fill="#ffd166" opacity=".55"/><g fill="none" stroke="#0a1f17" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M24 40V21"/><path d="M17 40h14"/><path d="M18.5 12 24 6l5.5 6v4.5a1.5 1.5 0 0 1-1.5 1.5h-8a1.5 1.5 0 0 1-1.5-1.5z" fill="#ffd166"/><path d="M24 27h6"/></g><circle cx="24" cy="14" r="2" fill="#0a1f17"/></svg>`;
