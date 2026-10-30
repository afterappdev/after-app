class AgeBandOption {
  const AgeBandOption(this.value, this.label);

  final String value;
  final String label;
}

const kAgeBandOptions = <AgeBandOption>[
  AgeBandOption('AGE_0_18', 'De 0 a 18 anos'),
  AgeBandOption('AGE_19_35', 'De 19 a 35 anos'),
  AgeBandOption('AGE_36_50', 'De 36 a 50 anos'),
  AgeBandOption('AGE_OVER_50', 'Mais de 50 anos'),
];

const kAgeBandRequiredMessage = 'Selecione a sua faixa etária.';

const kAgeBandDropdownHint = 'Selecione sua faixa etária';

String ageBandLabel(String? value) {
  for (final option in kAgeBandOptions) {
    if (option.value == value) return option.label;
  }
  return 'Selecione';
}
