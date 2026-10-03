// 天气小图标（顶栏、侧栏用）
export function wxIcon(kind, isDay = true) {
  const cloud = '<path d="M7 17a4 4 0 0 1-.6-8 5.5 5.5 0 0 1 10.5 1.4A3.3 3.3 0 0 1 17 17z"/>';
  const body = {
    sun: isDay ? '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6"/>'
      : '<path d="M15 4a8 8 0 1 0 5 13.5A7 7 0 0 1 15 4z"/><path d="M6 5l.6 1.4L8 7l-1.4.6L6 9l-.6-1.4L4 7l1.4-.6z"/>',
    cloud,
    rain: cloud.replace('17z', '15z').replace('M7 17', 'M7 15') + '<path d="M8 18l-1 3M12 18l-1 3M16 18l-1 3"/>',
    thunder: cloud.replace('17z', '15z').replace('M7 17', 'M7 15') + '<path d="M12 15l-2 4h3l-2 4"/>',
    snow: cloud.replace('17z', '15z').replace('M7 17', 'M7 15') + '<path d="M8 18.5v2M7 19.5h2M12 19.5v2M11 20.5h2M16 18.5v2M15 19.5h2"/>',
    fog: '<path d="M3 8h13M6 12h15M3 16h12M8 20h10"/>',
    wind: '<path d="M3 9h11a3 3 0 1 0-3-3M3 14h15a3 3 0 1 1-3 3M3 19h7"/>'
  }[kind] || cloud;
  return `<svg class="wx-ic" viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`;
}
