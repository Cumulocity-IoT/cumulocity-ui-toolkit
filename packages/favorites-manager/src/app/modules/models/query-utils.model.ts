export interface QueryFilter {
  [key: string]: unknown;
  __and?: Record<string, unknown>[];
  __or?: Record<string, unknown>[];
  __eq?: { [key: string]: string | number | boolean };
  __has?: string;
}
