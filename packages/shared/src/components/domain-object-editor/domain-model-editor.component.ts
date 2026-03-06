import {
  Component,
  effect,
  EventEmitter,
  Input,
  OnInit,
  Output,
  signal,
  SimpleChanges,
  ViewChild,
} from '@angular/core';
import { EditorComponent, MonacoEditorMarkerValidatorDirective } from '@c8y/ngx-components/editor';
import { CoreModule, FormGroupComponent, MessagesComponent } from '@c8y/ngx-components';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { DOMAIN_MODEL_TEMPLATES_C8Y } from './domain-model-samples';
import { OPERATION_SCHEMA } from './operation-schema';
import { ALARM_SCHEMA } from './alarm-schema';
import { EVENT_SCHEMA } from './event-schema';
@Component({
  selector: 'domain-model-editor',
  templateUrl: './domain-model-editor.component.html',
  standalone: true,
  imports: [
    CoreModule,
    EditorComponent,
    MessagesComponent,
    FormGroupComponent,
    ReactiveFormsModule,
    MonacoEditorMarkerValidatorDirective,
  ],
})
export class DomainModelEditorComponent implements OnInit {
  @Input() domainModel: 'alarm' | 'event' | 'operation' | 'json' = 'operation';
  @Input() value: string;
  @Output() valueChange = new EventEmitter<string>();
  @Output() isValidChange = new EventEmitter<boolean>();

  protected code = signal<string>('');
  private timeout: NodeJS.Timeout;

  @ViewChild(EditorComponent) editorComponent!: EditorComponent;
  form: FormGroup = new FormGroup({ jsonEditor: new FormControl('') });
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
    let json: Record<string, unknown> | undefined;

    try {
      json = JSON.parse(this.value) as Record<string, unknown>;
    } catch {
      json = undefined;
    }

    if (!json) {
      json = this.getDefaultJSONForDomainModel();
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
    if (changes['domainModel'] && !changes['domainModel'].firstChange) {
      const previous = changes['domainModel'].previousValue as string;
      const current = changes['domainModel'].currentValue as string;

      if (previous !== current) {
        const json = this.getDefaultJSONForDomainModel();
        const jsonStr = JSON.stringify(
          json,
          undefined,
          2
        );

        this.form?.get('jsonEditor')?.setValue(jsonStr, { emitEvent: false });

        setTimeout(() => this.assignSchema());
      }
    }
  }

  assignSchema() {
    console.warn('Assigning schema for domain model: ' + this.domainModel);

    if (this.domainModel === 'json') {
      return;
    }
    let schema = {};

    if (this.domainModel === 'operation') {
      schema = OPERATION_SCHEMA;
    } else if (this.domainModel === 'alarm') {
      schema = ALARM_SCHEMA;
    } else if (this.domainModel === 'event') {
      schema = EVENT_SCHEMA;
    }

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
        this.isValidChange.emit(true);

        return;
      } catch (e) {
        console.warn('JSON parse failed for value: ' + value, e);
      }
    }
    this.isValidChange.emit(false);
  }

  private getDefaultJSONForDomainModel() {
    if (this.domainModel === 'operation') {
      return DOMAIN_MODEL_TEMPLATES_C8Y.OPERATION;
    } else if (this.domainModel === 'alarm') {
      return DOMAIN_MODEL_TEMPLATES_C8Y.ALARM;
    } else if (this.domainModel === 'event') {
      return DOMAIN_MODEL_TEMPLATES_C8Y.EVENT;
    } else {
      return {};
    }
  }
}
