import type { CurrencyCode, Flexibility, Locale, RoomAllocation, SearchIntent } from "../types";
import { todayIso } from "../format";

export interface ValidationOutcome {
  valid: boolean;
  fields: Record<string, string>;
  intent?: SearchIntent;
}

const FLEX: Flexibility[] = ["exact", "p1", "p3", "p7"];
const CURRENCIES: CurrencyCode[] = ["SAR", "USD", "EUR", "AED", "GBP"];

export const MAX_ROOMS = 8;
export const MAX_ADULTS_PER_ROOM = 6;
export const MAX_CHILDREN_PER_ROOM = 4;
export const MAX_CHILD_AGE = 17;

/** Shared by the search builder UI and the BFF so the rules cannot drift. */
export function validateIntent(input: Partial<SearchIntent>, locale: Locale): ValidationOutcome {
  const fields: Record<string, string> = {};
  const ar = locale === "ar";

  if (!input.destinationId) {
    fields.destinationId = ar ? "اختر وجهة من القائمة." : "Choose a destination from the list.";
  }
  const checkIn = (input.checkIn ?? "").slice(0, 10);
  const checkOut = (input.checkOut ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(checkIn) || !/^\d{4}-\d{2}-\d{2}$/.test(checkOut)) {
    fields.dates = ar ? "اختر تاريخي الوصول والمغادرة." : "Choose a check-in and check-out date.";
  } else if (checkIn < todayIso()) {
    fields.dates = ar ? "اختر تاريخ وصول من اليوم فصاعدًا." : "Choose a check-in date from today onward.";
  } else if (checkOut <= checkIn) {
    fields.dates = ar ? "يجب أن يكون تاريخ المغادرة بعد الوصول." : "Check-out must be after check-in.";
  }

  const rooms: RoomAllocation[] = Array.isArray(input.rooms) ? input.rooms : [];
  if (!rooms.length) {
    fields.rooms = ar ? "أضف غرفة واحدة على الأقل." : "Add at least one room.";
  } else if (rooms.length > MAX_ROOMS) {
    fields.rooms = ar
      ? `يمكنك البحث عن ${MAX_ROOMS} غرف كحد أقصى.`
      : `You can search up to ${MAX_ROOMS} rooms at once.`;
  } else {
    rooms.forEach((room, index) => {
      if (!room || typeof room.adults !== "number" || room.adults < 1) {
        fields[`rooms.${index}.adults`] = ar
          ? "يجب أن تحتوي كل غرفة على بالغ واحد على الأقل."
          : "Each room needs at least one adult.";
      } else if (room.adults > MAX_ADULTS_PER_ROOM) {
        fields[`rooms.${index}.adults`] = ar
          ? `الحد الأقصى ${MAX_ADULTS_PER_ROOM} بالغين لكل غرفة.`
          : `Up to ${MAX_ADULTS_PER_ROOM} adults per room.`;
      }
      const ages = Array.isArray(room?.childrenAges) ? room.childrenAges : [];
      if (ages.length > MAX_CHILDREN_PER_ROOM) {
        fields[`rooms.${index}.children`] = ar
          ? `الحد الأقصى ${MAX_CHILDREN_PER_ROOM} أطفال لكل غرفة.`
          : `Up to ${MAX_CHILDREN_PER_ROOM} children per room.`;
      }
      ages.forEach((age, childIndex) => {
        if (age == null || Number.isNaN(Number(age)) || age < 0 || age > MAX_CHILD_AGE) {
          fields[`rooms.${index}.childrenAges.${childIndex}`] = ar
            ? "أدخل عمرًا بين ٠ و ١٧."
            : "Enter an age between 0 and 17.";
        }
      });
    });
  }

  if (Object.keys(fields).length) return { valid: false, fields };

  const intent: SearchIntent = {
    destinationId: input.destinationId!,
    destinationDisplay: input.destinationDisplay ?? "",
    destinationType: input.destinationType ?? "city",
    checkIn,
    checkOut,
    flexibility: FLEX.includes(input.flexibility as Flexibility) ? (input.flexibility as Flexibility) : "exact",
    rooms: rooms.map((r) => ({
      adults: Math.max(1, Math.round(r.adults)),
      childrenAges: (r.childrenAges ?? []).map((a) => Math.max(0, Math.round(Number(a)))),
    })),
    nationality: input.nationality,
    accessibleRoom: Boolean(input.accessibleRoom),
    locale,
    currency: CURRENCIES.includes(input.currency as CurrencyCode) ? (input.currency as CurrencyCode) : "SAR",
  };

  return { valid: true, fields: {}, intent };
}
