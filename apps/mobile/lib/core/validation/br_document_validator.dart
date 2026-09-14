class BrDocumentValidator {
  BrDocumentValidator._();

  static final _emailRe = RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$');

  static String digitsOnly(String? value) =>
      (value ?? '').replaceAll(RegExp(r'\D'), '');

  static bool isValidEmail(String? value) {
    final email = (value ?? '').trim();
    return _emailRe.hasMatch(email);
  }

  static bool isValidCpf(String? value) {
    final digits = digitsOnly(value);
    if (digits.length != 11) return false;
    if (RegExp(r'^(\d)\1{10}$').hasMatch(digits)) return false;

    var sum = 0;
    for (var i = 0; i < 9; i++) {
      sum += int.parse(digits[i]) * (10 - i);
    }
    var check = (sum * 10) % 11;
    if (check == 10) check = 0;
    if (check != int.parse(digits[9])) return false;

    sum = 0;
    for (var i = 0; i < 10; i++) {
      sum += int.parse(digits[i]) * (11 - i);
    }
    check = (sum * 10) % 11;
    if (check == 10) check = 0;
    return check == int.parse(digits[10]);
  }

  static bool isValidCnpj(String? value) {
    final digits = digitsOnly(value);
    if (digits.length != 14) return false;
    if (RegExp(r'^(\d)\1{13}$').hasMatch(digits)) return false;

    const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const w2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

    var sum = 0;
    for (var i = 0; i < 12; i++) {
      sum += int.parse(digits[i]) * w1[i];
    }
    var rem = sum % 11;
    final d1 = rem < 2 ? 0 : 11 - rem;
    if (d1 != int.parse(digits[12])) return false;

    sum = 0;
    for (var i = 0; i < 13; i++) {
      sum += int.parse(digits[i]) * w2[i];
    }
    rem = sum % 11;
    final d2 = rem < 2 ? 0 : 11 - rem;
    return d2 == int.parse(digits[13]);
  }

  static String formatCpf(String digits) {
    final d = digitsOnly(digits);
    if (d.isEmpty) return '';
    final b = StringBuffer();
    for (var i = 0; i < d.length && i < 11; i++) {
      if (i == 3 || i == 6) b.write('.');
      if (i == 9) b.write('-');
      b.write(d[i]);
    }
    return b.toString();
  }

  static String formatCnpj(String digits) {
    final d = digitsOnly(digits);
    if (d.isEmpty) return '';
    final b = StringBuffer();
    for (var i = 0; i < d.length && i < 14; i++) {
      if (i == 2 || i == 5) b.write('.');
      if (i == 8) b.write('/');
      if (i == 12) b.write('-');
      b.write(d[i]);
    }
    return b.toString();
  }
}
