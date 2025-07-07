import { Column } from '@c8y/ngx-components';
import { has } from 'lodash';

export interface SearchColumn extends Column {
  searchable?: boolean;
}

export function hasSearchableConfig(column: Column): column is SearchColumn {
  return has(column, 'searchable');
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
