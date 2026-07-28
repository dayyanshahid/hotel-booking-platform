/**
 * TourMind wire shapes, from the published OpenAPI document (TMS API 2.0).
 *
 * Everything here is supplier-shaped and stops at the adapter. Fields are
 * optional almost everywhere because a distribution API's response is a
 * promise about a happy path, not a guarantee about every field.
 */

export interface TmRequestHeader {
  AgentCode: string;
  UserName: string;
  Password: string;
  /** ISO 8601 with millisecond precision, e.g. 2018-07-26T09:51:32.123Z */
  RequestTime: string;
  /** GUID, for tracing a request through their logs. */
  TransactionID: string;
}

export interface TmError {
  /** 101 no payload · 102 bad format · 103 validation · 104 service · 105 auth */
  ErrorCode?: string;
  ErrorMessage?: string;
}

export interface TmPaxRoom {
  Adults?: number;
  Children?: number;
  ChildrenAges?: number[];
  RoomCount?: number;
}

export interface TmCancelPolicyInfo {
  Amount?: number;
  CurrencyCode?: string;
  /** Window start, "2006-01-02". Hotel local time. */
  StartDateTime?: string;
  /** Window end, "2006-01-02". Hotel local time. */
  EndDateTime?: string;
  /** Precise start, "2006-01-02 15:04:05". Hotel local time. */
  From?: string;
  /** Precise end, "2006-01-02 15:04:05". Hotel local time. */
  To?: string;
}

export interface TmMealInfo {
  /** 1 none · 2 breakfast · 3 lunch · 4 dinner · 5 lunch+dinner · 6 HB · 7 FB · 8 AI · 9 self-catering */
  MealCode?: number;
  Description?: string;
}

export interface TmRateInfo {
  RateCode?: string;
  Name?: string;
  NameCN?: string;
  TotalPrice?: number;
  CurrencyCode?: string;
  Refundable?: boolean;
  Allotment?: number;
  MealInfo?: TmMealInfo;
  CancelPolicyInfos?: TmCancelPolicyInfo[];
  bedTypeDesc?: string;
}

export interface TmRoomType {
  RoomTypeCode?: string;
  Name?: string;
  NameCN?: string;
  BedTypeDesc?: string;
  RateInfos?: TmRateInfo[];
}

export interface TmHotel {
  HotelCode?: string;
  CheckIn?: string;
  CheckOut?: string;
  RoomTypes?: TmRoomType[];
}

export interface TmHotelDetailResponse {
  Error?: TmError;
  Hotels?: TmHotel[];
}

export interface TmRoomAvailResponse {
  Error?: TmError;
  Hotels?: TmHotel[];
}

export interface TmCreateOrderResponse {
  Error?: TmError;
  ReservationID?: string;
  OrderInfo?: { Status?: string | number; [key: string]: unknown };
}

export interface TmCancelOrderResponse {
  Error?: TmError;
  [key: string]: unknown;
}

/** Their meal enum to the board codes the canonical model already uses. */
export const TM_MEAL_TO_BOARD: Record<number, string> = {
  1: "RO",
  2: "BB",
  3: "BB",
  4: "HB",
  5: "HB",
  6: "HB",
  7: "FB",
  8: "AI",
  9: "RO",
};
