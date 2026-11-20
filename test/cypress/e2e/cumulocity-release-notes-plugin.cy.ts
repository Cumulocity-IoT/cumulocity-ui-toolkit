/// <reference types="cypress" />

import { IEvent, IManagedObject } from '@c8y/client';

/**
 * Release Notes plugin
 * - Admin: navigator node Settings → Release Notes, list/create/edit/publish/unpublish/delete
 * - Display: right drawer entry opens a modal listing published release notes
 * - Auto-popup: on startup the display modal opens when a release was published
 *   after the last check (localStorage key `c8y_release_notes`)
 *
 * Release notes are events of type `c8y_ReleaseNotes` (with a `published` fragment when
 * published) attached to a managed object of type `c8y_ReleaseNotes`.
 */
const EVENT_TYPE = 'c8y_ReleaseNotes';
const LAST_CHECKED_KEY = 'c8y_release_notes';
const ADMIN_ITEM = '[data-cy="release-notes-admin--item"]';
const MODAL = 'c8y-release-notes-admin-modal';
const DISPLAY_MODAL = 'c8y-release-notes-display-list-modal';


interface SeedNote {
  version: string;
  published: boolean;
  body?: string;
  publicationTime?: string | null;
}

let sourceId: string;

function seedNote(note: SeedNote): Cypress.Chainable<IEvent> {
  const publicationTime =
    note.publicationTime !== undefined
      ? note.publicationTime
      : note.published
        ? new Date().toISOString()
        : null;
  const event: Partial<IEvent> = {
    type: EVENT_TYPE,
    time: new Date().toISOString(),
    text: `Release ${note.version}`,
    source: { id: sourceId },
    [EVENT_TYPE]: {
      version: note.version,
      published: note.published,
      publicationTime,
      body: note.body ?? '',
    },
  };
  if (note.published) event['published'] = {};

  return cy
    .getAuth()
    .c8yclient((c) => c.event.create(event))
    .then((res) => res.body as IEvent);
}

/** Removes every release note event so each test starts from a known state. */
function clearNotes(): void {
  cy.getAuth()
    .c8yclient((c) => c.event.list({ type: EVENT_TYPE, pageSize: 2000, dateFrom: new Date(0).toISOString() }))
    .then((res) => {
      ((res.body as { events?: IEvent[] }).events ?? (res.body as unknown as IEvent[])).forEach((e) => {
        cy.getAuth().c8yclient((c) => c.event.delete(e.id));
      });
    });
}

function visitAdmin(): void {
  cy.visitApp('release-notes', { language: 'en', waitFor: '[data-cy="release-notes-admin--create"]' });
}

function adminItem(version: string): Cypress.Chainable<JQuery<HTMLElement>> {
  return cy.get(`${ADMIN_ITEM}[data-version="${version}"]`);
}

/** c8y-li-actions live in a dropdown — open it and click the action. */
function clickItemAction(version: string, action: 'edit' | 'publish' | 'delete'): void {
  adminItem(version).find('.dropdown-toggle, [data-cy="c8y-li--actions"] button').first().click();
  cy.get(`[data-cy="release-notes-admin--${action}"]:visible`).first().click();
}

describe('Release notes', () => {
  before(() => {
    cy.getAuth().login();
    cy.getAuth()
      .c8yclient((c) =>
        c.inventory.create({ type: EVENT_TYPE, name: 'Release notes source' })
      )
      .then((res) => {
        sourceId = (res.body as IManagedObject).id;
      });
  });

  beforeEach(() => {
    cy.getAuth().login().disableGainsight();
    clearNotes();
  });

  describe('admin', () => {
    it('adds a "Release Notes" navigator node under Settings that opens the admin list', () => {
      cy.visitApp('', { language: 'en', waitFor: '#navigator' });
      cy.get('c8y-navigator-node button[data-cy="Settings"]').click();
      cy.get('c8y-navigator-node button[data-cy="Release Notes"]').should('be.visible').click();
      cy.url().should('include', '#/release-notes');
      cy.get('c8y-release-notes-admin-list').should('be.visible');
      cy.get('[data-cy="release-notes-admin--reload"]').should('be.visible');
    });

    it('shows the empty state when no release notes exist', () => {
      visitAdmin();
      cy.get('[data-cy="release-notes-admin--empty"]')
        .should('be.visible')
        .and('contain.text', 'No release notes available');
    });

    it('lists published and unpublished release notes with their status', () => {
      seedNote({ version: '1.0.0', published: true });
      seedNote({ version: '1.1.0', published: false });
      visitAdmin();

      cy.get(ADMIN_ITEM).should('have.length', 2);
      adminItem('1.1.0').find('[data-cy="release-notes-admin--status"]').should('contain.text', 'Not published');
      adminItem('1.0.0').find('[data-cy="release-notes-admin--status"]').should('not.contain.text', 'Not published');
    });

    it('reloads the list on demand', () => {
      visitAdmin();
      cy.get('[data-cy="release-notes-admin--empty"]').should('be.visible');
      seedNote({ version: '2.0.0', published: false });
      cy.intercept('GET', '/event/events?*type=c8y_ReleaseNotes*').as('listNotes');
      cy.get('[data-cy="release-notes-admin--reload"]').click();
      cy.wait('@listNotes');
      adminItem('2.0.0').should('be.visible');
    });

    it('creates a published release note via the modal, with markdown preview', () => {
      visitAdmin();
      cy.intercept('POST', '/event/events').as('createNote');
      cy.get('[data-cy="release-notes-admin--create"]').click();

      cy.get(MODAL).should('be.visible');
      cy.get('[data-cy="release-notes-modal--title"]').should('contain.text', 'Create Release Note');
      // version is required
      cy.get('[data-cy="release-notes-modal--submit"]').should('be.disabled');

      cy.get(`${MODAL} input[type="text"]`).first().type('3.0.0');
      cy.get(`${MODAL} input[type="checkbox"]`).check({ force: true });
      cy.get(`${MODAL} textarea`).type('# Headline{enter}{enter}Some **bold** text');

      cy.get('[data-cy="release-notes-modal--preview-toggle"]').click();
      cy.get('[data-cy="release-notes-modal--preview"]')
        .should('be.visible')
        .within(() => {
          cy.get('h1').should('contain.text', 'Headline');
          cy.get('strong').should('contain.text', 'bold');
        });

      cy.get('[data-cy="release-notes-modal--submit"]').should('be.enabled').click();

      cy.wait('@createNote').its('request.body').should((body) => {
        expect(body.type).to.eq(EVENT_TYPE);
        expect(body[EVENT_TYPE].version).to.eq('3.0.0');
        expect(body[EVENT_TYPE].published).to.eq(true);
        expect(body[EVENT_TYPE].publicationTime).to.be.a('string');
        expect(body[EVENT_TYPE].body).to.contain('Some **bold** text');
        expect(body.published).to.deep.eq({});
      });
      cy.get(MODAL).should('not.exist');
      cy.get('c8y-alert-outlet').should('contain.text', 'Release 3.0.0 created');
      adminItem('3.0.0').find('[data-cy="release-notes-admin--status"]').should('not.contain.text', 'Not published');
    });

    it('cancels the create modal without creating anything', () => {
      visitAdmin();
      cy.get('[data-cy="release-notes-admin--create"]').click();
      cy.get(`${MODAL} input[type="text"]`).first().type('9.9.9');
      cy.get('[data-cy="release-notes-modal--cancel"]').click();
      cy.get(MODAL).should('not.exist');
      cy.get('[data-cy="release-notes-admin--empty"]').should('be.visible');
    });

    it('edits an existing release note', () => {
      seedNote({ version: '4.0.0', published: false, body: 'old body' });
      visitAdmin();
      cy.intercept('PUT', '/event/events/*').as('updateNote');

      clickItemAction('4.0.0', 'edit');
      cy.get('[data-cy="release-notes-modal--title"]').should('contain.text', 'Edit Release Note');
      cy.get(`${MODAL} input[type="text"]`).first().should('have.value', '4.0.0').clear().type('4.0.1');
      cy.get(`${MODAL} textarea`).should('have.value', 'old body').clear().type('new body');
      cy.get('[data-cy="release-notes-modal--submit"]').should('contain.text', 'Update').click();

      cy.wait('@updateNote').its('request.body').should((body) => {
        expect(body[EVENT_TYPE].version).to.eq('4.0.1');
        expect(body[EVENT_TYPE].body).to.eq('new body');
      });
      cy.get('c8y-alert-outlet').should('contain.text', 'Release 4.0.1 updated');
      adminItem('4.0.1').should('be.visible');
      adminItem('4.0.0').should('not.exist');
    });

    it('publishes and unpublishes a release note', () => {
      seedNote({ version: '5.0.0', published: false });
      visitAdmin();
      cy.intercept('PUT', '/event/events/*').as('updateNote');

      clickItemAction('5.0.0', 'publish');
      cy.wait('@updateNote').its('request.body.published').should('deep.eq', {});
      cy.get('c8y-alert-outlet').should('contain.text', 'Release note 5.0.0 published');
      adminItem('5.0.0').find('[data-cy="release-notes-admin--status"]').should('not.contain.text', 'Not published');

      clickItemAction('5.0.0', 'publish');
      cy.wait('@updateNote').its('request.body.published').should('eq', null);
      cy.get('c8y-alert-outlet').should('contain.text', 'Release note 5.0.0 unpublished');
      adminItem('5.0.0').find('[data-cy="release-notes-admin--status"]').should('contain.text', 'Not published');
    });

    it('deletes a release note', () => {
      seedNote({ version: '6.0.0', published: false });
      visitAdmin();
      cy.intercept('DELETE', '/event/events/*').as('deleteNote');

      clickItemAction('6.0.0', 'delete');
      cy.wait('@deleteNote');
      cy.get('c8y-alert-outlet').should('contain.text', 'Release 6.0.0 deleted');
      adminItem('6.0.0').should('not.exist');
    });

    it('says that deleting failed when the delete is rejected, and keeps the note', () => {
      seedNote({ version: '6.1.0', published: false });
      visitAdmin();
      cy.intercept('DELETE', '/event/events/*', { statusCode: 403, body: {} }).as('deleteNote');

      clickItemAction('6.1.0', 'delete');
      cy.wait('@deleteNote');
      cy.get('c8y-alert-outlet .alert-danger').should('contain.text', 'Could not delete release note');
      adminItem('6.1.0').should('exist');
    });

    it('shows an error alert when loading release notes fails', () => {
      cy.intercept('GET', '/event/events?*type=c8y_ReleaseNotes*', { statusCode: 500, body: {} });
      visitAdmin();
      cy.get('c8y-alert-outlet').should('contain.text', 'Could not load the release notes');
    });
  });

  describe('display', () => {
    it('opens the release notes modal from the right drawer listing only published notes', () => {
      seedNote({ version: '7.0.0', published: true, body: 'Published **notes**' });
      seedNote({ version: '7.1.0', published: false, body: 'draft' });
      cy.visitApp('', { language: 'en', waitFor: '#navigator' });

      cy.get('[data-cy="right-drawer-toggle-button"], .main-header .c8y-right-drawer-toggle, button[title="User"]')
        .first()
        .click();
      cy.get('[data-cy="release-notes-menu-item"]').should('be.visible').click();

      cy.get(DISPLAY_MODAL).should('be.visible');
      cy.get('[data-cy="release-notes-display--item"]').should('have.length', 1).first().as('item');
      cy.get('@item').should('contain.text', '7.0.0');
      cy.get('@item').find('.release-body strong').should('contain.text', 'notes');

      cy.get('[data-cy="release-notes-display--close"]').click();
      cy.get(DISPLAY_MODAL).should('not.exist');
    });

    it('shows the empty state in the display modal when nothing is published', () => {
      cy.visitApp('', { language: 'en', waitFor: '#navigator' });
      cy.get('[data-cy="right-drawer-toggle-button"], .main-header .c8y-right-drawer-toggle, button[title="User"]')
        .first()
        .click();
      cy.get('[data-cy="release-notes-menu-item"]').click();
      cy.get('[data-cy="release-notes-display--empty"]').should('be.visible');
    });

    it('records the first visit and pops up newer release notes on the next start', () => {
      // First start: no stored timestamp → it is stored, no modal.
      cy.visitApp('', { language: 'en', waitFor: '#navigator' });
      cy.window().its('localStorage').invoke('getItem', LAST_CHECKED_KEY).should('be.a', 'string');
      cy.get(DISPLAY_MODAL).should('not.exist');

      // Pretend the last check was long ago, then publish a release.
      cy.window().then((win) => {
        win.localStorage.setItem(LAST_CHECKED_KEY, JSON.stringify(new Date(2000, 0, 1).toISOString()));
      });
      seedNote({ version: '8.0.0', published: true });

      // same URL → a visit would only change the hash; reload to restart the app
      cy.reload();
      cy.get(DISPLAY_MODAL, { timeout: 60000 }).should('be.visible');
      cy.get('[data-cy="release-notes-display--item"]').should('contain.text', '8.0.0');
      // NOTE: both exports (Admin + Display) register the startup check, so with both
      // plugins installed the popup opens twice — close every instance.
      cy.get('[data-cy="release-notes-display--close"]').last().click();
      cy.get('[data-cy="release-notes-display--close"]').should('have.length.lessThan', 2);
      cy.get('body').then(($body) => {
        if ($body.find('[data-cy="release-notes-display--close"]').length) {
          cy.get('[data-cy="release-notes-display--close"]').click();
        }
      });
      cy.get(DISPLAY_MODAL).should('not.exist');

      // Last-checked was refreshed by opening the modal → no popup on the next start.
      cy.intercept({ method: 'GET', pathname: '/event/events', query: { type: EVENT_TYPE, pageSize: '1' } }).as(
        'checkNewer'
      );
      cy.reload();
      cy.wait('@checkNewer', { timeout: 60000 });
      cy.get('#navigator').should('exist');
      cy.get(DISPLAY_MODAL).should('not.exist');
    });
  });
});
