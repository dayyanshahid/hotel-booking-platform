import type { Locale } from "../types";

type L = Record<Locale, string>;

export interface RoomTemplate {
  key: string;
  name: L;
  sizeSqm: number;
  beds: { type: string; count: number }[];
  maxAdults: number;
  maxChildren: number;
  maxOccupancy: number;
  view: string;
  accessible: boolean;
  smoking: boolean;
  extraBed: boolean;
  cot: boolean;
  amenities: string[];
  /** Multiplier applied to the property's base nightly price. */
  priceFactor: number;
  /**
   * Simulated supplier label variants. The mapping layer decides whether these
   * collapse into one canonical room (§5.7 / E-05).
   */
  supplierLabels: string[];
  /** 0..1 — below 0.8 the UI must keep offers separate. */
  mappingConfidence: number;
}

export const ROOM_TEMPLATES: Record<string, RoomTemplate> = {
  "std-king": {
    key: "std-king",
    name: { en: "Standard King Room", ar: "غرفة كينج قياسية" },
    sizeSqm: 28,
    beds: [{ type: "king", count: 1 }],
    maxAdults: 2,
    maxChildren: 1,
    maxOccupancy: 3,
    view: "city",
    accessible: false,
    smoking: false,
    extraBed: true,
    cot: true,
    amenities: ["aircon", "kettle", "safe", "desk", "smartTv"],
    priceFactor: 1,
    supplierLabels: ["STANDARD KING", "Standard Room, 1 King Bed", "DBL.ST"],
    mappingConfidence: 0.96,
  },
  "std-twin": {
    key: "std-twin",
    name: { en: "Standard Twin Room", ar: "غرفة بسريرين قياسية" },
    sizeSqm: 28,
    beds: [{ type: "twin", count: 2 }],
    maxAdults: 2,
    maxChildren: 1,
    maxOccupancy: 3,
    view: "city",
    accessible: false,
    smoking: false,
    extraBed: false,
    cot: true,
    amenities: ["aircon", "kettle", "safe", "desk"],
    priceFactor: 1.02,
    supplierLabels: ["TWIN STANDARD", "Standard Room, 2 Twin Beds", "TWN.ST"],
    mappingConfidence: 0.95,
  },
  "deluxe-city": {
    key: "deluxe-city",
    name: { en: "Deluxe City View Room", ar: "غرفة ديلوكس بإطلالة على المدينة" },
    sizeSqm: 36,
    beds: [{ type: "king", count: 1 }],
    maxAdults: 2,
    maxChildren: 2,
    maxOccupancy: 3,
    view: "city",
    accessible: false,
    smoking: false,
    extraBed: true,
    cot: true,
    amenities: ["aircon", "minibar", "kettle", "safe", "desk", "smartTv", "soundproof"],
    priceFactor: 1.28,
    supplierLabels: ["DELUXE CITY VIEW", "Deluxe Room City View", "DLX.CV"],
    mappingConfidence: 0.92,
  },
  "deluxe-sea": {
    key: "deluxe-sea",
    name: { en: "Deluxe Sea View Room", ar: "غرفة ديلوكس بإطلالة بحرية" },
    sizeSqm: 38,
    beds: [{ type: "king", count: 1 }],
    maxAdults: 2,
    maxChildren: 2,
    maxOccupancy: 3,
    view: "sea",
    accessible: false,
    smoking: false,
    extraBed: true,
    cot: true,
    amenities: ["aircon", "minibar", "kettle", "safe", "balcony", "smartTv"],
    priceFactor: 1.45,
    supplierLabels: ["DELUXE SEA VIEW", "Sea View Room", "DLX.SV"],
    mappingConfidence: 0.9,
  },
  "haram-view": {
    key: "haram-view",
    name: { en: "Haram View Room", ar: "غرفة بإطلالة على الحرم" },
    sizeSqm: 34,
    beds: [{ type: "twin", count: 2 }],
    maxAdults: 3,
    maxChildren: 2,
    maxOccupancy: 4,
    view: "haram",
    accessible: false,
    smoking: false,
    extraBed: true,
    cot: true,
    amenities: ["aircon", "kettle", "safe", "prayerRoom"],
    priceFactor: 1.6,
    supplierLabels: ["HARAM VIEW", "Kaaba View Room", "HRM.VW"],
    mappingConfidence: 0.88,
  },
  "family-suite": {
    key: "family-suite",
    name: { en: "Family Room with Two Bedrooms", ar: "غرفة عائلية بغرفتي نوم" },
    sizeSqm: 52,
    beds: [
      { type: "king", count: 1 },
      { type: "twin", count: 2 },
    ],
    maxAdults: 4,
    maxChildren: 3,
    maxOccupancy: 6,
    view: "city",
    accessible: false,
    smoking: false,
    extraBed: true,
    cot: true,
    amenities: ["aircon", "minibar", "kettle", "safe", "smartTv", "bathtub"],
    priceFactor: 1.72,
    supplierLabels: ["FAMILY ROOM 2 BEDROOM", "Family Room", "FAM.2B"],
    mappingConfidence: 0.84,
  },
  "junior-suite": {
    key: "junior-suite",
    name: { en: "Junior Suite", ar: "جناح جونيور" },
    sizeSqm: 55,
    beds: [
      { type: "king", count: 1 },
      { type: "sofa", count: 1 },
    ],
    maxAdults: 3,
    maxChildren: 2,
    maxOccupancy: 4,
    view: "city",
    accessible: false,
    smoking: false,
    extraBed: true,
    cot: true,
    amenities: ["aircon", "minibar", "kettle", "safe", "desk", "smartTv", "lounge"],
    priceFactor: 1.95,
    supplierLabels: ["JUNIOR SUITE", "Suite, 1 King Bed", "JSU.KG"],
    mappingConfidence: 0.93,
  },
  "one-bed-apartment": {
    key: "one-bed-apartment",
    name: { en: "One-Bedroom Apartment", ar: "شقة بغرفة نوم واحدة" },
    sizeSqm: 62,
    beds: [
      { type: "king", count: 1 },
      { type: "sofa", count: 1 },
    ],
    maxAdults: 3,
    maxChildren: 2,
    maxOccupancy: 4,
    view: "city",
    accessible: false,
    smoking: false,
    extraBed: false,
    cot: true,
    amenities: ["aircon", "kitchenette", "kettle", "safe", "smartTv", "balcony"],
    priceFactor: 1.5,
    supplierLabels: ["1 BEDROOM APARTMENT", "One Bedroom Apt", "APT.1B"],
    mappingConfidence: 0.91,
  },
  "accessible-king": {
    key: "accessible-king",
    name: { en: "Accessible King Room", ar: "غرفة كينج مهيأة لذوي الإعاقة" },
    sizeSqm: 32,
    beds: [{ type: "king", count: 1 }],
    maxAdults: 2,
    maxChildren: 1,
    maxOccupancy: 3,
    view: "city",
    accessible: true,
    smoking: false,
    extraBed: false,
    cot: true,
    amenities: ["aircon", "rollInShower", "safe", "smartTv", "kettle"],
    priceFactor: 1.05,
    supplierLabels: ["ACCESSIBLE KING", "Room, 1 King Bed, Accessible", "ACC.KG"],
    mappingConfidence: 0.97,
  },
  "garden-villa": {
    key: "garden-villa",
    name: { en: "Garden Villa", ar: "فيلا بحديقة" },
    sizeSqm: 88,
    beds: [
      { type: "king", count: 1 },
      { type: "twin", count: 2 },
    ],
    maxAdults: 4,
    maxChildren: 2,
    maxOccupancy: 5,
    view: "garden",
    accessible: false,
    smoking: false,
    extraBed: true,
    cot: true,
    amenities: ["aircon", "minibar", "balcony", "bathtub", "smartTv", "kitchenette"],
    priceFactor: 2.4,
    supplierLabels: ["GARDEN VILLA", "Villa Garden View", "VIL.GD"],
    mappingConfidence: 0.86,
  },
  /**
   * Deliberately ambiguous: two supplier labels that are NOT safely equivalent
   * (one has a sofa bed, one does not). Drives the "kept separate" UI (E-05).
   */
  "superior-ambiguous": {
    key: "superior-ambiguous",
    name: { en: "Superior Room", ar: "غرفة سوبيريور" },
    sizeSqm: 32,
    beds: [{ type: "queen", count: 1 }],
    maxAdults: 2,
    maxChildren: 1,
    maxOccupancy: 3,
    view: "none",
    accessible: false,
    smoking: false,
    extraBed: false,
    cot: true,
    amenities: ["aircon", "kettle", "safe"],
    priceFactor: 1.12,
    supplierLabels: ["SUPERIOR ROOM", "Superior Double or Twin"],
    mappingConfidence: 0.62,
  },
};
