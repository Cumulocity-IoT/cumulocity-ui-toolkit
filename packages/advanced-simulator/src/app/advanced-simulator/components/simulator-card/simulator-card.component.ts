import { Component, EventEmitter, inject, Input, OnInit, Output } from '@angular/core';
import { Router } from '@angular/router';
import { Alert, AlertService, ModalService } from '@c8y/ngx-components';
import { TranslateService } from '@ngx-translate/core';
import { CustomSimulator } from '../../models/simulator.model';
import { SimulatorsBackendService } from '../../services/simulators-backend.service';
import { SimulatorsServiceService } from '../../services/simulators-service.service';

@Component({
  selector: 'app-simulator-card',
  templateUrl: './simulator-card.component.html',
  styleUrl: './simulator-card.component.scss',
})
export class SimulatorCardsComponent implements OnInit {
  private ngXmodalService = inject(ModalService);
  private simService = inject(SimulatorsServiceService);
  private router = inject(Router);
  private backend = inject(SimulatorsBackendService);
  private alertService = inject(AlertService);
  private translateService = inject(TranslateService);

  @Input() listClass: string;
  @Input() viewType: string;
  @Input() allSimulators: CustomSimulator[];
  @Output() handleClick = new EventEmitter<MouseEvent>();

  instructionTypes: {
    category: {
      icon: string;
      type: string;
      break: boolean;
    };
  }[] = [
    { category: { icon: 'sliders', type: 'measurements', break: false } },
    { category: { icon: 'bell', type: 'alarms', break: false } },
    { category: { icon: 'tasks', type: 'events', break: false } },
    { category: { icon: 'clock-o', type: 'sleep', break: false } },
    { category: { icon: 'sitemap', type: 'smartRest', break: false } },
  ];

  onClickAddSimulator(event: MouseEvent) {
    this.handleClick.emit(event);
  }

  editSimulator(simulator: CustomSimulator): void {
    this.router.navigate(['/createSim/' + simulator.id]);
  }

  onStateChange(simulator: CustomSimulator): void {
    simulator.c8y_DeviceSimulator.state === 'RUNNING'
      ? (simulator.c8y_DeviceSimulator.state = 'PAUSED')
      : (simulator.c8y_DeviceSimulator.state = 'RUNNING');

    this.simService.updateSimulatorManagedObject(simulator).then((res) => {
      const moId = res.id;

      this.backend.connectToSimulatorsBackend(simulator.c8y_DeviceSimulator, moId);
    });
  }

  deleteSimulatorPrompt(simulator: CustomSimulator): Promise<boolean> {
    return this.ngXmodalService
      .confirm(
        'Delete Simulator',
        'Do you want to delete the simulator "' +
          simulator.name +
          '"? This action cannot be undone.',
        'danger',
        {
          ok: 'Delete',
          cancel: 'Cancel',
        }
      )
      .then(
        () => {
          return this.deleteSimulator(simulator);
        },
        () => {
          // no actual handling required
          return false;
        }
      );
  }

  onDuplicateSelected(simulator: CustomSimulator): void {
    const copyDeviceSim = JSON.parse(JSON.stringify(simulator.c8y_DeviceSimulator));

    copyDeviceSim.name = simulator.name + ' #(copy)';

    const copyIndices = simulator.c8y_Indices;
    const copySeries = simulator.c8y_Series;
    const copySimulator: Partial<CustomSimulator> = {
      name: simulator.name + ' #(copy)',
      c8y_CustomSim: {},
      c8y_DeviceSimulator: copyDeviceSim,
      c8y_Indices: copyIndices,
      c8y_Series: copySeries,
    };

    this.simService.createCustomSimulator(copySimulator).then(
      () => {
        this.refreshList();
        this.alertService.add({
          text: this.translateService.instant('Simulator duplicated.'),
          type: 'success',
        } as Alert);
      },
      (error) => {
        this.alertService.add({
          text: this.translateService.instant(error),
          type: 'danger',
          timeout: 0,
        } as Alert);
      }
    );
  }

  refreshList(): void {
    if (this.viewType === 'simulators-view') {
      this.simService.getAllDevices().then((simulators) => {
        this.allSimulators = (simulators as CustomSimulator[]).sort((entry1, entry2) => {
          const val1 = entry1.name.toLowerCase();
          const val2 = entry2.name.toLowerCase();

          return val1 < val2 ? -1 : val1 > val2 ? 1 : 0;
        });
      });
    }
  }

  private deleteSimulator(simulator: CustomSimulator): Promise<boolean> {
    return this.simService.deleteManagedObject(simulator.id).then(
      () => {
        const pos = this.allSimulators.findIndex((entry) => entry.id === simulator.id);

        this.allSimulators.splice(pos, 1);

        this.refreshList();
        this.alertService.add({
          text: this.translateService.instant('Simulator deleted.'),
          type: 'success',
        } as Alert);

        return true;
      },
      (error) => {
        this.alertService.add({
          text: this.translateService.instant(error),
          type: 'danger',
          timeout: 0,
        } as Alert);

        return false;
      }
    );
  }
}
