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
  ownerEmail: string;
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
