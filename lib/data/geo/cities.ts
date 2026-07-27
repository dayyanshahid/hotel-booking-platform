import { getCountry, type Country, type Region } from "./countries";

/**
 * Cities the platform can be searched in.
 *
 * Adding a destination is adding a row here — a slug, a name, a point and a
 * time zone. Nothing about a city requires an editor to write about it first,
 * which is the difference between a catalogue that covers one market and one
 * that covers the world.
 *
 * `tier` is editorial prominence, not importance: 1 appears on the home page,
 * 2 on its region's page, 3 is reachable by search and from its country page.
 */

export interface City {
  slug: string;
  name: string;
  /** Arabic exonym where one is in common use; falls back to `name`. */
  nameAr?: string;
  countryCode: string;
  coordinates: { lat: number; lng: number };
  /** IANA zone — every deadline in the product is shown in the hotel's own time. */
  timezone: string;
  tier: 1 | 2 | 3;
}

export const CITIES: City[] = [
  { slug: "riyadh", name: "Riyadh", nameAr: "الرياض", countryCode: "SA", coordinates: { lat: 24.7136, lng: 46.6753 }, timezone: "Asia/Riyadh", tier: 2 },
  { slug: "jeddah", name: "Jeddah", nameAr: "جدة", countryCode: "SA", coordinates: { lat: 21.4858, lng: 39.1925 }, timezone: "Asia/Riyadh", tier: 2 },
  { slug: "makkah", name: "Makkah", nameAr: "مكة المكرمة", countryCode: "SA", coordinates: { lat: 21.3891, lng: 39.8579 }, timezone: "Asia/Riyadh", tier: 1 },
  { slug: "madinah", name: "Madinah", nameAr: "المدينة المنورة", countryCode: "SA", coordinates: { lat: 24.5247, lng: 39.5692 }, timezone: "Asia/Riyadh", tier: 2 },
  { slug: "alula", name: "AlUla", nameAr: "العُلا", countryCode: "SA", coordinates: { lat: 26.6084, lng: 37.9216 }, timezone: "Asia/Riyadh", tier: 3 },
  { slug: "dammam", name: "Dammam", nameAr: "الدمام", countryCode: "SA", coordinates: { lat: 26.4207, lng: 50.0888 }, timezone: "Asia/Riyadh", tier: 3 },
  { slug: "abha", name: "Abha", nameAr: "أبها", countryCode: "SA", coordinates: { lat: 18.2164, lng: 42.5053 }, timezone: "Asia/Riyadh", tier: 3 },
  { slug: "dubai", name: "Dubai", nameAr: "دبي", countryCode: "AE", coordinates: { lat: 25.2048, lng: 55.2708 }, timezone: "Asia/Dubai", tier: 1 },
  { slug: "abu-dhabi", name: "Abu Dhabi", nameAr: "أبوظبي", countryCode: "AE", coordinates: { lat: 24.4539, lng: 54.3773 }, timezone: "Asia/Dubai", tier: 2 },
  { slug: "sharjah", name: "Sharjah", nameAr: "الشارقة", countryCode: "AE", coordinates: { lat: 25.3463, lng: 55.4209 }, timezone: "Asia/Dubai", tier: 3 },
  { slug: "ras-al-khaimah", name: "Ras Al Khaimah", nameAr: "رأس الخيمة", countryCode: "AE", coordinates: { lat: 25.7895, lng: 55.9432 }, timezone: "Asia/Dubai", tier: 3 },
  { slug: "doha", name: "Doha", nameAr: "الدوحة", countryCode: "QA", coordinates: { lat: 25.2854, lng: 51.5310 }, timezone: "Asia/Qatar", tier: 2 },
  { slug: "kuwait-city", name: "Kuwait City", nameAr: "مدينة الكويت", countryCode: "KW", coordinates: { lat: 29.3759, lng: 47.9774 }, timezone: "Asia/Kuwait", tier: 3 },
  { slug: "manama", name: "Manama", nameAr: "المنامة", countryCode: "BH", coordinates: { lat: 26.2285, lng: 50.5860 }, timezone: "Asia/Bahrain", tier: 3 },
  { slug: "muscat", name: "Muscat", nameAr: "مسقط", countryCode: "OM", coordinates: { lat: 23.5880, lng: 58.3829 }, timezone: "Asia/Muscat", tier: 3 },
  { slug: "salalah", name: "Salalah", nameAr: "صلالة", countryCode: "OM", coordinates: { lat: 17.0151, lng: 54.0924 }, timezone: "Asia/Muscat", tier: 3 },
  { slug: "amman", name: "Amman", nameAr: "عمّان", countryCode: "JO", coordinates: { lat: 31.9539, lng: 35.9106 }, timezone: "Asia/Amman", tier: 3 },
  { slug: "petra", name: "Petra", nameAr: "البتراء", countryCode: "JO", coordinates: { lat: 30.3285, lng: 35.4444 }, timezone: "Asia/Amman", tier: 3 },
  { slug: "beirut", name: "Beirut", nameAr: "بيروت", countryCode: "LB", coordinates: { lat: 33.8938, lng: 35.5018 }, timezone: "Asia/Beirut", tier: 3 },
  { slug: "tel-aviv", name: "Tel Aviv", nameAr: "تل أبيب", countryCode: "IL", coordinates: { lat: 32.0853, lng: 34.7818 }, timezone: "Asia/Jerusalem", tier: 3 },
  { slug: "istanbul", name: "Istanbul", nameAr: "إسطنبول", countryCode: "TR", coordinates: { lat: 41.0082, lng: 28.9784 }, timezone: "Europe/Istanbul", tier: 1 },
  { slug: "antalya", name: "Antalya", nameAr: "أنطاليا", countryCode: "TR", coordinates: { lat: 36.8969, lng: 30.7133 }, timezone: "Europe/Istanbul", tier: 2 },
  { slug: "cappadocia", name: "Cappadocia", nameAr: "كابادوكيا", countryCode: "TR", coordinates: { lat: 38.6431, lng: 34.8289 }, timezone: "Europe/Istanbul", tier: 2 },
  { slug: "bodrum", name: "Bodrum", nameAr: "بودروم", countryCode: "TR", coordinates: { lat: 37.0344, lng: 27.4305 }, timezone: "Europe/Istanbul", tier: 3 },
  { slug: "izmir", name: "Izmir", nameAr: "إزمير", countryCode: "TR", coordinates: { lat: 38.4237, lng: 27.1428 }, timezone: "Europe/Istanbul", tier: 3 },
  { slug: "ankara", name: "Ankara", nameAr: "أنقرة", countryCode: "TR", coordinates: { lat: 39.9334, lng: 32.8597 }, timezone: "Europe/Istanbul", tier: 3 },
  { slug: "trabzon", name: "Trabzon", nameAr: "طرابزون", countryCode: "TR", coordinates: { lat: 41.0027, lng: 39.7168 }, timezone: "Europe/Istanbul", tier: 3 },
  { slug: "cairo", name: "Cairo", nameAr: "القاهرة", countryCode: "EG", coordinates: { lat: 30.0444, lng: 31.2357 }, timezone: "Africa/Cairo", tier: 2 },
  { slug: "sharm-el-sheikh", name: "Sharm El Sheikh", nameAr: "شرم الشيخ", countryCode: "EG", coordinates: { lat: 27.9158, lng: 34.3300 }, timezone: "Africa/Cairo", tier: 2 },
  { slug: "hurghada", name: "Hurghada", nameAr: "الغردقة", countryCode: "EG", coordinates: { lat: 27.2579, lng: 33.8116 }, timezone: "Africa/Cairo", tier: 2 },
  { slug: "luxor", name: "Luxor", nameAr: "الأقصر", countryCode: "EG", coordinates: { lat: 25.6872, lng: 32.6396 }, timezone: "Africa/Cairo", tier: 3 },
  { slug: "marrakech", name: "Marrakech", nameAr: "مراكش", countryCode: "MA", coordinates: { lat: 31.6295, lng: -7.9811 }, timezone: "Africa/Casablanca", tier: 2 },
  { slug: "casablanca", name: "Casablanca", nameAr: "الدار البيضاء", countryCode: "MA", coordinates: { lat: 33.5731, lng: -7.5898 }, timezone: "Africa/Casablanca", tier: 3 },
  { slug: "fes", name: "Fes", nameAr: "فاس", countryCode: "MA", coordinates: { lat: 34.0181, lng: -5.0078 }, timezone: "Africa/Casablanca", tier: 3 },
  { slug: "tangier", name: "Tangier", nameAr: "طنجة", countryCode: "MA", coordinates: { lat: 35.7595, lng: -5.8340 }, timezone: "Africa/Casablanca", tier: 3 },
  { slug: "tunis", name: "Tunis", nameAr: "تونس", countryCode: "TN", coordinates: { lat: 36.8065, lng: 10.1815 }, timezone: "Africa/Tunis", tier: 3 },
  { slug: "cape-town", name: "Cape Town", nameAr: "كيب تاون", countryCode: "ZA", coordinates: { lat: -33.9249, lng: 18.4241 }, timezone: "Africa/Johannesburg", tier: 2 },
  { slug: "johannesburg", name: "Johannesburg", nameAr: "جوهانسبرغ", countryCode: "ZA", coordinates: { lat: -26.2041, lng: 28.0473 }, timezone: "Africa/Johannesburg", tier: 3 },
  { slug: "nairobi", name: "Nairobi", nameAr: "نيروبي", countryCode: "KE", coordinates: { lat: -1.2864, lng: 36.8172 }, timezone: "Africa/Nairobi", tier: 3 },
  { slug: "zanzibar", name: "Zanzibar", nameAr: "زنجبار", countryCode: "TZ", coordinates: { lat: -6.1659, lng: 39.2026 }, timezone: "Africa/Dar_es_Salaam", tier: 3 },
  { slug: "lagos", name: "Lagos", nameAr: "لاغوس", countryCode: "NG", coordinates: { lat: 6.5244, lng: 3.3792 }, timezone: "Africa/Lagos", tier: 3 },
  { slug: "accra", name: "Accra", nameAr: "أكرا", countryCode: "GH", coordinates: { lat: 5.6037, lng: -0.1870 }, timezone: "Africa/Accra", tier: 3 },
  { slug: "addis-ababa", name: "Addis Ababa", nameAr: "أديس أبابا", countryCode: "ET", coordinates: { lat: 9.0320, lng: 38.7469 }, timezone: "Africa/Addis_Ababa", tier: 3 },
  { slug: "port-louis", name: "Port Louis", nameAr: "بورت لويس", countryCode: "MU", coordinates: { lat: -20.1609, lng: 57.5012 }, timezone: "Indian/Mauritius", tier: 3 },
  { slug: "mahe", name: "Mahé", nameAr: "ماهي", countryCode: "SC", coordinates: { lat: -4.6796, lng: 55.4920 }, timezone: "Indian/Mahe", tier: 3 },
  { slug: "london", name: "London", nameAr: "لندن", countryCode: "GB", coordinates: { lat: 51.5072, lng: -0.1276 }, timezone: "Europe/London", tier: 1 },
  { slug: "edinburgh", name: "Edinburgh", nameAr: "إدنبرة", countryCode: "GB", coordinates: { lat: 55.9533, lng: -3.1883 }, timezone: "Europe/London", tier: 3 },
  { slug: "manchester", name: "Manchester", nameAr: "مانشستر", countryCode: "GB", coordinates: { lat: 53.4808, lng: -2.2426 }, timezone: "Europe/London", tier: 3 },
  { slug: "dublin", name: "Dublin", nameAr: "دبلن", countryCode: "IE", coordinates: { lat: 53.3498, lng: -6.2603 }, timezone: "Europe/Dublin", tier: 3 },
  { slug: "paris", name: "Paris", nameAr: "باريس", countryCode: "FR", coordinates: { lat: 48.8566, lng: 2.3522 }, timezone: "Europe/Paris", tier: 1 },
  { slug: "nice", name: "Nice", nameAr: "نيس", countryCode: "FR", coordinates: { lat: 43.7102, lng: 7.2620 }, timezone: "Europe/Paris", tier: 3 },
  { slug: "lyon", name: "Lyon", nameAr: "ليون", countryCode: "FR", coordinates: { lat: 45.7640, lng: 4.8357 }, timezone: "Europe/Paris", tier: 3 },
  { slug: "marseille", name: "Marseille", nameAr: "مرسيليا", countryCode: "FR", coordinates: { lat: 43.2965, lng: 5.3698 }, timezone: "Europe/Paris", tier: 3 },
  { slug: "barcelona", name: "Barcelona", nameAr: "برشلونة", countryCode: "ES", coordinates: { lat: 41.3874, lng: 2.1686 }, timezone: "Europe/Madrid", tier: 1 },
  { slug: "madrid", name: "Madrid", nameAr: "مدريد", countryCode: "ES", coordinates: { lat: 40.4168, lng: -3.7038 }, timezone: "Europe/Madrid", tier: 2 },
  { slug: "seville", name: "Seville", nameAr: "إشبيلية", countryCode: "ES", coordinates: { lat: 37.3891, lng: -5.9845 }, timezone: "Europe/Madrid", tier: 3 },
  { slug: "palma", name: "Palma de Mallorca", nameAr: "بالما", countryCode: "ES", coordinates: { lat: 39.5696, lng: 2.6502 }, timezone: "Europe/Madrid", tier: 3 },
  { slug: "malaga", name: "Málaga", nameAr: "مالقة", countryCode: "ES", coordinates: { lat: 36.7213, lng: -4.4214 }, timezone: "Europe/Madrid", tier: 3 },
  { slug: "lisbon", name: "Lisbon", nameAr: "لشبونة", countryCode: "PT", coordinates: { lat: 38.7223, lng: -9.1393 }, timezone: "Europe/Lisbon", tier: 2 },
  { slug: "porto", name: "Porto", nameAr: "بورتو", countryCode: "PT", coordinates: { lat: 41.1579, lng: -8.6291 }, timezone: "Europe/Lisbon", tier: 3 },
  { slug: "funchal", name: "Funchal", nameAr: "فونشال", countryCode: "PT", coordinates: { lat: 32.6669, lng: -16.9241 }, timezone: "Atlantic/Madeira", tier: 3 },
  { slug: "rome", name: "Rome", nameAr: "روما", countryCode: "IT", coordinates: { lat: 41.9028, lng: 12.4964 }, timezone: "Europe/Rome", tier: 1 },
  { slug: "milan", name: "Milan", nameAr: "ميلانو", countryCode: "IT", coordinates: { lat: 45.4642, lng: 9.1900 }, timezone: "Europe/Rome", tier: 2 },
  { slug: "venice", name: "Venice", nameAr: "البندقية", countryCode: "IT", coordinates: { lat: 45.4408, lng: 12.3155 }, timezone: "Europe/Rome", tier: 2 },
  { slug: "florence", name: "Florence", nameAr: "فلورنسا", countryCode: "IT", coordinates: { lat: 43.7696, lng: 11.2558 }, timezone: "Europe/Rome", tier: 2 },
  { slug: "naples", name: "Naples", nameAr: "نابولي", countryCode: "IT", coordinates: { lat: 40.8518, lng: 14.2681 }, timezone: "Europe/Rome", tier: 3 },
  { slug: "berlin", name: "Berlin", nameAr: "برلين", countryCode: "DE", coordinates: { lat: 52.5200, lng: 13.4050 }, timezone: "Europe/Berlin", tier: 2 },
  { slug: "munich", name: "Munich", nameAr: "ميونخ", countryCode: "DE", coordinates: { lat: 48.1351, lng: 11.5820 }, timezone: "Europe/Berlin", tier: 2 },
  { slug: "frankfurt", name: "Frankfurt", nameAr: "فرانكفورت", countryCode: "DE", coordinates: { lat: 50.1109, lng: 8.6821 }, timezone: "Europe/Berlin", tier: 3 },
  { slug: "hamburg", name: "Hamburg", nameAr: "هامبورغ", countryCode: "DE", coordinates: { lat: 53.5511, lng: 9.9937 }, timezone: "Europe/Berlin", tier: 3 },
  { slug: "amsterdam", name: "Amsterdam", nameAr: "أمستردام", countryCode: "NL", coordinates: { lat: 52.3676, lng: 4.9041 }, timezone: "Europe/Amsterdam", tier: 1 },
  { slug: "brussels", name: "Brussels", nameAr: "بروكسل", countryCode: "BE", coordinates: { lat: 50.8476, lng: 4.3572 }, timezone: "Europe/Brussels", tier: 3 },
  { slug: "vienna", name: "Vienna", nameAr: "فيينا", countryCode: "AT", coordinates: { lat: 48.2082, lng: 16.3738 }, timezone: "Europe/Vienna", tier: 2 },
  { slug: "salzburg", name: "Salzburg", nameAr: "سالزبورغ", countryCode: "AT", coordinates: { lat: 47.8095, lng: 13.0550 }, timezone: "Europe/Vienna", tier: 3 },
  { slug: "zurich", name: "Zurich", nameAr: "زيورخ", countryCode: "CH", coordinates: { lat: 47.3769, lng: 8.5417 }, timezone: "Europe/Zurich", tier: 3 },
  { slug: "geneva", name: "Geneva", nameAr: "جنيف", countryCode: "CH", coordinates: { lat: 46.2044, lng: 6.1432 }, timezone: "Europe/Zurich", tier: 3 },
  { slug: "interlaken", name: "Interlaken", nameAr: "إنترلاكن", countryCode: "CH", coordinates: { lat: 46.6863, lng: 7.8632 }, timezone: "Europe/Zurich", tier: 3 },
  { slug: "athens", name: "Athens", nameAr: "أثينا", countryCode: "GR", coordinates: { lat: 37.9838, lng: 23.7275 }, timezone: "Europe/Athens", tier: 2 },
  { slug: "santorini", name: "Santorini", nameAr: "سانتوريني", countryCode: "GR", coordinates: { lat: 36.3932, lng: 25.4615 }, timezone: "Europe/Athens", tier: 2 },
  { slug: "mykonos", name: "Mykonos", nameAr: "ميكونوس", countryCode: "GR", coordinates: { lat: 37.4467, lng: 25.3289 }, timezone: "Europe/Athens", tier: 3 },
  { slug: "crete", name: "Crete", nameAr: "كريت", countryCode: "GR", coordinates: { lat: 35.2401, lng: 24.8093 }, timezone: "Europe/Athens", tier: 3 },
  { slug: "dubrovnik", name: "Dubrovnik", nameAr: "دوبروفنيك", countryCode: "HR", coordinates: { lat: 42.6507, lng: 18.0944 }, timezone: "Europe/Zagreb", tier: 3 },
  { slug: "split", name: "Split", nameAr: "سبليت", countryCode: "HR", coordinates: { lat: 43.5081, lng: 16.4402 }, timezone: "Europe/Zagreb", tier: 3 },
  { slug: "prague", name: "Prague", nameAr: "براغ", countryCode: "CZ", coordinates: { lat: 50.0755, lng: 14.4378 }, timezone: "Europe/Prague", tier: 2 },
  { slug: "warsaw", name: "Warsaw", nameAr: "وارسو", countryCode: "PL", coordinates: { lat: 52.2297, lng: 21.0122 }, timezone: "Europe/Warsaw", tier: 3 },
  { slug: "krakow", name: "Kraków", nameAr: "كراكوف", countryCode: "PL", coordinates: { lat: 50.0647, lng: 19.9450 }, timezone: "Europe/Warsaw", tier: 3 },
  { slug: "budapest", name: "Budapest", nameAr: "بودابست", countryCode: "HU", coordinates: { lat: 47.4979, lng: 19.0402 }, timezone: "Europe/Budapest", tier: 2 },
  { slug: "bucharest", name: "Bucharest", nameAr: "بوخارست", countryCode: "RO", coordinates: { lat: 44.4268, lng: 26.1025 }, timezone: "Europe/Bucharest", tier: 3 },
  { slug: "stockholm", name: "Stockholm", nameAr: "ستوكهولم", countryCode: "SE", coordinates: { lat: 59.3293, lng: 18.0686 }, timezone: "Europe/Stockholm", tier: 3 },
  { slug: "oslo", name: "Oslo", nameAr: "أوسلو", countryCode: "NO", coordinates: { lat: 59.9139, lng: 10.7522 }, timezone: "Europe/Oslo", tier: 3 },
  { slug: "copenhagen", name: "Copenhagen", nameAr: "كوبنهاغن", countryCode: "DK", coordinates: { lat: 55.6761, lng: 12.5683 }, timezone: "Europe/Copenhagen", tier: 3 },
  { slug: "helsinki", name: "Helsinki", nameAr: "هلسنكي", countryCode: "FI", coordinates: { lat: 60.1699, lng: 24.9384 }, timezone: "Europe/Helsinki", tier: 3 },
  { slug: "reykjavik", name: "Reykjavík", nameAr: "ريكيافيك", countryCode: "IS", coordinates: { lat: 64.1466, lng: -21.9426 }, timezone: "Atlantic/Reykjavik", tier: 3 },
  { slug: "moscow", name: "Moscow", nameAr: "موسكو", countryCode: "RU", coordinates: { lat: 55.7558, lng: 37.6173 }, timezone: "Europe/Moscow", tier: 3 },
  { slug: "saint-petersburg", name: "Saint Petersburg", nameAr: "سانت بطرسبرغ", countryCode: "RU", coordinates: { lat: 59.9311, lng: 30.3609 }, timezone: "Europe/Moscow", tier: 3 },
  { slug: "new-york", name: "New York", nameAr: "نيويورك", countryCode: "US", coordinates: { lat: 40.7128, lng: -74.0060 }, timezone: "America/New_York", tier: 1 },
  { slug: "los-angeles", name: "Los Angeles", nameAr: "لوس أنجلوس", countryCode: "US", coordinates: { lat: 34.0522, lng: -118.2437 }, timezone: "America/Los_Angeles", tier: 2 },
  { slug: "las-vegas", name: "Las Vegas", nameAr: "لاس فيغاس", countryCode: "US", coordinates: { lat: 36.1699, lng: -115.1398 }, timezone: "America/Los_Angeles", tier: 2 },
  { slug: "miami", name: "Miami", nameAr: "ميامي", countryCode: "US", coordinates: { lat: 25.7617, lng: -80.1918 }, timezone: "America/New_York", tier: 2 },
  { slug: "orlando", name: "Orlando", nameAr: "أورلاندو", countryCode: "US", coordinates: { lat: 28.5383, lng: -81.3792 }, timezone: "America/New_York", tier: 2 },
  { slug: "san-francisco", name: "San Francisco", nameAr: "سان فرانسيسكو", countryCode: "US", coordinates: { lat: 37.7749, lng: -122.4194 }, timezone: "America/Los_Angeles", tier: 2 },
  { slug: "chicago", name: "Chicago", nameAr: "شيكاغو", countryCode: "US", coordinates: { lat: 41.8781, lng: -87.6298 }, timezone: "America/Chicago", tier: 3 },
  { slug: "boston", name: "Boston", nameAr: "بوسطن", countryCode: "US", coordinates: { lat: 42.3601, lng: -71.0589 }, timezone: "America/New_York", tier: 3 },
  { slug: "washington-dc", name: "Washington, D.C.", nameAr: "واشنطن العاصمة", countryCode: "US", coordinates: { lat: 38.9072, lng: -77.0369 }, timezone: "America/New_York", tier: 3 },
  { slug: "seattle", name: "Seattle", nameAr: "سياتل", countryCode: "US", coordinates: { lat: 47.6062, lng: -122.3321 }, timezone: "America/Los_Angeles", tier: 3 },
  { slug: "honolulu", name: "Honolulu", nameAr: "هونولولو", countryCode: "US", coordinates: { lat: 21.3069, lng: -157.8583 }, timezone: "Pacific/Honolulu", tier: 3 },
  { slug: "new-orleans", name: "New Orleans", nameAr: "نيو أورلينز", countryCode: "US", coordinates: { lat: 29.9511, lng: -90.0715 }, timezone: "America/Chicago", tier: 3 },
  { slug: "toronto", name: "Toronto", nameAr: "تورونتو", countryCode: "CA", coordinates: { lat: 43.6532, lng: -79.3832 }, timezone: "America/Toronto", tier: 2 },
  { slug: "vancouver", name: "Vancouver", nameAr: "فانكوفر", countryCode: "CA", coordinates: { lat: 49.2827, lng: -123.1207 }, timezone: "America/Vancouver", tier: 3 },
  { slug: "montreal", name: "Montréal", nameAr: "مونتريال", countryCode: "CA", coordinates: { lat: 45.5019, lng: -73.5674 }, timezone: "America/Toronto", tier: 3 },
  { slug: "mexico-city", name: "Mexico City", nameAr: "مكسيكو سيتي", countryCode: "MX", coordinates: { lat: 19.4326, lng: -99.1332 }, timezone: "America/Mexico_City", tier: 2 },
  { slug: "cancun", name: "Cancún", nameAr: "كانكون", countryCode: "MX", coordinates: { lat: 21.1619, lng: -86.8515 }, timezone: "America/Cancun", tier: 2 },
  { slug: "tulum", name: "Tulum", nameAr: "تولوم", countryCode: "MX", coordinates: { lat: 20.2114, lng: -87.4654 }, timezone: "America/Cancun", tier: 3 },
  { slug: "havana", name: "Havana", nameAr: "هافانا", countryCode: "CU", coordinates: { lat: 23.1136, lng: -82.3666 }, timezone: "America/Havana", tier: 3 },
  { slug: "punta-cana", name: "Punta Cana", nameAr: "بونتا كانا", countryCode: "DO", coordinates: { lat: 18.5601, lng: -68.3725 }, timezone: "America/Santo_Domingo", tier: 3 },
  { slug: "montego-bay", name: "Montego Bay", nameAr: "مونتيغو باي", countryCode: "JM", coordinates: { lat: 18.4762, lng: -77.8939 }, timezone: "America/Jamaica", tier: 3 },
  { slug: "panama-city", name: "Panama City", nameAr: "مدينة بنما", countryCode: "PA", coordinates: { lat: 8.9824, lng: -79.5199 }, timezone: "America/Panama", tier: 3 },
  { slug: "san-jose-cr", name: "San José", nameAr: "سان خوسيه", countryCode: "CR", coordinates: { lat: 9.9281, lng: -84.0907 }, timezone: "America/Costa_Rica", tier: 3 },
  { slug: "rio-de-janeiro", name: "Rio de Janeiro", nameAr: "ريو دي جانيرو", countryCode: "BR", coordinates: { lat: -22.9068, lng: -43.1729 }, timezone: "America/Sao_Paulo", tier: 2 },
  { slug: "sao-paulo", name: "São Paulo", nameAr: "ساو باولو", countryCode: "BR", coordinates: { lat: -23.5505, lng: -46.6333 }, timezone: "America/Sao_Paulo", tier: 3 },
  { slug: "buenos-aires", name: "Buenos Aires", nameAr: "بوينس آيرس", countryCode: "AR", coordinates: { lat: -34.6037, lng: -58.3816 }, timezone: "America/Argentina/Buenos_Aires", tier: 2 },
  { slug: "santiago", name: "Santiago", nameAr: "سانتياغو", countryCode: "CL", coordinates: { lat: -33.4489, lng: -70.6693 }, timezone: "America/Santiago", tier: 3 },
  { slug: "lima", name: "Lima", nameAr: "ليما", countryCode: "PE", coordinates: { lat: -12.0464, lng: -77.0428 }, timezone: "America/Lima", tier: 3 },
  { slug: "cusco", name: "Cusco", nameAr: "كوسكو", countryCode: "PE", coordinates: { lat: -13.5319, lng: -71.9675 }, timezone: "America/Lima", tier: 3 },
  { slug: "bogota", name: "Bogotá", nameAr: "بوغوتا", countryCode: "CO", coordinates: { lat: 4.7110, lng: -74.0721 }, timezone: "America/Bogota", tier: 3 },
  { slug: "cartagena", name: "Cartagena", nameAr: "قرطاجنة", countryCode: "CO", coordinates: { lat: 10.3910, lng: -75.4794 }, timezone: "America/Bogota", tier: 3 },
  { slug: "montevideo", name: "Montevideo", nameAr: "مونتيفيديو", countryCode: "UY", coordinates: { lat: -34.9011, lng: -56.1645 }, timezone: "America/Montevideo", tier: 3 },
  { slug: "tokyo", name: "Tokyo", nameAr: "طوكيو", countryCode: "JP", coordinates: { lat: 35.6762, lng: 139.6503 }, timezone: "Asia/Tokyo", tier: 1 },
  { slug: "osaka", name: "Osaka", nameAr: "أوساكا", countryCode: "JP", coordinates: { lat: 34.6937, lng: 135.5023 }, timezone: "Asia/Tokyo", tier: 2 },
  { slug: "kyoto", name: "Kyoto", nameAr: "كيوتو", countryCode: "JP", coordinates: { lat: 35.0116, lng: 135.7681 }, timezone: "Asia/Tokyo", tier: 2 },
  { slug: "sapporo", name: "Sapporo", nameAr: "سابورو", countryCode: "JP", coordinates: { lat: 43.0618, lng: 141.3545 }, timezone: "Asia/Tokyo", tier: 3 },
  { slug: "seoul", name: "Seoul", nameAr: "سول", countryCode: "KR", coordinates: { lat: 37.5665, lng: 126.9780 }, timezone: "Asia/Seoul", tier: 2 },
  { slug: "busan", name: "Busan", nameAr: "بوسان", countryCode: "KR", coordinates: { lat: 35.1796, lng: 129.0756 }, timezone: "Asia/Seoul", tier: 3 },
  { slug: "beijing", name: "Beijing", nameAr: "بكين", countryCode: "CN", coordinates: { lat: 39.9042, lng: 116.4074 }, timezone: "Asia/Shanghai", tier: 2 },
  { slug: "shanghai", name: "Shanghai", nameAr: "شنغهاي", countryCode: "CN", coordinates: { lat: 31.2304, lng: 121.4737 }, timezone: "Asia/Shanghai", tier: 2 },
  { slug: "guangzhou", name: "Guangzhou", nameAr: "قوانغتشو", countryCode: "CN", coordinates: { lat: 23.1291, lng: 113.2644 }, timezone: "Asia/Shanghai", tier: 3 },
  { slug: "chengdu", name: "Chengdu", nameAr: "تشنغدو", countryCode: "CN", coordinates: { lat: 30.5728, lng: 104.0668 }, timezone: "Asia/Shanghai", tier: 3 },
  { slug: "hong-kong", name: "Hong Kong", nameAr: "هونغ كونغ", countryCode: "HK", coordinates: { lat: 22.3193, lng: 114.1694 }, timezone: "Asia/Hong_Kong", tier: 2 },
  { slug: "taipei", name: "Taipei", nameAr: "تايبيه", countryCode: "TW", coordinates: { lat: 25.0330, lng: 121.5654 }, timezone: "Asia/Taipei", tier: 3 },
  { slug: "singapore", name: "Singapore", nameAr: "سنغافورة", countryCode: "SG", coordinates: { lat: 1.3521, lng: 103.8198 }, timezone: "Asia/Singapore", tier: 1 },
  { slug: "kuala-lumpur", name: "Kuala Lumpur", nameAr: "كوالالمبور", countryCode: "MY", coordinates: { lat: 3.1390, lng: 101.6869 }, timezone: "Asia/Kuala_Lumpur", tier: 2 },
  { slug: "penang", name: "Penang", nameAr: "بينانغ", countryCode: "MY", coordinates: { lat: 5.4141, lng: 100.3288 }, timezone: "Asia/Kuala_Lumpur", tier: 3 },
  { slug: "langkawi", name: "Langkawi", nameAr: "لنكاوي", countryCode: "MY", coordinates: { lat: 6.3500, lng: 99.8000 }, timezone: "Asia/Kuala_Lumpur", tier: 3 },
  { slug: "bangkok", name: "Bangkok", nameAr: "بانكوك", countryCode: "TH", coordinates: { lat: 13.7563, lng: 100.5018 }, timezone: "Asia/Bangkok", tier: 1 },
  { slug: "phuket", name: "Phuket", nameAr: "بوكيت", countryCode: "TH", coordinates: { lat: 7.8804, lng: 98.3923 }, timezone: "Asia/Bangkok", tier: 2 },
  { slug: "chiang-mai", name: "Chiang Mai", nameAr: "شيانغ ماي", countryCode: "TH", coordinates: { lat: 18.7883, lng: 98.9853 }, timezone: "Asia/Bangkok", tier: 3 },
  { slug: "krabi", name: "Krabi", nameAr: "كرابي", countryCode: "TH", coordinates: { lat: 8.0863, lng: 98.9063 }, timezone: "Asia/Bangkok", tier: 3 },
  { slug: "koh-samui", name: "Koh Samui", nameAr: "كوه ساموي", countryCode: "TH", coordinates: { lat: 9.5120, lng: 100.0136 }, timezone: "Asia/Bangkok", tier: 3 },
  { slug: "hanoi", name: "Hanoi", nameAr: "هانوي", countryCode: "VN", coordinates: { lat: 21.0278, lng: 105.8342 }, timezone: "Asia/Ho_Chi_Minh", tier: 3 },
  { slug: "ho-chi-minh-city", name: "Ho Chi Minh City", nameAr: "مدينة هوشي منه", countryCode: "VN", coordinates: { lat: 10.8231, lng: 106.6297 }, timezone: "Asia/Ho_Chi_Minh", tier: 3 },
  { slug: "da-nang", name: "Da Nang", nameAr: "دا نانغ", countryCode: "VN", coordinates: { lat: 16.0544, lng: 108.2022 }, timezone: "Asia/Ho_Chi_Minh", tier: 3 },
  { slug: "bali", name: "Bali", nameAr: "بالي", countryCode: "ID", coordinates: { lat: -8.4095, lng: 115.1889 }, timezone: "Asia/Makassar", tier: 1 },
  { slug: "jakarta", name: "Jakarta", nameAr: "جاكرتا", countryCode: "ID", coordinates: { lat: -6.2088, lng: 106.8456 }, timezone: "Asia/Jakarta", tier: 3 },
  { slug: "lombok", name: "Lombok", nameAr: "لومبوك", countryCode: "ID", coordinates: { lat: -8.6500, lng: 116.3249 }, timezone: "Asia/Makassar", tier: 3 },
  { slug: "manila", name: "Manila", nameAr: "مانيلا", countryCode: "PH", coordinates: { lat: 14.5995, lng: 120.9842 }, timezone: "Asia/Manila", tier: 3 },
  { slug: "cebu", name: "Cebu", nameAr: "سيبو", countryCode: "PH", coordinates: { lat: 10.3157, lng: 123.8854 }, timezone: "Asia/Manila", tier: 3 },
  { slug: "boracay", name: "Boracay", nameAr: "بوراكاي", countryCode: "PH", coordinates: { lat: 11.9674, lng: 121.9248 }, timezone: "Asia/Manila", tier: 3 },
  { slug: "mumbai", name: "Mumbai", nameAr: "مومباي", countryCode: "IN", coordinates: { lat: 19.0760, lng: 72.8777 }, timezone: "Asia/Kolkata", tier: 2 },
  { slug: "new-delhi", name: "New Delhi", nameAr: "نيودلهي", countryCode: "IN", coordinates: { lat: 28.6139, lng: 77.2090 }, timezone: "Asia/Kolkata", tier: 2 },
  { slug: "goa", name: "Goa", nameAr: "غوا", countryCode: "IN", coordinates: { lat: 15.2993, lng: 74.1240 }, timezone: "Asia/Kolkata", tier: 2 },
  { slug: "jaipur", name: "Jaipur", nameAr: "جايبور", countryCode: "IN", coordinates: { lat: 26.9124, lng: 75.7873 }, timezone: "Asia/Kolkata", tier: 3 },
  { slug: "bengaluru", name: "Bengaluru", nameAr: "بنغالورو", countryCode: "IN", coordinates: { lat: 12.9716, lng: 77.5946 }, timezone: "Asia/Kolkata", tier: 3 },
  { slug: "kochi", name: "Kochi", nameAr: "كوتشي", countryCode: "IN", coordinates: { lat: 9.9312, lng: 76.2673 }, timezone: "Asia/Kolkata", tier: 3 },
  { slug: "colombo", name: "Colombo", nameAr: "كولومبو", countryCode: "LK", coordinates: { lat: 6.9271, lng: 79.8612 }, timezone: "Asia/Colombo", tier: 3 },
  { slug: "male", name: "Malé", nameAr: "ماليه", countryCode: "MV", coordinates: { lat: 4.1755, lng: 73.5093 }, timezone: "Indian/Maldives", tier: 1 },
  { slug: "kathmandu", name: "Kathmandu", nameAr: "كاتماندو", countryCode: "NP", coordinates: { lat: 27.7172, lng: 85.3240 }, timezone: "Asia/Kathmandu", tier: 3 },
  { slug: "lahore", name: "Lahore", nameAr: "لاهور", countryCode: "PK", coordinates: { lat: 31.5204, lng: 74.3587 }, timezone: "Asia/Karachi", tier: 3 },
  { slug: "karachi", name: "Karachi", nameAr: "كراتشي", countryCode: "PK", coordinates: { lat: 24.8607, lng: 67.0011 }, timezone: "Asia/Karachi", tier: 3 },
  { slug: "islamabad", name: "Islamabad", nameAr: "إسلام آباد", countryCode: "PK", coordinates: { lat: 33.6844, lng: 73.0479 }, timezone: "Asia/Karachi", tier: 3 },
  { slug: "dhaka", name: "Dhaka", nameAr: "دكا", countryCode: "BD", coordinates: { lat: 23.8103, lng: 90.4125 }, timezone: "Asia/Dhaka", tier: 3 },
  { slug: "almaty", name: "Almaty", nameAr: "ألماتي", countryCode: "KZ", coordinates: { lat: 43.2220, lng: 76.8512 }, timezone: "Asia/Almaty", tier: 3 },
  { slug: "tashkent", name: "Tashkent", nameAr: "طشقند", countryCode: "UZ", coordinates: { lat: 41.2995, lng: 69.2401 }, timezone: "Asia/Tashkent", tier: 3 },
  { slug: "samarkand", name: "Samarkand", nameAr: "سمرقند", countryCode: "UZ", coordinates: { lat: 39.6270, lng: 66.9750 }, timezone: "Asia/Tashkent", tier: 3 },
  { slug: "baku", name: "Baku", nameAr: "باكو", countryCode: "AZ", coordinates: { lat: 40.4093, lng: 49.8671 }, timezone: "Asia/Baku", tier: 3 },
  { slug: "tbilisi", name: "Tbilisi", nameAr: "تبليسي", countryCode: "GE", coordinates: { lat: 41.7151, lng: 44.8271 }, timezone: "Asia/Tbilisi", tier: 3 },
  { slug: "sydney", name: "Sydney", nameAr: "سيدني", countryCode: "AU", coordinates: { lat: -33.8688, lng: 151.2093 }, timezone: "Australia/Sydney", tier: 1 },
  { slug: "melbourne", name: "Melbourne", nameAr: "ملبورن", countryCode: "AU", coordinates: { lat: -37.8136, lng: 144.9631 }, timezone: "Australia/Melbourne", tier: 2 },
  { slug: "brisbane", name: "Brisbane", nameAr: "بريزبن", countryCode: "AU", coordinates: { lat: -27.4698, lng: 153.0251 }, timezone: "Australia/Brisbane", tier: 3 },
  { slug: "gold-coast", name: "Gold Coast", nameAr: "غولد كوست", countryCode: "AU", coordinates: { lat: -28.0167, lng: 153.4000 }, timezone: "Australia/Brisbane", tier: 3 },
  { slug: "perth", name: "Perth", nameAr: "بيرث", countryCode: "AU", coordinates: { lat: -31.9505, lng: 115.8605 }, timezone: "Australia/Perth", tier: 3 },
  { slug: "auckland", name: "Auckland", nameAr: "أوكلاند", countryCode: "NZ", coordinates: { lat: -36.8485, lng: 174.7633 }, timezone: "Pacific/Auckland", tier: 3 },
  { slug: "queenstown", name: "Queenstown", nameAr: "كوينزتاون", countryCode: "NZ", coordinates: { lat: -45.0312, lng: 168.6626 }, timezone: "Pacific/Auckland", tier: 3 },
  { slug: "nadi", name: "Nadi", nameAr: "نادي", countryCode: "FJ", coordinates: { lat: -17.7765, lng: 177.4356 }, timezone: "Pacific/Fiji", tier: 3 },
];

const BY_SLUG = new Map(CITIES.map((c) => [c.slug, c]));

export function getCity(slug: string): City | undefined {
  return BY_SLUG.get(slug);
}

export function cityCountry(city: City): Country | undefined {
  return getCountry(city.countryCode);
}

export function citiesInCountry(code: string): City[] {
  return CITIES.filter((c) => c.countryCode === code.toUpperCase());
}

export function citiesInRegion(region: Region): City[] {
  return CITIES.filter((c) => getCountry(c.countryCode)?.region === region);
}

/** Countries that actually have cities in the catalogue, within one region. */
export function bookableCountries(region: Region): Country[] {
  const codes = new Set(
    CITIES.map((c) => c.countryCode).filter((code) => getCountry(code)?.region === region),
  );
  return [...codes].map((code) => getCountry(code)!).sort((a, b) => a.name.localeCompare(b.name));
}

