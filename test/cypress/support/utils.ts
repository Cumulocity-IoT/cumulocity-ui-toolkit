import {
  AlarmStatus,
  IAlarm,
  IEvent,
  IIdentified,
  IManagedObject,
  IMeasurement,
  Severity,
} from '@c8y/client';

export interface Widget {
  /**
   * x dimension parameters
   */
  _x?: number;
  /**
   * y dimension parameters
   */
  _y?: number;
  /**
   * width dimension parameters
   */
  _width?: number;
  /**
   * height dimension parameters
   */
  _height?: number;
  /**
   * The unique component id to find the component in the
   * HOOK_COMPONENTS dynamic-component implementation.
   */
  componentId: string;
  /**
   * A random key for saving it to the object.
   */
  id: string;
  /**
   * The current configuration of the widget.
   */
  config: any;
  /**
   * The current title of the widget.
   */
  title?: string;
  /**
   * Which classes should be added.
   */
  classes?: any;
}

export function mockWidget(fragments?: Partial<Widget>): Widget {
  let widget: Widget = {
    componentId: Date.now().toString(36),
    config: {},
    id: `${Math.floor(Math.random() * 1e16)}`,
  };

  if (fragments) {
    widget = {
      ...widget,
      ...fragments,
    };
  }

  return widget;
}

export function mockDashboard(
  groupOrDevice: Partial<IManagedObject>,
  widgets?: Widget[]
): IManagedObject {
  const isGroup = Cypress._.has(groupOrDevice, 'c8y_IsDeviceGroup');
  const mo = mockManagedObject();
  mo.name = 'Dashboard';
  Cypress._.set(mo, `c8y_Dashboard!${isGroup ? 'group' : 'device'}!${groupOrDevice.id}`, {});

  const c8y_Dashboard = {
    classes: { 'dashboard-theme-light': true },
    icon: 'th',
    isFrozen: false,
    name: mo.name,
    priority: 10000,
    children: {},
  };

  if (widgets?.length) {
    for (const widget of widgets) {
      Cypress._.set(c8y_Dashboard.children, widget.id, widget);
    }
  }

  Cypress._.set(mo, 'c8y_Dashboard', c8y_Dashboard);

  return mo;
}

export function mockAlarm(device?: Partial<IManagedObject>): IAlarm {
  return {
    id: `${Math.floor(Math.random() * 1e16)}`,
    text: 'Cypress Test Alarm',
    time: new Date().toISOString(),
    type: 'c8y_CypressAlarm',
    severity: Severity.WARNING,
    status: 'ACTIVE',
    source: { id: device?.id ?? `${Math.floor(Math.random() * 1e16)}` },
    c8y_CypressAlarm: {},
  };
}

export function mockManagedObject(): IManagedObject {
  return {
    additionParents: {
      references: [],
      self: '',
    },
    owner: 'Cypress createManagedObject',
    childDevices: {
      references: [],
      self: '',
    },
    childAssets: {
      references: [],
      self: '',
    },
    creationTime: new Date().toISOString(),
    type: 'c8y_CypressType',
    lastUpdated: new Date().toISOString(),
    childAdditions: {
      references: [],
      self: '',
    },
    name: 'Cypress Test Group',
    deviceParents: {
      references: [],
      self: '',
    },
    c8y_CypressType: {},
    assetParents: {
      references: [],
      self: '',
    },
    self: '',
    id: `${Math.floor(Math.random() * 1e16)}`,
  };
}

export function mockId() {
  return `${Math.floor(Math.random() * 1e16)}`;
}

export function mockListResponse<T extends IManagedObject | IEvent | IMeasurement>(
  data: T[],
  statistics?: { totalPages: number; pageSize: number; currentPage: number }
) {
  let response = {};
  if (isManagedObject(data[0])) {
    response = {
      managedObjects: data,
      self: '',
    };
  } else if (isAlarm(data[0])) {
    response = {
      alarms: data,
      self: '',
    };
  } else if (isEvent(data[0])) {
    response = {
      events: data,
      self: '',
    };
  } else if (isMeasurement(data[0])) {
    response = {
      measurements: data,
      self: '',
    };
  }

  response = {
    ...response,
    statistics: statistics ?? { totalPages: 1, pageSize: 2000, currentPage: 1 },
  };
  return response;
}

export function mockChildAssetsResponse(
  data: IManagedObject[],
  statistics?: { pageSize: number; currentPage: number; totalPages?: number }
) {
  let response = {
    next: '',
    self: '',
    references: data.map((mo) => ({
      managedObject: mo,
      self: '',
    })),
    statistics: statistics ?? { totalPages: 1, pageSize: 2000, currentPage: 1 },
  };

  return response;
}

function isManagedObject(obj: unknown): obj is IManagedObject {
  const attributes = [
    'additionParents',
    'owner',
    'childAssets',
    'childDevices',
    'lastUpdated',
    'deviceParents',
    'assetParents',
  ];
  for (const attr of attributes) {
    if (!Cypress._.has(obj, attr)) {
      return false;
    }
  }
  return true;
}

function isAlarm(obj: unknown): obj is IAlarm {
  const attributes = ['status', 'severity', 'time', 'text'];
  for (const attr of attributes) {
    if (!Cypress._.has(obj, attr)) {
      return false;
    }
  }
  return true;
}

function isEvent(obj: unknown): obj is IEvent {
  const attributes = ['source', 'type', 'time', 'text'];
  for (const attr of attributes) {
    if (!Cypress._.has(obj, attr)) {
      return false;
    }
  }
  return true;
}

function isMeasurement(o: unknown): o is IMeasurement {
  const keys = Object.keys(o);
  for (const key of keys) {
    const fragment = Cypress._.get(o, key);
    const nestedKeys = Object.keys(fragment);
    for (const nestedKey of nestedKeys) {
      if (
        Cypress._.has(fragment, `${nestedKey}.value`) &&
        Cypress._.has(fragment, `${nestedKey}.unit`)
      ) {
        return true;
      }
    }
  }

  return false;
}

export function widgetDimensions(x = 0, y = 0, width: number, height: number): Partial<Widget> {
  return {
    _x: x,
    _y: y,
    _width: width,
    _height: height,
  };
}
