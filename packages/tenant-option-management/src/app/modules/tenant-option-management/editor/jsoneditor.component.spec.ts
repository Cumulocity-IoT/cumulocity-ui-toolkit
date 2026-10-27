import { TestBed } from '@angular/core/testing';
import { JsonEditorComponent } from './jsoneditor.component';

describe('JsonEditorComponent (forms binding)', () => {
  function create(): JsonEditorComponent {
    const fixture = TestBed.createComponent(JsonEditorComponent);

    fixture.componentInstance.options = { mode: 'tree' };
    fixture.detectChanges();

    return fixture.componentInstance;
  }

  beforeEach(() =>
    TestBed.configureTestingModule({ imports: [JsonEditorComponent] }).overrideComponent(
      JsonEditorComponent,
      // its template is a plain container; CoreModule would need the whole shell
      { set: { imports: [] } }
    )
  );

  it('reports the edited JSON to the form control', () => {
    const editor = create();
    const onChange = jasmine.createSpy('onChange');

    editor.registerOnChange(onChange);
    editor.set({ answer: 42 });
    editor.onChange();

    expect(onChange).toHaveBeenCalledWith({ answer: 42 });
  });

  it('marks the form control as touched when the editor loses focus', () => {
    const editor = create();
    const onTouched = jasmine.createSpy('onTouched');

    editor.registerOnTouched(onTouched);
    editor.options.onBlur?.({ type: 'blur', target: document.body } as never);

    expect(onTouched).toHaveBeenCalled();
  });

  it('round-trips the text of valid JSON', () => {
    const editor = create();

    editor.set({ a: [1, 2] });

    expect(editor.isValidJson()).toBeTrue();
    expect(editor.get()).toEqual({ a: [1, 2] });
  });
});
