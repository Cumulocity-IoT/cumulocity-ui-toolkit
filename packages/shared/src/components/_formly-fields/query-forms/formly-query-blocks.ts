import { FormlyFieldConfig } from '@ngx-formly/core';
import { get, set } from 'lodash';
import { startOfDay, startOfWeek, subDays, subMonths } from 'date-fns';

/**
 * Supported relative date presets used by query-form select fields.
 */
export type FormlyDateValue =
  | 'today'
  | 'now'
  | 'this-week'
  | 'week-ago'
  | 'this-month'
  | 'month-ago';

/**
 * Type guard to check whether a string matches a supported date preset.
 */
export function isFormlyDateValue(value: string): value is FormlyDateValue {
  return ['today', 'now', 'this-week', 'week-ago', 'this-month', 'month-ago'].includes(value);
}

/**
 * Shared select options for date-based query blocks.
 */
export const DATE_OPTIONS = [
  { value: 'today', label: 'Today' },
  { value: 'now', label: 'Now' },
  { value: 'this-week', label: 'This week' },
  { value: 'week-ago', label: 'A week ago' },
  { value: 'this-month', label: 'This month' },
  { value: 'month-ago', label: 'A month ago' },
] as const;

/**
 * Creates a Formly "from" date select block with a default of `today`.
 */
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

/**
 * Creates a Formly "to" date select block with a default of `now`.
 */
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

/**
 * Creates a Formly text input block for free-form query values.
 */
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

/**
 * Converts a relative date preset into an absolute date value.
 */
export function getDateFromValue(value: FormlyDateValue): Date {
  const currentDate = new Date();

  switch (value) {
    case 'today':
      return startOfDay(currentDate);

    case 'now':
      return currentDate;

    case 'this-week': {
      const startOfCurrentWeek = startOfWeek(currentDate, { weekStartsOn: 1 });
      return startOfDay(startOfCurrentWeek);
    }

    case 'week-ago':
      return subDays(currentDate, 7);

    case 'this-month':
      return new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);

    case 'month-ago':
      return subMonths(currentDate, 1);

    default:
      throw new Error('Invalid value provided.');
  }
}

/**
 * Replaces supported date presets in an object with ISO timestamp strings.
 */
export function normalizeQueryFilter(params: object) {
  for (const key of Object.keys(params)) {
    const value: unknown = get(params, key);

    if (isFormlyDateValue(value as string)) {
      set(params, key, getDateFromValue(value as FormlyDateValue).toISOString());
    }
  }

  return params;
}
