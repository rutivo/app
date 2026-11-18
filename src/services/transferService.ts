import { inTransaction, type Database } from '../db/database.js';
import { BusinessRuleError, ConflictError, NotFoundError } from '../domain/errors.js';
import {
  ALLOWED_TRANSITIONS,
  transferEndsAt,
  type Transfer,
  type TransferStatus,
} from '../domain/models.js';
import type { TransferCreate, TransferListQuery, TransferUpdate } from '../domain/schemas.js';
import type { DriverRepository } from '../repositories/driverRepository.js';
import type { TransferRepository } from '../repositories/transferRepository.js';
import type { VehicleRepository } from '../repositories/vehicleRepository.js';

const EDITABLE_STATUSES: readonly TransferStatus[] = ['pending', 'assigned'];
const DELETABLE_STATUSES: readonly TransferStatus[] = ['pending', 'cancelled'];

export class TransferService {
  constructor(
    private readonly db: Database,
    private readonly transfers: TransferRepository,
    private readonly drivers: DriverRepository,
    private readonly vehicles: VehicleRepository,
  ) {}

  list(query: TransferListQuery): Transfer[] {
    return this.transfers.list(query);
  }

  get(id: number): Transfer {
    const transfer = this.transfers.findById(id);
    if (!transfer) throw new NotFoundError(`Traslado ${id} no encontrado`);
    return transfer;
  }

  create(data: TransferCreate): Transfer {
    return this.transfers.create(data);
  }

  update(id: number, data: TransferUpdate): Transfer {
    return inTransaction(this.db, () => {
      const current = this.get(id);
      if (!EDITABLE_STATUSES.includes(current.status)) {
        throw new BusinessRuleError(`No se puede editar un traslado en estado "${current.status}"`);
      }
      const next = { ...current, ...data };
      // Si ya está asignado, los cambios de horario o pasajeros deben seguir siendo viables.
      if (current.status === 'assigned' && current.driverId && current.vehicleId) {
        this.checkAssignment(next, current.driverId, current.vehicleId);
      }
      return this.transfers.update(id, data)!;
    });
  }

  assign(id: number, driverId: number, vehicleId: number): Transfer {
    return inTransaction(this.db, () => {
      const transfer = this.get(id);
      if (!EDITABLE_STATUSES.includes(transfer.status)) {
        throw new BusinessRuleError(`No se puede asignar un traslado en estado "${transfer.status}"`);
      }
      this.checkAssignment(transfer, driverId, vehicleId);
      return this.transfers.update(id, { driverId, vehicleId, status: 'assigned' })!;
    });
  }

  changeStatus(id: number, status: TransferStatus): Transfer {
    return inTransaction(this.db, () => {
      const transfer = this.get(id);
      if (transfer.status === status) return transfer;
      if (!ALLOWED_TRANSITIONS[transfer.status].includes(status)) {
        throw new BusinessRuleError(`Transición no permitida: ${transfer.status} → ${status}`);
      }
      if (status === 'assigned') {
        throw new BusinessRuleError('Usa la acción de asignar para indicar conductor y vehículo');
      }
      // Volver a pendiente libera conductor y vehículo.
      const release = status === 'pending' ? { driverId: null, vehicleId: null } : {};
      return this.transfers.update(id, { status, ...release })!;
    });
  }

  delete(id: number): void {
    const transfer = this.get(id);
    if (!DELETABLE_STATUSES.includes(transfer.status)) {
      throw new BusinessRuleError('Solo se pueden borrar traslados pendientes o cancelados');
    }
    this.transfers.delete(id);
  }

  /** Valida que conductor y vehículo existan, estén activos, quepan y estén libres. */
  private checkAssignment(transfer: Transfer, driverId: number, vehicleId: number): void {
    const driver = this.drivers.findById(driverId);
    if (!driver) throw new NotFoundError(`Conductor ${driverId} no encontrado`);
    if (!driver.active) throw new BusinessRuleError(`El conductor ${driver.name} está inactivo`);

    const vehicle = this.vehicles.findById(vehicleId);
    if (!vehicle) throw new NotFoundError(`Vehículo ${vehicleId} no encontrado`);
    if (!vehicle.active) throw new BusinessRuleError(`El vehículo ${vehicle.plate} está inactivo`);
    if (vehicle.seats < transfer.passengers) {
      throw new BusinessRuleError(
        `El vehículo ${vehicle.plate} tiene ${vehicle.seats} plazas y el traslado ${transfer.passengers} pasajeros`,
      );
    }

    const overlapping = this.transfers.findOverlapping({
      start: transfer.pickupAt,
      end: transferEndsAt(transfer),
      driverId,
      vehicleId,
      excludeId: transfer.id,
    });
    if (overlapping.length > 0) {
      const ids = overlapping.map((t) => `#${t.id}`).join(', ');
      throw new ConflictError(`Conductor o vehículo ocupados en ese horario (traslados ${ids})`, {
        conflictingTransferIds: overlapping.map((t) => t.id),
      });
    }
  }
}
