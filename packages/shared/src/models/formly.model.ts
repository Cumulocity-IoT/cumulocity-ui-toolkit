/**
 * Option shape for a Formly `select` field.
 *
 * Previously duplicated as `FormlySelectOptions` in energy-consumption-widget and
 * reminder, and as `KpiAggregatorWidgetOptions` in kpi-widget.
 */
export interface FormlySelectOption<T = string | number | boolean> {
  label: string;
  value: T;
  /** Optional heading used to group options in the dropdown. */
  group?: string;
}
