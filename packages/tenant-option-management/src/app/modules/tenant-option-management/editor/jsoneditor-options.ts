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
import type { EditableNode, JSONEditorMode, JSONEditorOptions, ValidationError } from 'jsoneditor';

export type JsonEditorMode = JSONEditorMode;
export type JsonEditorTreeNode = EditableNode;
export type IError = ValidationError;

/**
 * The options of `jsoneditor` (typed by `@types/jsoneditor`), plus `expandAll`, which the
 * wrapper component applies itself after creating the editor.
 */
export type JsonEditorOptions = JSONEditorOptions & { expandAll?: boolean };

/** The wrapper's defaults: code mode, no main menu bar, history and search on. */
export function createJsonEditorOptions(): JsonEditorOptions {
  return {
    mainMenuBar: false,
    enableSort: true,
    enableTransform: true,
    escapeUnicode: false,
    expandAll: false,
    sortObjectKeys: false,
    history: true,
    mode: 'code',
    search: true,
    indentation: 2,
  };
}
