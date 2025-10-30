export interface Ticket {
  id: string;
  act: string;
  location: string;
  date: string; // DD-MM-YYYY format
  start: string; // HH:MM AM/PM format
  qrCodeUrl: string;
  pdfUrl: string;
  transactionId?: string;
  createdAt: Date;
}

export interface Screening {
  id: string; // Composite key: act-date-start
  act: string;
  location: string;
  date: string;
  start: string;
  dateTime: Date; // Parsed date+time for sorting/filtering
  tickets: Ticket[];
  ticketCount: number;
}

export interface ProcessedTicketResult {
  ticketId: string;
  screeningKey: string;
  success: boolean;
  error?: string;
}

export interface PDFProcessingSummary {
  totalPages: number;
  successful: number;
  failed: number;
  tickets: ProcessedTicketResult[];
}

