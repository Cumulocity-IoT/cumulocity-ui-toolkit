import { BaseColumn, getBasicInputArrayFormFieldConfig, gettext } from '@c8y/ngx-components';
import { TypeCellRendererComponent } from './type.cell-renderer.component';

export class TypeColumn extends BaseColumn {
  constructor() {
    super();

    this.name = 'type';
    this.path = 'type';
    this.header = gettext('Type');
    this.resizable = false;
    this.cellRendererComponent = TypeCellRendererComponent;

    this.filterable = true;
    this.filteringConfig = {
      fields: getBasicInputArrayFormFieldConfig({
        key: 'types',
        label: gettext('Show items with type'),
        addText: gettext('Add next`type`'),
        tooltip: gettext('Use * as a wildcard character'),
        placeholder: 'c8y_MQTTDevice',
      }),
      getFilter(model: { types: string[] }) {
        const filter = {};

        if (model.types && model.types.length) {
          filter['type'] = { __in: model.types };
        }

        return filter;
      },
    };

    this.sortable = false;
  }
}
