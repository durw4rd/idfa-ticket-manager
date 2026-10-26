export interface Ticket {
  id: string;
  act: string;
  location: string;
  date: string; // DD-MM-YYYY format
  start: string; // HH:MM AM/PM format
  qrCodeUrl: string;
  pdfUrl: string;
  transactionId?: string;
  festivalLink?: string; // URL to IDFA festival page
  ownerEmail: string; // Who uploaded the ticket; only they can edit or delete it
  holderEmail: string; // Who will use the ticket; the owner or the holder can reassign it
  festivalYear: number;
  startsAt: Date;
  qrHash?: string | null; // SHA-256 of the decoded QR payload, used to detect duplicates
  createdAt: Date;
}

export interface Screening {
  id: string; // Composite key: act|date|start
  act: string;
  location: string;
  date: string;
  start: string;
  festivalYear: number;
  dateTime: Date; // Parsed date+time for sorting/filtering
  tickets: Ticket[];
  ticketCount: number;
}

export interface ExtractedTicketFields {
  act: string;
  location: string;
  date: string;
  start: string;
}

export interface ProcessedTicketResult {
  ticketId: string;
  screeningKey: string;
  success: boolean;
  duplicate?: boolean;
  extracted?: ExtractedTicketFields;
  error?: string;
}

export interface PDFProcessingSummary {
  totalPages: number;
  successful: number;
  failed: number;
  duplicates: number;
  tickets: ProcessedTicketResult[];
}

export interface Rating {
  id: string;
  userEmail: string;
  act: string;
  festivalYear: number;
  rating: number; // 1-10
  comment?: string | null; // Optional user comment
  createdAt: Date;
  updatedAt: Date;
}

export interface Group {
  id: string;
  name: string;
  createdBy: string;
  role: 'owner' | 'member';
  status: 'invited' | 'active';
  members: GroupMember[];
}

export interface GroupMember {
  userEmail: string;
  role: 'owner' | 'member';
  status: 'invited' | 'active';
}

// Someone whose tickets the viewer can see: the viewer or an active member of a shared group
export interface CrewMember {
  email: string;
  name: string;
  color: number; // Index into the crew colour palette, the same for every viewer of a group
  isMe: boolean;
}

// A screening as sent to client components: plain JSON, no blob URLs
export interface AgendaTicket {
  id: string;
  ownerEmail: string;
  holderEmail: string;
}

export interface AgendaScreening {
  id: string; // act|date|start, see screeningKey in lib/db.ts
  act: string;
  location: string;
  festivalYear: number;
  startsAt: string; // ISO timestamp
  festivalLink: string | null;
  tickets: AgendaTicket[];
}
