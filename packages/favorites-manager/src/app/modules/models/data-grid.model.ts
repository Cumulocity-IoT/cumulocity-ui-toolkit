import { Column } from '@c8y/ngx-components';

export interface SearchColumn extends Column {
  searchable?: boolean;
}

export function hasSearchableConfig(column: Column): column is SearchColumn {
  return column && Object.hasOwn(column, 'searchable');
}

export type ColumnSortingConfig = {
  pathSortingConfigs: PathSortingConfig[];
};

export interface PathSortingConfig {
  path: string;
  sortOrderModifier?: SortOrderModifier;
}

export const enum SortOrderModifier {
  Keep,
  Invert,
}
