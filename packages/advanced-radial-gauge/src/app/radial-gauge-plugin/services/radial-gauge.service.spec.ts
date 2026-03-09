import { TestBed } from '@angular/core/testing';
import { RadialGaugeService } from './radial-gauge.service';

describe('RadialGaugeService', () => {
  let service: RadialGaugeService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [RadialGaugeService],
    });

    service = TestBed.inject(RadialGaugeService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
