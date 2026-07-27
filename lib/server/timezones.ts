/**
 * Country → default IANA time zone.
 *
 * Cancellation deadlines must render in the property's own time zone (§12.5).
 * The supplier returns deadline datetimes in property-local time without an
 * offset, so the zone has to come from the property's country. Countries that
 * span several zones fall back to their most common commercial zone; anything
 * unknown falls back to UTC and the UI keeps saying "hotel local time" rather
 * than implying a precision we do not have.
 */
const ZONES: Record<string, string> = {
  SA: "Asia/Riyadh",
  AE: "Asia/Dubai",
  QA: "Asia/Qatar",
  KW: "Asia/Kuwait",
  BH: "Asia/Bahrain",
  OM: "Asia/Muscat",
  JO: "Asia/Amman",
  EG: "Africa/Cairo",
  TR: "Europe/Istanbul",
  GB: "Europe/London",
  IE: "Europe/Dublin",
  PT: "Europe/Lisbon",
  ES: "Europe/Madrid",
  FR: "Europe/Paris",
  IT: "Europe/Rome",
  DE: "Europe/Berlin",
  NL: "Europe/Amsterdam",
  BE: "Europe/Brussels",
  CH: "Europe/Zurich",
  AT: "Europe/Vienna",
  GR: "Europe/Athens",
  PL: "Europe/Warsaw",
  CZ: "Europe/Prague",
  SE: "Europe/Stockholm",
  NO: "Europe/Oslo",
  DK: "Europe/Copenhagen",
  FI: "Europe/Helsinki",
  MA: "Africa/Casablanca",
  TN: "Africa/Tunis",
  ZA: "Africa/Johannesburg",
  KE: "Africa/Nairobi",
  IN: "Asia/Kolkata",
  PK: "Asia/Karachi",
  BD: "Asia/Dhaka",
  LK: "Asia/Colombo",
  MV: "Indian/Maldives",
  TH: "Asia/Bangkok",
  VN: "Asia/Ho_Chi_Minh",
  MY: "Asia/Kuala_Lumpur",
  SG: "Asia/Singapore",
  ID: "Asia/Jakarta",
  PH: "Asia/Manila",
  CN: "Asia/Shanghai",
  HK: "Asia/Hong_Kong",
  JP: "Asia/Tokyo",
  KR: "Asia/Seoul",
  AU: "Australia/Sydney",
  NZ: "Pacific/Auckland",
  US: "America/New_York",
  CA: "America/Toronto",
  MX: "America/Mexico_City",
  BR: "America/Sao_Paulo",
  AR: "America/Argentina/Buenos_Aires",
  CL: "America/Santiago",
  CO: "America/Bogota",
  PE: "America/Lima",
};

export function timezoneForCountry(countryCode: string | undefined): string {
  if (!countryCode) return "UTC";
  return ZONES[countryCode.toUpperCase()] ?? "UTC";
}

export function hasKnownTimezone(countryCode: string | undefined): boolean {
  return Boolean(countryCode && ZONES[countryCode.toUpperCase()]);
}
