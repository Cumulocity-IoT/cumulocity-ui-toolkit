import { chordFromEvent, matchesChord, MODIFIER_LABEL, parseChord } from './chord';

const mac = MODIFIER_LABEL === '⌘';
const key = (init: KeyboardEventInit): KeyboardEvent => new KeyboardEvent('keydown', init);
/** The platform's command modifier, as an event flag. */
const mod: KeyboardEventInit = mac ? { metaKey: true } : { ctrlKey: true };

describe('chord', () => {
  it('parses stored chords and labels them per platform', () => {
    expect(parseChord('mod+shift+k')).toEqual({
      key: 'k',
      mod: true,
      shift: true,
      alt: false,
      label: `${MODIFIER_LABEL}+Shift+K`,
    });
    expect(parseChord(' Alt + T ')?.label).toBe('Alt+T');
    expect(parseChord('ctrl+k')?.mod).toBe(true);
  });

  it('rejects empty input and chords without a key', () => {
    expect(parseChord('')).toBeUndefined();
    expect(parseChord(undefined)).toBeUndefined();
    expect(parseChord('mod+shift')).toBeUndefined();
  });

  it('matches only the exact chord', () => {
    const chord = parseChord('alt+shift+t')!;

    expect(matchesChord(chord, key({ key: 'T', altKey: true, shiftKey: true }))).toBe(true);
    expect(matchesChord(chord, key({ key: 't', altKey: true }))).toBe(false);
    expect(matchesChord(chord, key({ key: 't', altKey: true, shiftKey: true, ...mod }))).toBe(
      false
    );
  });

  it('records a chord from a keydown, requiring a modifier', () => {
    expect(chordFromEvent(key({ key: 'T', altKey: true, shiftKey: true }))).toBe('shift+alt+t');
    expect(chordFromEvent(key({ key: 'e', ...mod }))).toBe('mod+e');
    // a bare letter would fire while typing anywhere; modifiers alone are not a chord yet
    expect(chordFromEvent(key({ key: 'e' }))).toBeUndefined();
    expect(chordFromEvent(key({ key: 'Shift', shiftKey: true, altKey: true }))).toBeUndefined();
  });

  it('round-trips: a recorded chord parses back and matches its own event', () => {
    const event = key({ key: 'g', altKey: true });

    expect(matchesChord(parseChord(chordFromEvent(event))!, event)).toBe(true);
  });
});
