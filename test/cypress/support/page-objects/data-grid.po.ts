import { DataGridColumnSelectors, DataGridSelectors } from '../selectors/data-grid.selectors';

/**
 * Page-object for the `<c8y-data-grid>` component.
 * Delegates to the typed selector constants in `selectors/data-grid.selectors.ts`.
 */
export class C8yDataGrid {
  /**
   * Returns the sort-order toggle button inside the column header matching `header`.
   */
  static getSortButtonOfColumn(header: string): Cypress.Chainable<JQuery<HTMLElement>> {
    return cy.get(DataGridColumnSelectors.sortButton(header));
  }

  /**
   * Returns the filter icon button inside the column header matching `header`.
   */
  static getFilterButtonOfColumn(header: string): Cypress.Chainable<JQuery<HTMLElement>> {
    return cy.get(DataGridColumnSelectors.filterButton(header));
  }

  /**
   * Returns the `<tr role="row">` element at the given zero-based row `index`.
   */
  static getRow(index: number): Cypress.Chainable<JQuery<HTMLElement>> {
    return cy.get(DataGridSelectors.ROW).eq(index);
  }

  /**
   * Returns the edit (pencil icon) action button for the row at `index`.
   */
  static getEditActionButton(index: number): Cypress.Chainable<JQuery<HTMLElement>> {
    return this.getRow(index).find(DataGridSelectors.EDIT_ROW).first();
  }

  /**
   * Returns the delete action button for the row at `index`.
   */
  static getDeleteActionButton(index: number): Cypress.Chainable<JQuery<HTMLElement>> {
    return this.getRow(index).find(DataGridSelectors.DELETE_ROW).first();
  }
}
