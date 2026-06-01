/**
 * Page-object for the Cumulocity `<c8y-select>` multi-select dropdown.
 */
export class C8ySelect {
  /** Opens or closes the dropdown. */
  static toggleDropdown(): void {
    cy.get('c8y-select').click();
  }

  /** Clicks the list item matching `text` inside the open dropdown. */
  static selectItem(text: string): void {
    cy.get('li .multiselect-item').contains(text).click();
  }

  /** Clicks the Apply button to confirm the selection. */
  static apply(): void {
    cy.get('button[title="Apply"]').click();
  }
}

/**
 * Page-object for Cumulocity toast / inline alert banners (`.alert`).
 */
export class C8yAlert {
  /**
   * Asserts that an `.alert` element containing `text` is visible on the page.
   */
  static containsText(text: string): void {
    cy.get('.alert').contains(text);
  }
}
