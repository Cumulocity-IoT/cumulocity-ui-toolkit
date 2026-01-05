import { FormlyFieldConfig } from '@ngx-formly/core';

export type FormlyDateValue =
  | 'today'
  | 'now'
  | 'this-week'
  | 'week-ago'
  | 'this-month'
  | 'month-ago';

export function isFormlyDateValue(value: string): value is FormlyDateValue {
  return ['today', 'now', 'this-week', 'week-ago', 'this-month', 'month-ago'].includes(value);
}

export const DATE_OPTIONS = [
  { value: 'today', label: 'Today' },
  { value: 'now', label: 'Now' },
  { value: 'this-week', label: 'This week' },
  { value: 'week-ago', label: 'A week ago' },
  { value: 'this-month', label: 'This month' },
  { value: 'month-ago', label: 'A month ago' },
] as const;

export function getDateFromBlock(meta: {
  key: string;
  label: string;
  description: string;
}): FormlyFieldConfig {
  return {
    key: meta.key,
    type: 'select',
    defaultValue: 'today',
    templateOptions: {
      label: meta.label,
      description: meta.description,
      options: [...DATE_OPTIONS],
    },
  };
}

export function getDateToBlock(meta: {
  key: string;
  label: string;
  description: string;
}): FormlyFieldConfig {
  return {
    key: meta.key,
    type: 'select',
    defaultValue: 'now',
    templateOptions: {
      label: meta.label,
      description: meta.description,
      options: [...DATE_OPTIONS],
    },
  };
}

export function getTextInputBlock(meta: {
  key: string;
  label: string;
  description: string;
  placeholder?: string;
}) {
  return {
    key: meta.key,
    type: 'input',
    templateOptions: {
      label: meta.label,
      placeholder: meta.placeholder ?? '',
      description: meta.description,
    },
  };
}
