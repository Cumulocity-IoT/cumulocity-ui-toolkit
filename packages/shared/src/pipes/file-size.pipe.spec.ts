import { FormatFileSizePipe } from './file-size.pipe';

describe('FormatFileSizePipe', () => {
  let pipe: FormatFileSizePipe;

  beforeEach(() => {
    pipe = new FormatFileSizePipe();
  });

  it('formats bytes', () => {
    expect(pipe.transform(20)).toBe('20 B');
  });

  /**
   * The unit is picked with `Math.round` on a log-1024 scale, so the switch to KB
   * happens at 32 bytes rather than at 1024. Pinned here as existing behaviour —
   * changing it to `Math.floor` would alter output across the whole range.
   */
  it('picks the unit by rounding on a log scale', () => {
    expect(pipe.transform(31)).toBe('31 B');
    expect(pipe.transform(100)).toBe('0.1 KB');
    expect(pipe.transform(512)).toBe('0.5 KB');
  });

  it('formats kilobytes', () => {
    expect(pipe.transform(2048)).toBe('2 KB');
  });

  it('keeps up to two decimals', () => {
    expect(pipe.transform(1536)).toBe('1.5 KB');
  });

  it('formats zero without producing NaN', () => {
    expect(pipe.transform(0)).toBe('0 B');
    expect(pipe.transform(0, true)).toBe('0 Bytes');
  });

  it('handles negative and non-finite input', () => {
    expect(pipe.transform(-1)).toBe('0 B');
    expect(pipe.transform(Number.NaN)).toBe('0 B');
    expect(pipe.transform(Number.POSITIVE_INFINITY)).toBe('0 B');
  });

  it('caps at the largest known unit', () => {
    expect(pipe.transform(Math.pow(1024, 9))).toBe('1024 YB');
  });

  describe('long form', () => {
    // The long-form list used to omit 'Terabytes', so every label from megabytes
    // upwards named the wrong unit.
    const cases: [number, string][] = [
      [1, 'Bytes'],
      [Math.pow(1024, 1), 'Kilobytes'],
      [Math.pow(1024, 2), 'Megabytes'],
      [Math.pow(1024, 3), 'Gigabytes'],
      [Math.pow(1024, 4), 'Terabytes'],
      [Math.pow(1024, 5), 'Petabytes'],
      [Math.pow(1024, 6), 'Exabytes'],
    ];

    cases.forEach(([bytes, unit]) => {
      it(`labels 1024^${Math.round(Math.log(bytes) / Math.log(1024))} as ${unit}`, () => {
        expect(pipe.transform(bytes, true)).toBe(`1 ${unit}`);
      });
    });

    it('agrees with the short form on the unit index', () => {
      expect(pipe.transform(Math.pow(1024, 4))).toBe('1 TB');
      expect(pipe.transform(Math.pow(1024, 4), true)).toBe('1 Terabytes');
    });
  });
});
