import {
  CUSTOM_FIELD_KEY_PREFIX,
  DEFAULT_DETAIL_FIELD_KEYS,
  DETAIL_FIELD_CATALOGUE,
  branchFieldCatalogue,
  customDetailField,
  customFieldKey,
  detailFieldByKey,
  detailFieldFor,
  resolveDetailFieldKeys,
  seriesFor,
} from './asset-detail-fields';

describe('the field catalogue', () => {
  it('only declares fields whose keys are unique', () => {
    const keys = DETAIL_FIELD_CATALOGUE.map((field) => field.spec.key);

    expect(new Set(keys).size).toBe(keys.length);
  });

  it('resolves every default key', () => {
    for (const key of DEFAULT_DETAIL_FIELD_KEYS) {
      expect(detailFieldByKey(key)).withContext(key).toBeDefined();
    }
  });

  it('offers a branch only its own managed-object fields', () => {
    // A group has no IECMeasurement series and its subtree alarms are already in the
    // rollup rows, so offering either would only ever add a dash or a duplicate.
    for (const field of branchFieldCatalogue()) {
      expect(field.spec.kind).toBe('mo');
      expect(field.render).not.toBe('status');
    }
    expect(branchFieldCatalogue().length).toBeGreaterThan(0);
  });
});

describe('custom (picked) fields', () => {
  it('describes itself entirely from its key', () => {
    const field = customDetailField(customFieldKey('turbine_firmware_version'));

    expect(field?.spec).toEqual({
      key: 'mo:turbine_firmware_version',
      kind: 'mo',
      path: 'turbine_firmware_version',
    });
    // No vendor prefix to drop here (`turbine_` is not `<lowercase>_<Uppercase>`), so the
    // whole path is humanized — the catalogue's curated "Firmware" label is what the
    // *catalogue* entry is for; a free-picked path is labeled from what it says.
    expect(field?.label).toBe('Turbine Firmware Version');
  });

  it('labels a nested path from its last segment', () => {
    expect(customDetailField('mo:wnd_Owner.companyName')?.label).toBe('Company Name');
  });

  it('is not a catalogue key, and an empty path is not a field', () => {
    expect(detailFieldByKey('mo:anything')).toBeUndefined();
    expect(customDetailField('status')).toBeUndefined();
    expect(customDetailField(CUSTOM_FIELD_KEY_PREFIX)).toBeUndefined();
  });

  it('is resolved by the vocabulary alongside the catalogue', () => {
    expect(detailFieldFor('status')?.spec.key).toBe('status');
    expect(detailFieldFor('mo:a.b')?.spec.key).toBe('mo:a.b');
    expect(detailFieldFor('nope')).toBeUndefined();
  });
});

describe('resolveDetailFieldKeys', () => {
  it('falls back to the turbine set for a leaf that was never configured', () => {
    expect(resolveDetailFieldKeys(null, false)).toEqual(DEFAULT_DETAIL_FIELD_KEYS);
    // An empty stored list reads the same way: an empty turbine panel is not a state the
    // user can have meant, so it degrades rather than rendering nothing.
    expect(resolveDetailFieldKeys([], false)).toEqual(DEFAULT_DETAIL_FIELD_KEYS);
  });

  it('falls back to nothing for a branch — its rollup rows are the panel', () => {
    expect(resolveDetailFieldKeys(null, true)).toEqual([]);
    expect(resolveDetailFieldKeys([], true)).toEqual([]);
  });

  it('keeps a configured selection, in order', () => {
    expect(resolveDetailFieldKeys(['alarms', 'status'], false)).toEqual(['alarms', 'status']);
    expect(resolveDetailFieldKeys(['mo:capacity'], true)).toEqual(['mo:capacity']);
  });
});

describe('seriesFor', () => {
  it('asks only for the series the selected measurement fields need', () => {
    expect(seriesFor(['status', 'activePower', 'mo:x', 'alarms'])).toEqual(['WTUR.W']);
  });

  it('ignores keys the vocabulary does not know', () => {
    expect(seriesFor(['gone'])).toEqual([]);
  });
});
