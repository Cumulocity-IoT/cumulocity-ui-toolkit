/**
 * A tab inside a modal dialog.
 *
 * Previously duplicated in layered-map-widget's popover config and
 * tenant-option-management's add-option modal.
 */
export interface ModalTab<TId extends string = string> {
  id: TId;
  label: string;
  icon?: string;
  active?: boolean;
  disabled?: boolean;
}
