import { FormlyFieldConfig } from '@ngx-formly/core';
import { startOfDay, startOfMonth, startOfWeek, startOfYear, subDays, subMonths, subYears } from 'date-fns';

/**
 * Supported relative date presets used by query-form select fields.
 */
export type FormlyDateValue =
  | 'now'
  | 'today'
  | 'yesterday'
  | 'this-week'
  | 'last-3-days'
  | 'week-ago'
  | 'last-2-weeks'
  | 'this-month'
  | 'last-30-days'
  | 'month-ago'
  | 'last-3-months'
  | 'last-6-months'
  | 'this-year'
  | 'year-ago';

const DATE_VALUES: FormlyDateValue[] = [
  'now',
  'today',
  'yesterday',
  'this-week',
  'last-3-days',
  'week-ago',
  'last-2-weeks',
  'this-month',
  'last-30-days',
  'month-ago',
  'last-3-months',
  'last-6-months',
  'this-year',
  'year-ago',
];

/**
 * Type guard to check whether a string matches a supported date preset.
 */
export function isFormlyDateValue(value: string): value is FormlyDateValue {
  return DATE_VALUES.includes(value as FormlyDateValue);
}

/**
 * Shared select options for date-based query blocks.
 */
export const DATE_OPTIONS = [
  { value: 'now', label: 'Now' },
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'this-week', label: 'This week' },
  { value: 'last-3-days', label: 'Last 3 days' },
  { value: 'week-ago', label: 'A week ago' },
  { value: 'last-2-weeks', label: 'Last 2 weeks' },
  { value: 'this-month', label: 'This month' },
  { value: 'last-30-days', label: 'Last 30 days' },
  { value: 'month-ago', label: 'A month ago' },
  { value: 'last-3-months', label: 'Last 3 months' },
  { value: 'last-6-months', label: 'Last 6 months' },
  { value: 'this-year', label: 'This year' },
  { value: 'year-ago', label: 'A year ago' },
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
    type: 'relative-date',
    defaultValue: 'today',
    props: {
      label: meta.label,
      description: meta.description,
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
    type: 'relative-date',
    defaultValue: 'now',
    props: {
      label: meta.label,
      description: meta.description,
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
  const now = new Date();

  switch (value) {
    case 'now':
      return now;

    case 'today':
      return startOfDay(now);

    case 'yesterday':
      return startOfDay(subDays(now, 1));

    case 'this-week':
      return startOfDay(startOfWeek(now, { weekStartsOn: 1 }));

    case 'last-3-days':
      return startOfDay(subDays(now, 3));

    case 'week-ago':
      return startOfDay(subDays(now, 7));

    case 'last-2-weeks':
      return startOfDay(subDays(now, 14));

    case 'this-month':
      return startOfMonth(now);

    case 'last-30-days':
      return startOfDay(subDays(now, 30));

    case 'month-ago':
      return subMonths(now, 1);

    case 'last-3-months':
      return subMonths(now, 3);

    case 'last-6-months':
      return subMonths(now, 6);

    case 'this-year':
      return startOfYear(now);

    case 'year-ago':
      return subYears(now, 1);

    default:
      throw new Error('Invalid value provided.');
  }
}

/**
 * Replaces supported date presets in an object with ISO timestamp strings.
 */
export function normalizeQueryFilter(params: object): object {
  const result = { ...params } as Record<string, unknown>;

  for (const key of Object.keys(result)) {
    const value = result[key];

    if (isFormlyDateValue(value as string)) {
      result[key] = getDateFromValue(value as FormlyDateValue).toISOString();
    }
  }

  return result;
}
