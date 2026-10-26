import { DEFAULT_SETTINGS, LIST_LIMIT, normalizeSettings } from './navigator-settings.model';

describe('navigator settings model', () => {
  it('gives the defaults for nothing stored or garbage', () => {
    expect(normalizeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings('x')).toEqual(DEFAULT_SETTINGS);
    expect(DEFAULT_SETTINGS.inventoryFallback).toBe(true);
  });

  it('keeps valid values and replaces malformed ones field by field', () => {
    expect(
      normalizeSettings({
        showSearch: false,
        shortcut: ' Alt+T ',
        showQuickAccess: 'no',
        maxPinned: 3,
        maxRecent: 'many',
      })
    ).toEqual({ ...DEFAULT_SETTINGS, showSearch: false, shortcut: 'alt+t', maxPinned: 3 });
  });

  it('clamps and rounds the list sizes', () => {
    const settings = normalizeSettings({ maxPinned: 0, maxRecent: 99.6 });

    expect(settings.maxPinned).toBe(LIST_LIMIT.min);
    expect(settings.maxRecent).toBe(LIST_LIMIT.max);
    expect(normalizeSettings({ maxRecent: 4.4 }).maxRecent).toBe(4);
  });
});
