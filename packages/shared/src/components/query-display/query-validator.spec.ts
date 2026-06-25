import { FormControl } from '@angular/forms';
import {
  UNSUPPORTED_HAS_PROPERTIES,
  cumulocityQueryValidator,
  validateQuery,
} from './query-validator';

describe('UNSUPPORTED_HAS_PROPERTIES', () => {
  it('contains all documented standard properties', () => {
    const expected = [
      'id',
      'type',
      'name',
      'self',
      'lastUpdated',
      'owner',
      'creationTime',
      'supportedMeasurements',
      'childAssets',
      'childDevices',
      'childAdditions',
      'externalIds',
    ];
    expected.forEach((p) => expect(UNSUPPORTED_HAS_PROPERTIES.has(p)).toBeTrue());
  });

  it('does not contain custom fragment names', () => {
    expect(UNSUPPORTED_HAS_PROPERTIES.has('c8y_IsDevice')).toBeFalse();
    expect(UNSUPPORTED_HAS_PROPERTIES.has('c8y_Position')).toBeFalse();
  });
});

describe('validateQuery', () => {
  it('returns empty array for empty/undefined query', () => {
    expect(validateQuery('')).toEqual([]);
    expect(validateQuery(undefined)).toEqual([]);
    expect(validateQuery('   ')).toEqual([]);
  });

  it('returns empty array for valid has() with custom fragment', () => {
    expect(validateQuery('has(c8y_IsDevice)')).toEqual([]);
  });

  it('returns empty array for valid comparison query', () => {
    expect(validateQuery("type eq 'Pump'")).toEqual([]);
  });

  it('returns empty array for valid $filter= wrapped query', () => {
    expect(validateQuery('$filter=(has(c8y_Position))')).toEqual([]);
  });

  it('detects has(type) as unsupported', () => {
    const msgs = validateQuery('has(type)');
    expect(msgs.length).toBe(1);
    expect(msgs[0]).toContain('has(type)');
    expect(msgs[0]).toContain('standard property');
  });

  it('detects has(name) as unsupported', () => {
    const msgs = validateQuery('has(name)');
    expect(msgs.length).toBe(1);
    expect(msgs[0]).toContain('has(name)');
  });

  it('detects has(id) as unsupported', () => {
    expect(validateQuery('has(id)')).toHaveSize(1);
  });

  it('detects has(owner) as unsupported', () => {
    expect(validateQuery('has(owner)')).toHaveSize(1);
  });

  it('detects unsupported property inside compound and expression', () => {
    const msgs = validateQuery("has(c8y_IsDevice) and has(type)");
    expect(msgs.length).toBe(1);
    expect(msgs[0]).toContain('has(type)');
  });

  it('detects multiple violations across the query', () => {
    const msgs = validateQuery('has(type) and has(name)');
    expect(msgs.length).toBe(2);
  });

  it('detects hasany() with unsupported standard properties', () => {
    const msgs = validateQuery('hasany(type, name)');
    expect(msgs.length).toBe(1);
    expect(msgs[0]).toContain('hasany');
    expect(msgs[0]).toContain('type');
    expect(msgs[0]).toContain('name');
  });

  it('ignores parse errors silently', () => {
    expect(validateQuery('this is not valid @@@')).toEqual([]);
  });

  it('returns empty for hasany() with all valid fragments', () => {
    expect(validateQuery('hasany(c8y_IsDevice, c8y_Position)')).toEqual([]);
  });

  it('flags only the unsupported fragments in hasany()', () => {
    const msgs = validateQuery('hasany(c8y_IsDevice, type, owner)');
    expect(msgs.length).toBe(1);
    expect(msgs[0]).toContain('type');
    expect(msgs[0]).toContain('owner');
    expect(msgs[0]).not.toContain('c8y_IsDevice');
  });

  it('handles $filter= wrapped query', () => {
    const msgs = validateQuery('$filter=(has(type))');
    expect(msgs.length).toBe(1);
  });

  it('detects violation inside or expression', () => {
    expect(validateQuery('has(c8y_IsDevice) or has(name)')).toHaveSize(1);
  });

  it('detects violation inside not expression', () => {
    expect(validateQuery('not(has(type))')).toHaveSize(1);
  });
});

describe('cumulocityQueryValidator', () => {
  it('returns null for valid query', () => {
    const ctrl = new FormControl('has(c8y_IsDevice)');
    expect(cumulocityQueryValidator(ctrl)).toBeNull();
  });

  it('returns null for empty value', () => {
    expect(cumulocityQueryValidator(new FormControl(''))).toBeNull();
    expect(cumulocityQueryValidator(new FormControl(null))).toBeNull();
  });

  it('returns ValidationErrors for unsupported standard property', () => {
    const ctrl = new FormControl('has(type)');
    const errors = cumulocityQueryValidator(ctrl);
    expect(errors).not.toBeNull();
    expect(errors?.['cumulocityQuery']).toContain('has(type)');
  });

  it('joins multiple error messages with ;', () => {
    const ctrl = new FormControl('has(type) and has(name)');
    const errors = cumulocityQueryValidator(ctrl);
    expect(errors?.['cumulocityQuery']).toContain(';');
  });
});
