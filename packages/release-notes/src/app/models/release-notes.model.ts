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
  publicationTime?: Date;
  body?: string;
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
