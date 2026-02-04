export interface QueryFilter {
  __and?: object[];
  __or?: object[];
  __eq?: { [key: string]: string | number | boolean };
  __has?: string;
}
