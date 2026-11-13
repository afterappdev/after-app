final personNamePattern = RegExp(
  r"^[\p{L}\p{M}\p{N} '\u2019-]+$",
  unicode: true,
);

final personNameChars = RegExp(
  r"[\p{L}\p{M}\p{N} '\u2019-]",
  unicode: true,
);

const personNameSpecialCharsMessage =
    'O nome não pode ter caracteres especiais.';

bool isPersonName(String value) => personNamePattern.hasMatch(value.trim());
