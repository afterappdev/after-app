import { Matches } from 'class-validator';

/** Letters, marks, digits, space, apostrophe and hyphen. Symbols stay out. */
export const PERSON_NAME_PATTERN = /^[\p{L}\p{M}\p{N} '\u2019-]+$/u;

export const PERSON_NAME_MESSAGE = 'O nome não pode ter caracteres especiais.';

export function IsPersonName(): PropertyDecorator {
  return Matches(PERSON_NAME_PATTERN, { message: PERSON_NAME_MESSAGE });
}
