export interface DayHours {
  open: string;
  close: string;
  closed: boolean;
  /** Not bookable, e.g. lunch. */
  breaks?: { start: string; end: string }[];
}

export type WorkingHours = Record<string, DayHours>;

export interface TodayHours {
  open: string;
  close: string;
  breaks: { start: string; end: string }[];
}

/** Earned salon achievement, as shown to customers. */
export interface AchievementBadge {
  key: string;
  emoji: string;
  label: string;
}

/** Full achievement with progress, for the owner dashboard. */
export interface Achievement extends AchievementBadge {
  description: string;
  earned: boolean;
  progress: { current: number; target: number };
}

export interface HairStyle {
  id: string;
  name: string;
  gender: 'MEN' | 'WOMEN';
  description: string;
  length: 'Short' | 'Medium' | 'Long';
  maintenance: 'Low' | 'Medium' | 'High';
  faceShapeFit: Record<'oval' | 'round' | 'square' | 'heart' | 'oblong' | 'diamond', number>;
  imageUrl: string | null;
  active: boolean;
  order: number;
}

export interface BusinessCard {
  id: string;
  name: string;
  category: string;
  image: string | null;
  rating: number;
  reviewCount: number;
  distanceKm: number;
  startingPrice: number | null;
  openNow: boolean;
  todayHours: TodayHours | null;
  achievements: AchievementBadge[];
  trustBadges: string[];
}

export interface SearchResponse {
  results: BusinessCard[];
  total: number;
  page: number;
  limit: number;
  relaxedFilters?: string[];
}

export interface Service {
  id: string;
  name: string;
  price: number;
  durationMinutes: number;
  description: string | null;
  imageUrl: string | null;
  active: boolean;
}

export interface Staff {
  id: string;
  name: string;
  experienceYears: number | null;
  specializations: string[];
  languages: string[];
  photoUrl: string | null;
  averageRating: number | null;
  homeServiceCapable?: boolean;
}

/** Staff row as the owning salon's own owner sees it (Manage → staff list). */
export interface OwnerStaff extends Staff {
  active: boolean;
  phone: string | null;
  hasLogin: boolean;
}

export interface PortfolioMedia {
  id: string;
  url: string;
  type: 'PORTFOLIO' | 'BEFORE_AFTER';
}

/** Public barber profile — GET /staff/:id. */
export interface StaffDetail extends Staff {
  business: {
    id: string;
    name: string;
    verificationStatus: 'PENDING' | 'VERIFIED' | 'REJECTED';
    trustBadges: TrustBadge[];
    city: { name: string } | null;
  };
  certifications: { id: string; name: string; issuingBody: string | null }[];
  portfolioMedia: PortfolioMedia[];
}

export interface ReviewMedia {
  id: string;
  url: string;
  type: string;
}

export interface Review {
  id: string;
  rating: number;
  staffRating: number | null;
  text: string | null;
  createdAt: string;
  customer: { name: string };
  media: ReviewMedia[];
}

export interface TrustBadge {
  badgeType: string;
  awardedAt: string;
  expiresAt: string | null;
}

export interface BusinessDetail {
  id: string;
  name: string;
  category: string;
  description: string | null;
  lat: number;
  lng: number;
  address: string | null;
  openNow: boolean;
  todayHours: TodayHours | null;
  achievements: AchievementBadge[];
  workingHours: WorkingHours;
  city: { name: string; state: string | null };
  media: { id: string; url: string; type: string }[];
  trustBadges: TrustBadge[];
  services: Service[];
  staff: Staff[];
  reviews: Review[];
  hasHomeService: boolean;
}

/** Customer's saved home-visit address — GET/POST /addresses. */
export interface Address {
  id: string;
  label: string;
  lat: number;
  lng: number;
  formattedAddress: string;
}

export interface AvailabilitySlot {
  staffId: string;
  start: string;
  end: string;
}

export interface AvailabilityGridEntry {
  start: string;
  end: string;
  /** Stylists free for this start time. */
  available: number;
  /** Stylists working at this time. */
  total: number;
  staffIds: string[];
}

export interface AvailabilityResponse {
  date: string;
  serviceId: string;
  closed: boolean;
  hours: { open: string; close: string } | null;
  grid: AvailabilityGridEntry[];
  slots: AvailabilitySlot[];
}

export interface CurrentUser {
  id: string;
  name: string;
  role: 'CUSTOMER' | 'OWNER' | 'STAFF' | 'ADMIN';
  phone: string | null;
  avatarUrl?: string | null;
  email?: string | null;
  googleLinked?: boolean;
}

export interface AuthMethods {
  google: { clientId: string } | null;
  phone: boolean;
}

export type BookingStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'RESCHEDULED'
  | 'CANCELLED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'REVIEWED'
  | 'NO_SHOW';

export interface OwnerBusinessDetail {
  id: string;
  name: string;
  category: string;
  description: string | null;
  verificationStatus: 'PENDING' | 'VERIFIED' | 'REJECTED';
  lat: number;
  lng: number;
  address: string | null;
  workingHours: WorkingHours;
  /** null = a service must finish by closing time (default). */
  lastBookingCutoffMinutes: number | null;
  city: { name: string };
  media: { id: string; url: string; type: string }[];
  services: Service[];
  staff: OwnerStaff[];
}

export interface PendingBusiness {
  id: string;
  name: string;
  category: string;
  description: string | null;
  createdAt: string;
  owner: { name: string; phone: string | null; email: string | null };
  city: { name: string };
  media: { id: string; url: string }[];
  services: { id: string; name: string; price: number }[];
  staff: { id: string; name: string }[];
}

export interface AdminStats {
  pendingCount: number;
  verifiedCount: number;
  rejectedCount: number;
  customerCount: number;
  ownerCount: number;
  bookingCount: number;
}

export interface MyBooking {
  id: string;
  slotStart: string;
  slotEnd: string;
  status: BookingStatus;
  business: { id: string; name: string; image: string | null; lat: number; lng: number; address: string | null };
  service: { id: string; name: string; price: number; durationMinutes: number };
  addOns: { id: string; name: string; price: number; durationMinutes: number }[];
  totalAmount: number;
  staff: { name: string } | null;
  hasReview: boolean;
  review: { rating: number; text: string | null } | null;
  confirmationCode: string | null;
}

/** GET /owner/businesses/:id/bookings — full history (all statuses/time), paginated. */
export interface OwnerBookingHistoryItem {
  id: string;
  slotStart: string;
  slotEnd: string;
  status: BookingStatus;
  serviceLocationType: 'IN_SALON' | 'HOME_SERVICE';
  service: { name: string; price: number };
  customer: { name: string };
  staff: { name: string } | null;
  totalAmount: number;
  address: string | null;
  createdAt: string;
}

export interface OwnerBookingHistory {
  bookings: OwnerBookingHistoryItem[];
  total: number;
  page: number;
  limit: number;
}

/** GET /staff/me — a barber's own profile. */
export interface StaffMe extends Staff {
  engagedUntil: string | null;
  business: { id: string; name: string; verificationStatus: 'PENDING' | 'VERIFIED' | 'REJECTED' };
  certifications: { id: string; name: string; issuingBody: string | null }[];
  portfolioMedia: PortfolioMedia[];
}

/** GET /staff/me/bookings — a thin view of a barber's own bookings. */
export interface StaffBooking {
  id: string;
  slotStart: string;
  slotEnd: string;
  status: BookingStatus;
  serviceLocationType: 'IN_SALON' | 'HOME_SERVICE';
  business: { id: string; name: string };
  customerName: string;
  service: { name: string; durationMinutes: number };
}
