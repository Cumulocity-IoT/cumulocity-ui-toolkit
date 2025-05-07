export interface Dashboard {
  children: {
    [widgetId: string]: WidgetConfig;
  };
}

export interface WidgetConfig {
  col?: number;
  configTemplateUrl?: string;
  classes?: {
    'panel-title-hidden': boolean;
  };
  title?: string;
  _height?: number;
  templateUrl?: string;
  name?: string;
  _x?: number;
  _y?: number;
  _position?: number;
  id?: string;
  config?: Config;
  _width?: number;
}

export interface Config {
  html?: string;
  unsafe?: boolean;
}
