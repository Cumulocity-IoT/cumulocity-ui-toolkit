/*
 * Copyright (c) 2022 Software AG, Darmstadt, Germany and/or Software AG USA Inc., Reston, VA, USA,
 * and/or its subsidiaries and/or its affiliates and/or their licensors.
 *
 * SPDX-License-Identifier: Apache-2.0
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @authors Christof Strack
 */

import {
  Component,
  ElementRef,
  Input,
  type OnInit,
  type OnDestroy,
  ViewChild,
  Output,
  EventEmitter,
  forwardRef,
  ChangeDetectionStrategy,
  ViewEncapsulation,
  inject,
} from '@angular/core';
import JSONEditor, { type EditableNode, type JSONPath, type SerializableNode } from 'jsoneditor';
import { type ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import {
  type JsonEditorOptions,
  type JsonEditorMode,
  type JsonEditorTreeNode,
  type IError,
  createJsonEditorOptions,
} from './jsoneditor-options';
import { isEmpty } from 'lodash';

@Component({
  selector: 'mapping-json-editor',
  template: `<div #jsonEditorContainer [id]="id"></div>`,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => JsonEditorComponent),
      multi: true,
    },
  ],
  preserveWhitespaces: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrls: [
    './jsoneditor.component.less',
    '../../../../../../../node_modules/jsoneditor/dist/jsoneditor.min.css',
  ],
  encapsulation: ViewEncapsulation.None,
  standalone: true,
})
export class JsonEditorComponent implements ControlValueAccessor, OnInit, OnDestroy {
  public id = 'angjsoneditor' + Math.floor(Math.random() * 1000000);
  disabled = false;
  isFocused = false;

  public optionsChanged = false;

  @ViewChild('jsonEditorContainer', { static: true })
  jsonEditorContainer!: ElementRef<HTMLDivElement>;

  @Input() options: JsonEditorOptions = createJsonEditorOptions();

  @Input() debug = false;

  /** The parsed content after every change (not emitted while the text is invalid JSON). */
  @Output()
  change = new EventEmitter<unknown>();

  /** Kept for API compatibility with the upstream component; never emitted. */
  @Output()
  onInit = new EventEmitter<void>();

  @Output()
  jsonChange = new EventEmitter<unknown>();

  @Output()
  textChange = new EventEmitter<string>();

  @Output()
  onPathChanged = new EventEmitter<string>();

  private editor?: JSONEditor;
  /** The options the current editor was created with, reused when only the data changes. */
  private appliedOptions?: JsonEditorOptions;
  private selectionList: HTMLElement[] = [];
  private _data: unknown = {};
  private elementRef = inject<ElementRef<HTMLElement>>(ElementRef);

  @Input()
  set data(value: unknown) {
    this._data = value;

    if (this.editor) {
      this.editor.destroy();
      this.ngOnInit();
    }
  }

  ngOnInit() {
    let optionsBefore = this.options;

    if (!this.optionsChanged && this.appliedOptions) {
      optionsBefore = this.appliedOptions;
    }

    if (!this.options.onChangeText) {
      this.options.onChangeText = (text) => this.onChangeText(text);
    }

    if (!this.options.onChangeJSON) {
      this.options.onChangeJSON = () => this.onChangeJSON();
    }

    if (!this.options.onChange) {
      this.options.onChange = () => this.onChange();
    }

    if (!this.options.onEvent) {
      this.options.onEvent = (node, event) => this.delegateSetSelection(node, event);
    }

    if (!this.options.onBlur) {
      this.options.onBlur = () => this.onTouched();
    }

    // expandAll is applied by this wrapper; jsoneditor rejects options it does not know
    const { expandAll: _expandAll, ...optionsCopy } = optionsBefore;

    // jsoneditor warns about onChangeJSON in the text modes, where it never fires
    if (optionsCopy.mode === 'text' || optionsCopy.mode === 'code') {
      delete optionsCopy.onChangeJSON;
    }
    this.editor = new JSONEditor(this.jsonEditorContainer.nativeElement, optionsCopy, this._data);
    this.appliedOptions = optionsCopy;

    if (this.options.expandAll) {
      this.editor.expandAll();
    }
  }

  ngOnDestroy() {
    this.destroy();
  }

  hasObservers(eventEmitter: { readonly observed: boolean }): boolean {
    return eventEmitter.observed;
  }

  // ControlValueAccessor implementation
  writeValue(value: unknown) {
    this.data = value;
  }

  // Implemented as part of ControlValueAccessor
  registerOnChange(fn: (value: unknown) => void) {
    this.onChangeModel = fn;
  }

  // Implemented as part of ControlValueAccessor.
  registerOnTouched(fn: () => void) {
    this.onTouched = fn;
  }

  // Implemented as part of ControlValueAccessor.
  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
  }

  public onChange() {
    if (this.editor) {
      try {
        const json: unknown = this.editor.get();

        this.onChangeModel(json);
        this.change.emit(json);
      } catch (e) {
        if (this.debug) {
          console.error(e);
        }
      }
    }
  }

  public onFocus() {
    // no-op; kept for API compatibility with the upstream component
  }

  public onChangeJSON() {
    if (this.editor) {
      try {
        this.jsonChange.emit(this.editor.get());
      } catch (e) {
        if (this.debug) {
          console.error(e);
        }
      }
    }
  }

  public onChangeText(text: string) {
    if (this.editor) {
      try {
        this.textChange.emit(text);
      } catch (e) {
        if (this.debug) {
          console.error(e);
        }
      }
    }
  }

  /**
   * JSON EDITOR FUNCTIONS
   */

  public collapseAll() {
    this.editor?.collapseAll();
  }

  public expandAll() {
    this.editor?.expandAll();
  }

  public focus() {
    this.editor?.focus();
  }

  public get(): unknown {
    return this.editor?.get();
  }

  public getMode(): JsonEditorMode | undefined {
    return this.editor?.getMode();
  }

  public getName(): string | undefined {
    return this.editor?.getName();
  }

  public getText(): string {
    return this.editor?.getText() ?? '';
  }

  public set(json: unknown) {
    this.editor?.set(json);
  }

  public setMode(mode: JsonEditorMode) {
    this.editor?.setMode(mode);
  }

  public setName(name: string) {
    this.editor?.setName(name);
  }

  public setSelection(start: { path: JSONPath }, end: { path: JSONPath }) {
    this.editor?.setSelection(start, end);
  }

  public getSelection(): { start: SerializableNode; end: SerializableNode } | undefined {
    return this.editor?.getSelection();
  }

  public setSchema(schema: object, schemaRefs?: object) {
    this.editor?.setSchema(schema, schemaRefs);
  }

  public setOptions(newOptions: JsonEditorOptions) {
    if (this.editor) {
      this.editor.destroy();
    }
    this.optionsChanged = true;
    this.options = newOptions;
    this.ngOnInit();
  }

  public update(json: unknown) {
    this.editor?.update(json);
  }

  public destroy() {
    this.editor?.destroy();
  }

  public getEditor(): JSONEditor | undefined {
    return this.editor;
  }

  public isValidJson() {
    try {
      JSON.parse(this.getText());

      return true;
    } catch {
      return false;
    }
  }

  public setSelectionToPath(path: string) {
    const levels = this.jsonPath2EditorPath(path);
    const selection = { path: levels };

    try {
      this.editor?.setSelection(selection, selection);
    } catch (error) {
      console.error('Set selection to path not possible:', levels, error);
    }

    if (this.hasObservers(this.onPathChanged)) {
      this.onPathChanged.emit(path);
    }
  }

  private delegateSetSelection(node: EditableNode, event: Event) {
    if (event.type === 'click') {
      // reset style on previously selected items
      for (const item of this.selectionList) {
        item.removeAttribute('style');
      }
      // set style on currently selected items
      this.selectionList = Array.from(
        this.elementRef.nativeElement.querySelectorAll<HTMLElement>('.jsoneditor-selected')
      );

      for (const item of this.selectionList) {
        item.setAttribute('style', `background: lightgrey;`);
      }
      const selection = { path: node.path };

      try {
        this.editor?.setSelection(selection, selection);
      } catch (error) {
        console.error('Set selection to path not possible:', node.path, error);
      }

      if (this.hasObservers(this.onPathChanged)) {
        this.onPathChanged.emit(this.editorPath2jsonPath(node.path));
      }
    }
  }

  // Implemented as part of ControlValueAccessor.
  private onTouched: () => void = () => undefined;

  // Implemented as part of ControlValueAccessor.
  private onChangeModel: (value: unknown) => void = () => undefined;

  private editorPath2jsonPath(levels: JSONPath): string {
    let path = '';

    levels.forEach((n) => {
      if (typeof n === 'number') {
        path = path.substring(0, path.length - 1);
        path += `[${String(n)}]`;
      } else {
        path += n;
      }
      path += '.';
    });
    path = path.replace(/\.$/g, '');

    if (path.startsWith('[')) {
      path = '$' + path;
    }

    return path;
  }

  private jsonPath2EditorPath(path: string): JSONPath {
    const ns = path.split('.');

    // if payload is an json array then we have to transform the path
    if (ns[0].startsWith('$')) {
      const patternIndex = /\[(-?\d*)\]/;
      const result = ns[0].match(patternIndex);

      if (result && result.length >= 2) {
        ns[0] = result[1];
      }
    }
    const levels: string[] = [];
    const patternArray = /^[^[]+/;
    const patternIndex = /(?<=\[)(-?\d*)(?=\])/;

    ns.forEach((l) => {
      const ar = l.match(patternArray);

      if (ar && !isEmpty(ar)) {
        levels.push(ar[0]);
      }

      const ind = l.match(patternIndex);

      if (ind && !isEmpty(ind)) {
        levels.push(ind[0]);
      }
    });

    return levels;
  }
}
export {
  createJsonEditorOptions,
  type JsonEditorOptions,
  type JsonEditorMode,
  type JsonEditorTreeNode,
  type IError,
};
