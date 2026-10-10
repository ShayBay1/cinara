/**
 * When does the sun come up for this viewer? Used to pick Home's sky.
 *
 * Location comes from the phone's time zone, not GPS: no permission prompt for a background, and a
 * time zone's main city is close enough to put sunrise within a few minutes for most viewers.
 */

const RAD = Math.PI / 180;
const DAY = 86_400_000;

/** Main city of common time zones: [latitude, longitude]. */
const ZONES: Record<string, [number, number]> = {
  'America/Los_Angeles': [34.05, -118.24],
  'America/Vancouver': [49.28, -123.12],
  'America/Tijuana': [32.51, -117.04],
  'America/Phoenix': [33.45, -112.07],
  'America/Denver': [39.74, -104.99],
  'America/Edmonton': [53.55, -113.49],
  'America/Boise': [43.62, -116.2],
  'America/Chicago': [41.88, -87.63],
  'America/Winnipeg': [49.9, -97.14],
  'America/Mexico_City': [19.43, -99.13],
  'America/New_York': [40.71, -74.01],
  'America/Detroit': [42.33, -83.05],
  'America/Toronto': [43.65, -79.38],
  'America/Indiana/Indianapolis': [39.77, -86.16],
  'America/Kentucky/Louisville': [38.25, -85.76],
  'America/Halifax': [44.65, -63.58],
  'America/St_Johns': [47.56, -52.71],
  'America/Anchorage': [61.22, -149.9],
  'America/Puerto_Rico': [18.47, -66.11],
  'America/Bogota': [4.71, -74.07],
  'America/Lima': [-12.05, -77.04],
  'America/Caracas': [10.48, -66.9],
  'America/Santiago': [-33.45, -70.67],
  'America/Argentina/Buenos_Aires': [-34.6, -58.38],
  'America/Sao_Paulo': [-23.55, -46.63],
  'Pacific/Honolulu': [21.31, -157.86],
  'Pacific/Auckland': [-36.85, 174.76],
  'Europe/London': [51.51, -0.13],
  'Europe/Dublin': [53.35, -6.26],
  'Europe/Lisbon': [38.72, -9.14],
  'Europe/Madrid': [40.42, -3.7],
  'Europe/Paris': [48.86, 2.35],
  'Europe/Brussels': [50.85, 4.35],
  'Europe/Amsterdam': [52.37, 4.9],
  'Europe/Berlin': [52.52, 13.4],
  'Europe/Zurich': [47.38, 8.54],
  'Europe/Rome': [41.9, 12.5],
  'Europe/Vienna': [48.21, 16.37],
  'Europe/Prague': [50.08, 14.44],
  'Europe/Warsaw': [52.23, 21.01],
  'Europe/Stockholm': [59.33, 18.07],
  'Europe/Oslo': [59.91, 10.75],
  'Europe/Copenhagen': [55.68, 12.57],
  'Europe/Helsinki': [60.17, 24.94],
  'Europe/Athens': [37.98, 23.73],
  'Europe/Istanbul': [41.01, 28.98],
  'Europe/Kyiv': [50.45, 30.52],
  'Europe/Moscow': [55.76, 37.62],
  'Africa/Lagos': [6.52, 3.38],
  'Africa/Accra': [5.6, -0.19],
  'Africa/Cairo': [30.04, 31.24],
  'Africa/Nairobi': [-1.29, 36.82],
  'Africa/Johannesburg': [-26.2, 28.05],
  'Africa/Casablanca': [33.57, -7.59],
  'Asia/Dubai': [25.2, 55.27],
  'Asia/Riyadh': [24.71, 46.68],
  'Asia/Jerusalem': [31.77, 35.21],
  'Asia/Karachi': [24.86, 67.0],
  'Asia/Kolkata': [19.08, 72.88],
  'Asia/Dhaka': [23.81, 90.41],
  'Asia/Bangkok': [13.76, 100.5],
  'Asia/Jakarta': [-6.21, 106.85],
  'Asia/Ho_Chi_Minh': [10.82, 106.63],
  'Asia/Singapore': [1.35, 103.82],
  'Asia/Kuala_Lumpur': [3.14, 101.69],
  'Asia/Manila': [14.6, 120.98],
  'Asia/Hong_Kong': [22.32, 114.17],
  'Asia/Shanghai': [31.23, 121.47],
  'Asia/Taipei': [25.03, 121.57],
  'Asia/Seoul': [37.57, 126.98],
  'Asia/Tokyo': [35.68, 139.69],
  'Australia/Perth': [-31.95, 115.86],
  'Australia/Adelaide': [-34.93, 138.6],
  'Australia/Brisbane': [-27.47, 153.03],
  'Australia/Sydney': [-33.87, 151.21],
  'Australia/Melbourne': [-37.81, 144.96],
};

function timeZone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return undefined;
  }
}

/** Roughly where the viewer is, from the phone's time zone. */
export function guessLocation(now: Date, zone = timeZone()): { lat: number; lon: number } {
  const known = zone ? ZONES[zone] : undefined;
  if (known) return { lat: known[0], lon: known[1] };
  // Unknown zone: 15 degrees of longitude per hour of offset, mid-northern latitude.
  return { lat: 35, lon: -now.getTimezoneOffset() / 4 };
}

/**
 * Sunrise on the viewer's local calendar day of `now` (standard almanac algorithm, accurate to a
 * minute or two). Null when the sun doesn't rise that day (polar night or midnight sun).
 */
export function sunrise(now: Date, lat: number, lon: number): Date | null {
  const midnight = new Date(now);
  midnight.setHours(0, 0, 0, 0);
  const start = new Date(midnight.getFullYear(), 0, 0);
  const n = Math.round((midnight.getTime() - start.getTime()) / DAY);

  const lngHour = lon / 15;
  const t = n + (6 - lngHour) / 24;
  const m = 0.9856 * t - 3.289;
  const l = mod(m + 1.916 * Math.sin(m * RAD) + 0.02 * Math.sin(2 * m * RAD) + 282.634, 360);
  let ra = mod(Math.atan(0.91764 * Math.tan(l * RAD)) / RAD, 360);
  ra = (ra + Math.floor(l / 90) * 90 - Math.floor(ra / 90) * 90) / 15;
  const sinDec = 0.39782 * Math.sin(l * RAD);
  const cosDec = Math.cos(Math.asin(sinDec));
  const cosH =
    (Math.cos(90.833 * RAD) - sinDec * Math.sin(lat * RAD)) / (cosDec * Math.cos(lat * RAD));
  if (cosH > 1 || cosH < -1) return null;
  const h = (360 - Math.acos(cosH) / RAD) / 15;
  const ut = mod(h + ra - 0.06571 * t - 6.622 - lngHour, 24);

  // `ut` is a time of day in UTC; put it on the right side of the viewer's local midnight.
  const utcDay = Date.UTC(midnight.getFullYear(), midnight.getMonth(), midnight.getDate());
  let at = utcDay + ut * 3_600_000;
  while (at < midnight.getTime()) at += DAY;
  while (at >= midnight.getTime() + DAY) at -= DAY;
  return new Date(at);
}

export type HomeSky = 'dawn' | 'day';

/** The dunes sky starts at this local hour and holds until sunrise. */
export const DAWN_STARTS_AT = 3;

/** Dunes at Dusk from 3am until sunrise, Golden Hour the rest of the day. */
export function homeSky(now: Date, where = guessLocation(now)): HomeSky {
  if (now.getHours() < DAWN_STARTS_AT) return 'day';
  const rise = sunrise(now, where.lat, where.lon);
  // No sunrise today (far north or south): give dawn until 6:30.
  const end = rise ?? new Date(new Date(now).setHours(6, 30, 0, 0));
  return now < end ? 'dawn' : 'day';
}

function mod(v: number, n: number) {
  return ((v % n) + n) % n;
}
