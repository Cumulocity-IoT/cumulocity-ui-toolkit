export interface OperationWidgetConfig {
  device?: {
    id: string;
    name?: string;
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
}
