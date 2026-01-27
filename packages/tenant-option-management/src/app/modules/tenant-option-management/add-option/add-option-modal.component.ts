import { Component, inject } from '@angular/core';
import { ITenantOption } from '@c8y/client';
import { BsModalRef } from 'ngx-bootstrap/modal';
import { Subject } from 'rxjs';
import { TenantOptionManagementService } from '../tenant-option-management.service';
import { TenantOptionRow } from '../model';
import { CoreModule } from '@c8y/ngx-components';
import { JsonEditorComponent } from '../editor/jsoneditor.component';

interface Tab {
  id: 'text' | 'json';
  label: string;
  icon?: string;
  active?: boolean;
  disabled?: boolean;
}

@Component({
  templateUrl: './add-option-modal.component.html',
  styleUrls: ['./add-option-modal.component.less'],
  standalone: true,
  imports: [CoreModule, JsonEditorComponent],
})
export class AddOptionModalComponent {
  closeSubject: Subject<TenantOptionRow> = new Subject();

  option: ITenantOption | TenantOptionRow = {
    key: '',
    category: '',
    value: '',
  };

  tabs: Tab[] = [
    {
      id: 'text',
      label: 'Text',
      icon: 'text',
      active: true,
    },
    {
      id: 'json',
      label: 'JSON',
      icon: 'json',
      active: false,
    },
  ];

  currentTab: Tab['id'] = this.tabs.find((t) => t.active)?.id ?? this.tabs[0].id;

  jsonEditorData: object = {};
  jsonErrorMessage: string;
  isEditing = false;
  ids: string[];
  showConflictError = false;

  isLoading = false;
  apiError?: string;

  private modal = inject(BsModalRef);
  private optionsService = inject(TenantOptionManagementService);

  setOption(row: TenantOptionRow) {
    this.isEditing = true;
    this.option = row;
    let tabId: 'text' | 'json' = 'json';

    try {
      // boolean values and numberic values should be handled as text
      if (this.isBooleanValue(this.option.value) || this.isNumberValue(this.option.value)) {
        throw new Error('Not valid JSON!');
      }

      this.jsonEditorData = JSON.parse(this.option.value) as object;
    } catch (e) {
      tabId = 'text';
    }

    this.tabs.map((t) => {
      t.active = t.id === tabId;
    });
    this.currentTab = tabId;
  }

  changeTab(tabId: Tab['id']): void {
    this.tabs.map((t) => {
      t.active = t.id === tabId;
    });
    this.currentTab = tabId;
    this.option.value = '';

    delete this.jsonErrorMessage;
  }

  onJSONChange(text: string) {
    try {
      JSON.parse(text);
      this.option.value = text;
      this.jsonErrorMessage = '';
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (e) {
      this.jsonErrorMessage = 'No valid JSON!';
    }
  }

  validateExistence() {
    if (!this.isEditing && this.option.category && this.option.key) {
      const id = `${this.option.category}-${this.option.key}`;

      this.showConflictError = this.ids.includes(id);
    }
  }

  async save() {
    try {
      this.isLoading = true;
      delete this.apiError;
      let row: TenantOptionRow;

      if (this.isEditing) {
        row = await this.optionsService.updateOption(this.option as TenantOptionRow);
      } else {
        row = await this.optionsService.addOption(this.option);
      }
      this.closeSubject.next(row);
      this.modal.hide();
    } catch (e) {
      if (typeof e === 'string') {
        this.apiError = e;
      } else if (typeof e === 'object') {
        this.apiError = JSON.stringify(e);
      }
    } finally {
      this.isLoading = false;
    }
  }

  close() {
    this.closeSubject.next(null);
    this.modal.hide();
  }

  private isBooleanValue(value: string): boolean {
    return ['true', 'false'].includes(value.toLowerCase());
  }

  private isNumberValue(value: string): boolean {
    return !isNaN(Number(value));
  }
}
