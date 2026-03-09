import { TestBed } from '@angular/core/testing';
import { RadialGaugeService } from './radial-gauge.service';
import { MeasurementService } from '@c8y/client';

describe('RadialGaugeService', () => {
  let service: RadialGaugeService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [RadialGaugeService, MeasurementService],
    });

    service = TestBed.inject(RadialGaugeService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
