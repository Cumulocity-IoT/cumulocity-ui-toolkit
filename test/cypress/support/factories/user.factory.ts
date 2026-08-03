import { IUser } from '@c8y/client';
import { v4 as uuidv4 } from 'uuid';

/**
 * Generates a unique Cumulocity user object suitable for `cy.c8yclient` user
 * creation calls. The `userName` is prefixed with `cypress-` so cleanup
 * helpers can identify and delete test users easily.
 */
export function generateUser(
  displayName: string
): IUser & { [key: string]: string | boolean } {
  const shortUnique = Date.now().toString(36);
  const uuid = uuidv4() as string;

  return {
    userName: 'cypress-' + displayName.toLowerCase().replace(/\s/g, '-') + '-' + uuid,
    password: generatePassword(),
    email: `${uuid}@cumulocity-cypress.com`,
    displayName: `${displayName} ${shortUnique}`,
    enabled: true,
    passwordStrength: 'GREEN',
    sendPasswordResetEmail: false,
    twoFactorAuthenticationEnabled: false,
  };
}

/** Returns a new random UUID string. */
export function getUUID(): string {
  return uuidv4() as string;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function generatePassword(): string {
  const raw = (Date.now().toString(36) + '-' + uuidv4()).substring(0, 32);
  return randomizePassword(raw, ['`', '~', '!', '@', '#', '$', '%', '^', '&', '*', '(', ')']);
}

/** Randomises case and replaces hyphens with a random special character. */
function randomizePassword(text: string, replaceOptions: string[]): string {
  let result = '';
  let isFirst = true;

  for (const char of text) {
    if (/^[a-zA-Z]$/.test(char)) {
      result += isFirst || Math.random() < 0.5 ? char.toUpperCase() : char.toLowerCase();
      isFirst = false;
    } else if (char === '-') {
      result += replaceOptions[Math.floor(Math.random() * replaceOptions.length)];
    } else {
      result += char;
    }
  }

  return result;
}
