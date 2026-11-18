export const TRANSFER_STATUSES = [
  'pending',
  'assigned',
  'in_progress',
  'completed',
  'cancelled',
] as const;

export type TransferStatus = (typeof TRANSFER_STATUSES)[number];

/** Transiciones de estado permitidas. Cualquier otra se rechaza. */
export const ALLOWED_TRANSITIONS: Readonly<Record<TransferStatus, readonly TransferStatus[]>> = {
  pending: ['assigned', 'cancelled'],
  assigned: ['pending', 'in_progress', 'cancelled'],
  in_progress: ['completed'],
  completed: [],
  cancelled: [],
};

export interface Driver {
  id: number;
  name: string;
  phone: string;
  license: string;
  active: boolean;
  createdAt: string;
}

export interface Vehicle {
  id: number;
  plate: string;
  model: string;
  seats: number;
  active: boolean;
  createdAt: string;
}

export interface Transfer {
  id: number;
  customerName: string;
  customerPhone: string;
  customerEmail: string | null;
  pickupLocation: string;
  dropoffLocation: string;
  pickupAt: string;
  durationMinutes: number;
  passengers: number;
  priceCents: number;
  notes: string | null;
  status: TransferStatus;
  driverId: number | null;
  vehicleId: number | null;
  createdAt: string;
  updatedAt: string;
}

/** Fin estimado del servicio (ISO 8601 UTC). */
export function transferEndsAt(t: Pick<Transfer, 'pickupAt' | 'durationMinutes'>): string {
  return new Date(Date.parse(t.pickupAt) + t.durationMinutes * 60_000).toISOString();
}
