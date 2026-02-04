import {
  Component,
  effect,
  EventEmitter,
  Input,
  OnChanges,
  OnInit,
  Output,
  signal,
  SimpleChanges,
  ViewChild,
} from '@angular/core';
import { EditorComponent, MonacoEditorMarkerValidatorDirective } from '@c8y/ngx-components/editor';
import { FormGroupComponent, MessagesComponent } from '@c8y/ngx-components';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
@Component({
  selector: 'operations-editor',
  templateUrl: './operations-editor.component.html',
  standalone: true,
  imports: [
    EditorComponent,
    MessagesComponent,
    FormGroupComponent,
    ReactiveFormsModule,
    MonacoEditorMarkerValidatorDirective,
  ],
})
export class OperationsEditorComponent implements OnInit, OnChanges {
  @Input() supportedOperation: string;
  @Input() value: string;
  @Output() valueChange = new EventEmitter<string>();

  protected code = signal<string>('');
  private timeout: NodeJS.Timeout;

  @ViewChild(EditorComponent) editorComponent!: EditorComponent;
  form: FormGroup;
  isValidJson: boolean;

  options: EditorComponent['editorOptions'] = {
    hover: {
      above: false,
    },
  };

  constructor() {
    effect(() => {
      const value = this.code();

      clearTimeout(this.timeout);
      this.timeout = setTimeout(() => {
        this.notifyIfValid(value); // emit after 200ms of inactivity
      }, 200);
    });
  }

  updateCode(value: string) {
    this.code.set(value);
  }

  ngOnInit() {
    const json = JSON.parse(this.value) as Record<string, unknown>;

    if (!json[this.supportedOperation]) {
      json[this.supportedOperation] = { example: '{{test}}' };
    }

    const jsonStr = JSON.stringify(
      json, // { deviceId: this.deviceId, [this.supportedOperation]: { example: '{{test}}' } }
      undefined,
      2
    );

    this.form = new FormGroup({
      jsonEditor: new FormControl(jsonStr),
    });

    this.notifyIfValid(jsonStr);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['supportedOperation'] && !changes['supportedOperation'].firstChange) {
      const previous = changes['supportedOperation'].previousValue as string;
      const current = changes['supportedOperation'].currentValue as string;

      if (this.value && previous !== current) {
        const json = JSON.parse(this.value) as Record<string, unknown>;

        let prevValue: unknown = null;

        if (previous && json[previous]) {
          prevValue = json[previous];
          delete json[previous];
        }

        json[current] = prevValue ?? { example: '{{test}}' };
        const value = JSON.stringify(json, undefined, 2);

        setTimeout(() => this.assignSchema());

        this.form?.get('jsonEditor')?.setValue(value, { emitEvent: false });
      }
    }
  }

  assignSchema() {
    const schema = {
      $schema: 'http://json-schema.org/draft-07/schema#',
      title: 'Operation',
      type: 'object',
      properties: {
        deviceId: {
          type: 'string',
        },
        [`${this.supportedOperation}`]: {},
      },
      required: ['deviceId', this.supportedOperation],
      additionalProperties: true,
    } as const;

    this.editorComponent.monaco?.json?.jsonDefaults?.setDiagnosticsOptions({
      validate: true,
      schemas: [{ schema, fileMatch: ['*'], uri: 'editor-json-sample' }],
      enableSchemaRequest: false,
      allowComments: false,
    });
  }

  notifyIfValid(value: string) {
    if (value?.length && this.form.valid) {
      try {
        JSON.parse(value);
        this.valueChange.emit(value);
      } catch (e) {
        console.warn('JSON parse failed for value: ' + value, e);
      }
    }
  }
}
