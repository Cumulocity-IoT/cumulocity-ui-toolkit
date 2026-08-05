import { IEvent } from '@c8y/client';

export const RELEASE_NOTES__ADMIN_PATH = 'release-notes';
export const RELEASE_NOTES__EVENT_TYPE = 'c8y_ReleaseNotes';
export const RELEASE_NOTES__MO_TYPE = 'c8y_ReleaseNotes';
export const RELEASE_NOTES__LAST_CHECKED_KEY = 'c8y_release_notes';
export const RELEASE_NOTES__PUBLISHED_FRAGMENT = 'published';

export interface ReleaseNote {
  id: IEvent['id'];
  version: string;
  [RELEASE_NOTES__PUBLISHED_FRAGMENT]: boolean;
  /** `null` when the release is not published. */
  publicationTime?: Date | null;
  body?: string | null;
}

export interface ReleaseNoteEvent extends IEvent {
  [RELEASE_NOTES__EVENT_TYPE]: ReleaseNoteEventPayload;
}

export interface ReleaseNoteEventPayload {
  version: ReleaseNote['version'];
  published: ReleaseNote['published'];
  publicationTime?: string;
  body?: ReleaseNote['body'];
}

/**
 * Narrows an event to a release-note event. Events are queried by type, but the
 * platform does not guarantee the payload fragment is present or well-formed,
 * and consumers dereference `version` directly.
 */
export function isReleaseNoteEvent(event: IEvent): event is ReleaseNoteEvent {
  const payload = (event as Partial<ReleaseNoteEvent>)[RELEASE_NOTES__EVENT_TYPE];

  return !!payload && typeof payload === 'object' && typeof payload.version === 'string';
}
