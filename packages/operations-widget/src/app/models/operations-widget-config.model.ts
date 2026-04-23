export interface OperationWidgetConfig {
  device?: {
    id: string;
    name?: string;
    c8y_SupportedOperations?: string[];
  };
  buttons?: OperationButtonConfig[];
}

export interface OperationButtonConfig {
  label: string;
  icon?: string;
  operationFragment: string;
  buttonClasses?: string;
  description: string;
  operationValue: string;
  showModal: boolean;
  modalText?: string;
  customOperation?: boolean;
  fields?: OperationParamConfig[];
}

export interface OperationParamConfig {
  key: string;
  path: string;
  label: string;
  type: 'input' | 'number' | 'select';
  options: DropDownOption[];
}

export interface DropDownOption {
  label: string | number;
  value: string | number;
}
