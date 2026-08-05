import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CoreModule } from '@c8y/ngx-components';
import { QueryBuilderFormComponent } from './query-builder-form.component';

/**
 * Primarily a JIT template-compilation guard: the recursive `ng-template`
 * editor must compile and render without runtime template errors. Also covers
 * the parse-on-init and builder/raw round-trip behaviour.
 */
describe('QueryBuilderFormComponent', () => {
  let fixture: ComponentFixture<QueryBuilderFormComponent>;
  let component: QueryBuilderFormComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CoreModule.forRoot(), QueryBuilderFormComponent],
    }).compileComponents();
  });

  function create(filter: Record<string, unknown>): void {
    fixture = TestBed.createComponent(QueryBuilderFormComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('filter', filter);
    fixture.detectChanges();
  }

  it('compiles and renders an empty builder', () => {
    create({});
    expect(component).toBeTruthy();
    expect(component.mode).toBe('builder');
    expect(component.root).toEqual({ kind: 'and', children: [] });
  });

  it('parses an existing query into the tree on init', () => {
    create({ query: "has(c8y_Position) and type eq 'Pump'" });
    expect(component.mode).toBe('builder');
    expect(component.root.kind).toBe('and');
    expect(component.root.children?.length).toBe(2);
  });

  it('falls back to raw mode for an unparseable query', () => {
    create({ query: 'type eq' });
    expect(component.mode).toBe('raw');
    expect(component.parseError).toBe(true);
  });

  it('serialises builder edits back to filter[query]', () => {
    create({});
    component.addChild(component.root);
    const cmp = component.root.children![0];

    cmp.field = 'type';
    cmp.value = 'Pump';
    component.emit();
    expect(component.filter()['query']).toBe("type eq 'Pump'");
  });

  it('removes the query key when the tree is empty', () => {
    create({ query: "type eq 'Pump'" });
    component.root.children = [];
    component.emit();
    expect(component.filter()['query']).toBeUndefined();
  });

  it('switches to raw and back preserving the query', () => {
    create({ query: "has(c8y_Position) and type eq 'Pump'" });
    component.switchToRaw();
    expect(component.mode).toBe('raw');
    expect(component.rawValue).toContain('has(c8y_Position)');
    component.switchToBuilder();
    expect(component.mode).toBe('builder');
    expect(component.root.children?.length).toBe(2);
  });
});
