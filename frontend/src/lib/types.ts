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
  todayHours: { open: string; close: string } | null;
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
  todayHours: { open: string; close: string } | null;
  workingHours: Record<string, { open: string; close: string; closed: boolean }>;
  city: { name: string; state: string | null };
  media: { id: string; url: string; type: string }[];
  trustBadges: TrustBadge[];
  services: Service[];
  staff: Staff[];
  reviews: Review[];
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
  workingHours: Record<string, { open: string; close: string; closed: boolean }>;
  /** null = a service must finish by closing time (default). */
  lastBookingCutoffMinutes: number | null;
  city: { name: string };
  media: { id: string; url: string; type: string }[];
  services: Service[];
  staff: Staff[];
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
  service: { name: string; price: number; durationMinutes: number };
  addOns: { id: string; name: string; price: number; durationMinutes: number }[];
  totalAmount: number;
  staff: { name: string } | null;
  hasReview: boolean;
  review: { rating: number; text: string | null } | null;
  confirmationCode: string | null;
}
