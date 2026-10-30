/**
 * Keyboard chords as the plugin stores them (`mod+k`, `alt+shift+t`) — parsed for matching
 * and labelled for display. Shared by the global search shortcut and the asset tree's own
 * configurable shortcut, so both read, show and match a chord the same way.
 */

/** The platform's command modifier label: `⌘` on Apple platforms, `Ctrl` elsewhere. */
export const MODIFIER_LABEL =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform)
    ? '⌘'
    : 'Ctrl';

/**
 * A parsed chord: modifier requirements plus the key it fires on.
 * `mod` means Meta on Apple platforms, Control elsewhere.
 */
export interface Chord {
  key: string;
  mod: boolean;
  shift: boolean;
  alt: boolean;
  label: string;
}

/** `mod+k`, `ctrl+shift+k`, `alt+g` … `undefined` for empty or unparseable input. */
export function parseChord(raw: string | undefined): Chord | undefined {
  const parts = (raw ?? '')
    .toLowerCase()
    .split('+')
    .map((part) => part.trim())
    .filter(Boolean);
  const key = parts.pop();

  if (!key || ['mod', 'ctrl', 'cmd', 'meta', 'shift', 'alt'].includes(key)) return undefined;
  const mod =
    parts.includes('mod') ||
    parts.includes('ctrl') ||
    parts.includes('cmd') ||
    parts.includes('meta');
  const shift = parts.includes('shift');
  const alt = parts.includes('alt');
  const label = [
    mod ? MODIFIER_LABEL : null,
    shift ? 'Shift' : null,
    alt ? 'Alt' : null,
    key.toUpperCase(),
  ]
    .filter(Boolean)
    .join('+');

  return { key, mod, shift, alt, label };
}

/** Whether a keydown is exactly this chord — no extra modifiers. */
export function matchesChord(chord: Chord, event: KeyboardEvent): boolean {
  // Coerced: synthetic events (tests, other scripts) may leave the flags unset.
  const modifier = Boolean(MODIFIER_LABEL === '⌘' ? event.metaKey : event.ctrlKey);

  return (
    (event.key ?? '').toLowerCase() === chord.key &&
    modifier === chord.mod &&
    Boolean(event.shiftKey) === chord.shift &&
    Boolean(event.altKey) === chord.alt
  );
}

/**
 * The chord a keydown represents, in the stored form (`mod+shift+t`) — for recording a
 * shortcut. `undefined` while only modifiers are held, and for a key without a modifier:
 * a bare letter would fire while typing anywhere in the shell.
 */
export function chordFromEvent(event: KeyboardEvent): string | undefined {
  const key = (event.key ?? '').toLowerCase();

  if (['meta', 'control', 'shift', 'alt', 'os', 'dead'].includes(key) || key.length === 0)
    return undefined;
  const mod = Boolean(MODIFIER_LABEL === '⌘' ? event.metaKey : event.ctrlKey);

  if (!mod && !event.altKey) return undefined;

  return [mod ? 'mod' : null, event.shiftKey ? 'shift' : null, event.altKey ? 'alt' : null, key]
    .filter(Boolean)
    .join('+');
}
