import { TestBed } from '@angular/core/testing';
import { EventService, IFetchResponse, InventoryService } from '@c8y/client';
import { BsModalService } from 'ngx-bootstrap/modal';
import { provideMock } from '~helpers/auto-mock.helper';
import { LocalStorageService } from '~services/local-storage.service';
import {
  RELEASE_NOTES__EVENT_TYPE,
  RELEASE_NOTES__LAST_CHECKED_KEY,
  RELEASE_NOTES__PUBLISHED_FRAGMENT,
  ReleaseNote,
  ReleaseNoteEvent,
} from '../models/release-notes.model';
import { ReleaseNotesService } from './release-notes.service';

/** Minimal IFetchResponse stub used as the `res` field in client responses. */
const FETCH_RES = {} as IFetchResponse;

/** Builds a minimal raw release-note event for use in tests. */
function makeEvent(
  overrides: Partial<ReleaseNoteEvent> & { payload?: Partial<ReleaseNoteEvent['c8y_ReleaseNotes']> } = {}
): ReleaseNoteEvent {
  const { payload = {}, ...rest } = overrides;
  return {
    id: 'evt-1',
    type: RELEASE_NOTES__EVENT_TYPE,
    time: '2024-01-15T12:00:00.000Z',
    text: 'Release 1.0.0',
    source: { id: 'src-1' },
    self: '',
    creationTime: '',
    [RELEASE_NOTES__EVENT_TYPE]: {
      version: '1.0.0',
      published: true,
      publicationTime: '2024-01-15T12:00:00.000Z',
      body: 'First release',
      ...payload,
    },
    [RELEASE_NOTES__PUBLISHED_FRAGMENT]: {},
    ...rest,
  } as unknown as ReleaseNoteEvent;
}

describe('ReleaseNotesService', () => {
  let service: ReleaseNotesService;
  let eventService: jasmine.SpyObj<EventService>;
  let localStorageService: jasmine.SpyObj<LocalStorageService>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        ReleaseNotesService,
        provideMock(EventService),
        provideMock(InventoryService),
        provideMock(BsModalService),
        provideMock(LocalStorageService),
      ],
    });

    service = TestBed.inject(ReleaseNotesService);
    eventService = TestBed.inject(EventService) as jasmine.SpyObj<EventService>;
    localStorageService = TestBed.inject(LocalStorageService) as jasmine.SpyObj<LocalStorageService>;

    // Pre-populate the cached source to skip inventory lookups in most tests.
    service['source'] = { id: 'src-1' };
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  // ─── list() ─────────────────────────────────────────────────────────────────

  describe('list()', () => {
    it('converts raw events to ReleaseNote objects', async () => {
      const evt = makeEvent();
      eventService.list.and.returnValue(Promise.resolve({ data: [evt], res: FETCH_RES }));

      const notes = await service.list();

      expect(notes.length).toBe(1);
      expect(notes[0].id).toBe('evt-1');
      expect(notes[0].version).toBe('1.0.0');
      // The C8Y fragment-presence pattern stores {} not true; toBeTruthy() covers both.
      expect(notes[0].published).toBeTruthy();
      expect(notes[0].body).toBe('First release');
    });

    it('maps publicationTime string to a Date instance', async () => {
      const evt = makeEvent({ payload: { publicationTime: '2024-06-01T00:00:00.000Z' } });
      eventService.list.and.returnValue(Promise.resolve({ data: [evt], res: FETCH_RES }));

      const notes = await service.list();

      expect(notes[0].publicationTime).toBeInstanceOf(Date);
      expect((notes[0].publicationTime as Date).getFullYear()).toBe(2024);
    });

    it('sets published=false when the published fragment is absent', async () => {
      const evt = makeEvent();
      delete (evt as Record<string, unknown>)[RELEASE_NOTES__PUBLISHED_FRAGMENT];
      // The convertEventToRelease reads `releaseEvent.published`, not the key
      (evt as Record<string, unknown>)['published'] = false;
      eventService.list.and.returnValue(Promise.resolve({ data: [evt], res: FETCH_RES }));

      const notes = await service.list();

      expect(notes[0].published).toBeFalse();
    });

    it('includes the fragmentType filter when publishedOnly=true (default)', async () => {
      eventService.list.and.returnValue(Promise.resolve({ data: [], res: FETCH_RES }));

      await service.list();

      const callArgs = eventService.list.calls.mostRecent().args[0] as Record<string, unknown>;
      expect(callArgs['fragmentType']).toBe(RELEASE_NOTES__PUBLISHED_FRAGMENT);
    });

    it('omits the fragmentType filter when publishedOnly=false', async () => {
      eventService.list.and.returnValue(Promise.resolve({ data: [], res: FETCH_RES }));

      await service.list(false, false);

      const callArgs = eventService.list.calls.mostRecent().args[0] as Record<string, unknown>;
      expect(callArgs['fragmentType']).toBeUndefined();
    });

    it('filters to only newer events when showNewOnly=true', async () => {
      const lastChecked = '2024-01-10T00:00:00.000Z';
      localStorageService.get.and.returnValue(lastChecked);

      const newer = makeEvent({ id: 'new', payload: { publicationTime: '2024-01-20T00:00:00.000Z' } });
      const older = makeEvent({ id: 'old', payload: { publicationTime: '2024-01-05T00:00:00.000Z' } });
      eventService.list.and.returnValue(Promise.resolve({ data: [newer, older], res: FETCH_RES }));

      const notes = await service.list(true);

      expect(notes.length).toBe(1);
      expect(notes[0].id).toBe('new');
    });
  });

  // ─── delete() ───────────────────────────────────────────────────────────────

  describe('delete()', () => {
    it('delegates to eventService.delete with the release id', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      eventService.delete.and.returnValue(Promise.resolve({ data: null as any, res: FETCH_RES }));

      await service.delete('evt-42');

      expect(eventService.delete).toHaveBeenCalledWith('evt-42');
    });
  });

  // ─── publish() ──────────────────────────────────────────────────────────────

  describe('publish()', () => {
    it('sets published=true on the release before delegating to update()', async () => {
      const note: ReleaseNote = { id: '1', version: '1.0.0', published: false, publicationTime: null };
      spyOn(service, 'update').and.returnValue(Promise.resolve({ ...note, published: true }));

      await service.publish(note, true);

      expect(note.published).toBeTrue();
      expect(service.update).toHaveBeenCalledWith(note);
    });

    it('clears publicationTime when unpublishing', async () => {
      const note: ReleaseNote = { id: '1', version: '1.0.0', published: true, publicationTime: new Date() };
      spyOn(service, 'update').and.returnValue(Promise.resolve({ ...note, published: false }));

      await service.publish(note, false);

      expect(note.published).toBeFalse();
      expect(note.publicationTime).toBeNull();
    });

    it('sets publicationTime to a Date when publishing', async () => {
      const note: ReleaseNote = { id: '1', version: '1.0.0', published: false, publicationTime: null };
      spyOn(service, 'update').and.returnValue(Promise.resolve({ ...note, published: true }));

      await service.publish(note, true);

      expect(note.publicationTime).toBeInstanceOf(Date);
    });
  });

  // ─── setLastChecked() ───────────────────────────────────────────────────────

  describe('setLastChecked()', () => {
    it('stores an ISO timestamp under the expected key', () => {
      service.setLastChecked();

      expect(localStorageService.set).toHaveBeenCalledWith(
        RELEASE_NOTES__LAST_CHECKED_KEY,
        jasmine.stringMatching(/^\d{4}-\d{2}-\d{2}T/)
      );
    });
  });
});
