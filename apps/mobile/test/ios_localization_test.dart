import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

String _readText(String path) {
  final bytes = File(path).readAsBytesSync();
  if (bytes.length >= 2 && bytes[0] == 0xFF && bytes[1] == 0xFE) {
    final units = <int>[
      for (var i = 2; i + 1 < bytes.length; i += 2)
        bytes[i] | (bytes[i + 1] << 8),
    ];
    return String.fromCharCodes(units);
  }
  return utf8.decode(bytes);
}

void main() {
  late String infoPlist;
  late String project;
  late String appFrameworkPlist;
  late String infoPlistStrings;
  late String pubspec;

  setUpAll(() {
    infoPlist = File('ios/Runner/Info.plist').readAsStringSync();
    project = File('ios/Runner.xcodeproj/project.pbxproj').readAsStringSync();
    appFrameworkPlist = File('ios/Flutter/AppFrameworkInfo.plist').readAsStringSync();
    infoPlistStrings = _readText('ios/Runner/pt-BR.lproj/InfoPlist.strings');
    pubspec = File('pubspec.yaml').readAsStringSync();
  });

  test('o bundle iOS declara somente Português (Brasil)', () {
    expect(infoPlist, contains('<string>pt-BR</string>'));
    expect(infoPlist, contains('<key>CFBundleDevelopmentRegion</key>'));
    expect(infoPlist, contains('<key>CFBundleLocalizations</key>'));
    expect(infoPlist.contains('CFBundleLocalizations</key>\n\t<array>\n\t\t<string>en</string>'), isFalse);
    expect(infoPlist.contains(r'$(DEVELOPMENT_LANGUAGE)'), isFalse);

    expect(project, contains('developmentRegion = "pt-BR";'));
    expect(project.contains('developmentRegion = en;'), isFalse);
    expect(project, contains('"pt-BR",'));
    expect(project, contains('Base,'));
    expect(
      RegExp(r'knownRegions = \(\s*"pt-BR",\s*Base,\s*\);').hasMatch(project),
      isTrue,
    );
    expect(project, contains('pt-BR.lproj/InfoPlist.strings'));
    expect(project, contains('InfoPlist.strings in Resources'));
    final runnerResources = RegExp(
      r'97C146EC1CF9000F007C117D /\* Resources \*/ = \{([\s\S]*?)\};',
    ).firstMatch(project);
    expect(runnerResources, isNotNull);
    expect(
      runnerResources!.group(1),
      contains('C4F1A0022E8B4D0010A1B201 /* InfoPlist.strings in Resources */'),
    );
    expect(
      project,
      contains('97C146EC1CF9000F007C117D /* Resources */,'),
    );
    final stringsBytes = File('ios/Runner/pt-BR.lproj/InfoPlist.strings').readAsBytesSync();
    expect(stringsBytes.length, greaterThan(2));
    expect(stringsBytes[0], 0xFF);
    expect(stringsBytes[1], 0xFE);

    expect(appFrameworkPlist, contains('<string>pt-BR</string>'));
    expect(appFrameworkPlist.contains('<string>en</string>'), isFalse);
  });

  test('os textos de permissão em pt-BR permanecem os mesmos do Info.plist', () {
    const permissionStrings = [
      'Usamos sua localização para mostrar a distância até os estabelecimentos.',
      'Precisamos da galeria para você adicionar fotos e vídeos do local.',
      'Precisamos da câmera para você enviar fotos e vídeos do local.',
      'Precisamos do microfone para gravar o áudio dos vídeos.',
    ];
    for (final text in permissionStrings) {
      expect(infoPlist, contains(text));
      expect(infoPlistStrings, contains(text));
    }
    expect(infoPlistStrings, contains('"CFBundleDisplayName" = "After";'));
    expect(pubspec, contains('version: 1.0.1+12'));
  });
}
