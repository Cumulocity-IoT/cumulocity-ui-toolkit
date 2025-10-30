import { BaseColumn, gettext } from '@c8y/ngx-components';
import { ObjectTypeCellRendererComponent } from './object-type.cell-renderer.component';

export class ObjectTypeColumn extends BaseColumn {
  constructor() {
    super();

    this.name = 'objectType';
    this.header = gettext('filter.object-type.title');
    this.resizable = false;
    this.cellRendererComponent = ObjectTypeCellRendererComponent;

    this.filterable = true;
    this.filteringConfig = {
      fields: [
        {
          type: 'object',
          key: 'objectType',
          templateOptions: {
            label: 'filter.object-type.hint',
          },
          fieldGroup: [
            {
              key: 'asset',
              type: 'checkbox',
              templateOptions: {
                label: 'Asset',
                attributes: {
                  'data-cy': 'object-type-filter-asset-checkbox',
                },
              },
              defaultValue: false,
            },
            {
              key: 'device',
              type: 'checkbox',
              templateOptions: {
                label: 'Device',
                attributes: {
                  'data-cy': 'object-type-filter-device-checkbox',
                },
              },
              defaultValue: false,
            },
            {
              key: 'group',
              type: 'checkbox',
              templateOptions: {
                label: 'Group',
                attributes: {
                  'data-cy': 'object-type-filter-group-checkbox',
                },
              },
              defaultValue: false,
            },
          ],
        },
      ],
      getFilter(model: { objectType: { asset: boolean; device: boolean; group: boolean } }) {
        const filter = { __or: [] };

        if (model.objectType.asset) {
          filter.__or.push({ __has: 'c8y_IsAsset' });
        }

        if (model.objectType.device) {
          filter.__or.push({ __has: 'c8y_IsDevice' });
        }

        if (model.objectType.group) {
          filter.__or.push({
            __and: [{ __has: 'c8y_IsDeviceGroup' }, { __not: { __has: 'c8y_IsAsset' } }],
          });
        }

        return filter;
      },
    };

    this.sortable = false;
  }
}
