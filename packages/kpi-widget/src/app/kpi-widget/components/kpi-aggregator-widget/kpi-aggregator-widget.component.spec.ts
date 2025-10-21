import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { KpiAggregatorWidgetComponent } from './kpi-aggregator-widget.component';

describe('KpiAggregatorWidgetComponent', () => {
  let fixture: ComponentFixture<KpiAggregatorWidgetComponent>;
  let component: KpiAggregatorWidgetComponent;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [],
    });
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(KpiAggregatorWidgetComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should update template when @Input changes', () => {
    component.config = {
      query: '',
      pageSize: 10,
      pageLimit: 1,
      color: '#000',
      opacity: 0.3,
      showMeta: false,
      display: 'count',
      sort: 'label',
      order: 'asc',
      percent: true,
      runOnLoad: true,
      parallelRequests: 1,
    };

    fixture.detectChanges();

    const el = fixture.debugElement.query(By.css('[data-testid="someInput"]'));

    expect(el.nativeElement.textContent).toContain('test value');
  });
});
