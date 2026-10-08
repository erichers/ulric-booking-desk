export interface Photo {
  src: string;
  caption: string;
  room: string;
}

export interface ListingSection {
  title: string;
  text: string;
}

export interface AmenityGroup {
  group: string;
  items: string[];
}

export interface SleepingSpot {
  room: string;
  beds: string;
}

export interface Subrating {
  name: string;
  score: string;
}

export interface Property {
  id: string;
  name: string;
  hostName: string;
  tagline: string;
  description: string;
  locationLabel: string;
  contactEmail: string;
  contactPhone: string;
  nightlyRate: number;
  cleaningFee: number;
  serviceFee: number;
  depositPercent: number;
  minNights: number;
  maxGuests: number;
  houseRules: string;
  cancellationPolicy: string;
  checkInTime: string;
  checkOutTime: string;
  checkInInstructions: string;
  paypalHandle: string;
  venmoHandle: string;
  hostSignatureName: string;
  hasHostSignature: boolean;
  currency: string;
  slug: string;
  kind: string;
  sortOrder: number;
  heroImage: string;
  gallery: Photo[];
  rateLabel: string;
  feeLabel: string;
  invoicePrefix: string;
  unitLabel: string;
  airbnbId: string;
  airbnbUrl: string;
  rating: number;
  reviewCount: number;
  bedrooms: number;
  beds: number;
  baths: number;
  contains: string[];
  blocks: string[];
  sections: ListingSection[];
  amenities: AmenityGroup[];
  sleeping: SleepingSpot[];
  subratings: Subrating[];
  hostStats: string;
}

export interface DayMark {
  date: string;
  state: 'Open' | 'Held' | 'Booked' | 'Blocked';
  blockedBy: string | null;
}

export interface Quote {
  nights: number;
  nightlyRate: number;
  staySubtotal: number;
  cleaningFee: number;
  serviceFee: number;
  total: number;
  depositPercent: number;
  depositAmount: number;
  balanceAmount: number;
  depositDue: string;
  balanceDue: string;
}

export interface Line {
  label: string;
  amount: number;
}

export interface Payment {
  id: string;
  method: string;
  amount: number;
  paidOn: string;
  reference: string;
}

export interface Invoice {
  id: string;
  number: string;
  issuedOn: string;
  status: 'Unpaid' | 'Partial' | 'Paid' | 'Overdue';
  amountPaid: number;
  amountDue: number;
  depositRemaining: number;
  lines: Line[];
  payments: Payment[];
  payPalUrl: string | null;
  venmoUrl: string | null;
  payPalDepositUrl: string | null;
  venmoDepositUrl: string | null;
}

export interface ContractInfo {
  status: 'Unsigned' | 'Signed';
  signedAt: string | null;
  signedIp: string | null;
  guestSignatureType: string | null;
  guestSignatureText: string | null;
}

export interface Reminder {
  id: string;
  kind: string;
  channel: string;
  scheduledFor: string;
  status: string;
  recipient: string;
  subject: string;
}

export interface BookingSummary {
  id: string;
  guestToken: string;
  guestName: string;
  guestEmail: string;
  guestPhone: string;
  guests: number;
  checkIn: string;
  checkOut: string;
  notes: string;
  status: 'Requested' | 'Approved' | 'Declined' | 'Cancelled' | 'Confirmed' | 'Expired';
  nights: number;
  total: number;
  depositAmount: number;
  balanceAmount: number;
  createdAt: string;
  contractStatus: 'Unsigned' | 'Signed' | null;
  invoiceStatus: 'Unpaid' | 'Partial' | 'Paid' | 'Overdue' | null;
  amountPaid: number;
  propertyName: string;
  propertySlug: string;
}

export interface BookingDetail extends BookingSummary {
  guestPath: string;
  guestUrl: string | null;
  propertyName: string;
  propertySlug: string;
  nightlyRate: number;
  staySubtotal: number;
  cleaningFee: number;
  serviceFee: number;
  depositPercent: number;
  depositDue: string;
  balanceDue: string;
  decidedAt: string | null;
  invoice: Invoice | null;
  contract: ContractInfo | null;
  reminders: Reminder[];
  holdUntil: string | null;
  hostPhone: string;
}

export interface MonthTotal {
  month: string;
  label: string;
  amount: number;
}

export interface Dashboard {
  openRequests: number;
  upcomingStays: number;
  collectedThisMonth: number;
  outstanding: number;
  revenueByMonth: MonthTotal[];
  upcoming: BookingSummary[];
  recentRequests: BookingSummary[];
}

export interface OutboxMessage {
  id: string;
  channel: string;
  recipient: string;
  subject: string;
  body: string;
  loggedAt: string;
}
