import { HttpClient, HttpHeaders } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { CustomSimulator } from '../models/simulator.model';
import { SimulatorsServiceService } from './simulators-service.service';

@Injectable()
export class SimulatorsBackendService {
  private http = inject(HttpClient);
  private simulatorService = inject(SimulatorsServiceService);

  connectToSimulatorsBackend(resultTemplate, managedObjectId) {
    const url = `/service/device-simulator/simulators/${managedObjectId}`;
    const httpOptions = {
      headers: new HttpHeaders({
        'Content-Type': 'application/json',
      }),
    };

    this.http.put(url, resultTemplate, httpOptions).subscribe();
  }

  createSimulator(simulator: Partial<CustomSimulator>): Promise<any> {
    const url = `/service/device-simulator/simulators`;
    const httpOptions = {
      headers: new HttpHeaders({
        'Content-Type': 'application/json',
      }),
    };
    return this.http.post(url, simulator, httpOptions).toPromise();
  }

  addCustomSimulatorProperties(simulator: Partial<CustomSimulator>) {
    return this.simulatorService.updateSimulatorManagedObject(simulator);
  }
}
