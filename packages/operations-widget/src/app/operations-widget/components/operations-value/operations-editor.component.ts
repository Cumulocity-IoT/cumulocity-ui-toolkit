import {
  Component,
  EventEmitter,
  Input,
  OnChanges,
  OnInit,
  Output,
  SimpleChanges,
  ViewChild,
} from '@angular/core';
import { EditorComponent, MonacoEditorMarkerValidatorDirective } from '@c8y/ngx-components/editor';
import { FormGroupComponent, MessagesComponent, throttle } from '@c8y/ngx-components';
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
  @Input() readonly value: string;
  @Output() valueChange = new EventEmitter<string>();

  @ViewChild(EditorComponent) editorComponent!: EditorComponent;
  form: FormGroup;
  isValidJson: boolean;

  options: EditorComponent['editorOptions'] = {
    hover: {
      above: false,
    },
  };

  ngOnInit() {
    const json = JSON.parse(this.value) as Record<string, unknown>;

    if (!json[this.supportedOperation]) {
      json[this.supportedOperation] = { example: '{{test}}' };
    }

    this.form = new FormGroup({
      jsonEditor: new FormControl(
        JSON.stringify(
          json, // { deviceId: this.deviceId, [this.supportedOperation]: { example: '{{test}}' } }
          undefined,
          2
        )
      ),
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['supportedOperation'] && !changes['supportedOperation'].firstChange) {
      if (this.value) {
        const json = JSON.parse(this.value) as Record<string, unknown>;
        const previous = changes['supportedOperation'].previousValue as string;
        let prevValue: unknown = null;

        if (previous && json[previous]) {
          prevValue = json[previous];
          delete json[previous];
        }
        const current = changes['supportedOperation'].currentValue as string;

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

  @throttle(200)
  jsonChange(value: string) {
    if (this.form.valid) {
      try {
        JSON.parse(value);
        this.valueChange.emit(value);
      } catch (e) {
        console.warn(e);
      }
    }
  }
}
