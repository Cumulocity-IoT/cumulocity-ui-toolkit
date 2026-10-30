import { missingEntryItem } from './quick-access-row.component';

describe('missingEntryItem', () => {
  const entry = { assetId: '42', label: 'Pump 7', icon: 'pump' } as Parameters<
    typeof missingEntryItem
  >[0];

  it('marks an asset the full fleet no longer contains as gone', () => {
    expect(missingEntryItem(entry, false)).toEqual(
      jasmine.objectContaining({ severity: 'gone', unavailable: true })
    );
  });

  it('keeps a pin that is only not loaded yet (large tenants) neutral and usable', () => {
    expect(missingEntryItem(entry, true)).toEqual(
      jasmine.objectContaining({
        assetId: '42',
        label: 'Pump 7',
        severity: 'ok',
        unavailable: false,
      })
    );
  });
});
