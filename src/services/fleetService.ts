import { ConflictError, NotFoundError } from '../domain/errors.js';
import type { Driver, Vehicle } from '../domain/models.js';
import type { DriverCreate, DriverUpdate, VehicleCreate, VehicleUpdate } from '../domain/schemas.js';
import type { DriverRepository } from '../repositories/driverRepository.js';
import { isUniqueViolation } from '../repositories/sql.js';
import type { TransferRepository } from '../repositories/transferRepository.js';
import type { VehicleRepository } from '../repositories/vehicleRepository.js';

/** Gestión de conductores y vehículos. */
export class FleetService {
  constructor(
    private readonly drivers: DriverRepository,
    private readonly vehicles: VehicleRepository,
    private readonly transfers: TransferRepository,
  ) {}

  listDrivers(): Driver[] {
    return this.drivers.list();
  }

  getDriver(id: number): Driver {
    const driver = this.drivers.findById(id);
    if (!driver) throw new NotFoundError(`Conductor ${id} no encontrado`);
    return driver;
  }

  createDriver(data: DriverCreate): Driver {
    return uniqueGuard(() => this.drivers.create(data), 'Ya existe un conductor con esa licencia');
  }

  updateDriver(id: number, data: DriverUpdate): Driver {
    this.getDriver(id);
    return uniqueGuard(() => this.drivers.update(id, data)!, 'Ya existe un conductor con esa licencia');
  }

  deleteDriver(id: number): void {
    this.getDriver(id);
    if (this.transfers.countByReference('driver_id', id) > 0) {
      throw new ConflictError('El conductor tiene traslados asociados; desactívalo en lugar de borrarlo');
    }
    this.drivers.delete(id);
  }

  listVehicles(): Vehicle[] {
    return this.vehicles.list();
  }

  getVehicle(id: number): Vehicle {
    const vehicle = this.vehicles.findById(id);
    if (!vehicle) throw new NotFoundError(`Vehículo ${id} no encontrado`);
    return vehicle;
  }

  createVehicle(data: VehicleCreate): Vehicle {
    return uniqueGuard(() => this.vehicles.create(data), 'Ya existe un vehículo con esa matrícula');
  }

  updateVehicle(id: number, data: VehicleUpdate): Vehicle {
    this.getVehicle(id);
    return uniqueGuard(() => this.vehicles.update(id, data)!, 'Ya existe un vehículo con esa matrícula');
  }

  deleteVehicle(id: number): void {
    this.getVehicle(id);
    if (this.transfers.countByReference('vehicle_id', id) > 0) {
      throw new ConflictError('El vehículo tiene traslados asociados; desactívalo en lugar de borrarlo');
    }
    this.vehicles.delete(id);
  }
}

function uniqueGuard<T>(fn: () => T, message: string): T {
  try {
    return fn();
  } catch (error) {
    if (isUniqueViolation(error)) throw new ConflictError(message);
    throw error;
  }
}
