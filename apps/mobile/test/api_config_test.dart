import 'package:flutter/foundation.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:after_app/core/config/api_config.dart';

void main() {
  test('iOS release sem define usa a API de produção', () {
    expect(
      resolveApiBaseUrl(
        defined: '',
        isWeb: false,
        releaseMode: true,
        platform: TargetPlatform.iOS,
      ),
      productionApiBaseUrl,
    );
    expect(
      resolveApiBaseUrl(
        defined: '   ',
        isWeb: false,
        releaseMode: true,
        platform: TargetPlatform.iOS,
      ),
      productionApiBaseUrl,
    );
  });

  test('define explícito é respeitado, inclusive no iOS release', () {
    expect(
      resolveApiBaseUrl(
        defined: 'https://api.app-after.com.br',
        isWeb: false,
        releaseMode: true,
        platform: TargetPlatform.iOS,
      ),
      'https://api.app-after.com.br',
    );
    expect(
      resolveApiBaseUrl(
        defined: 'http://192.168.0.20:3000',
        isWeb: true,
        releaseMode: true,
        platform: TargetPlatform.iOS,
      ),
      'http://192.168.0.20:3000',
    );
  });

  test('desenvolvimento mantém os hosts locais', () {
    expect(
      resolveApiBaseUrl(
        defined: '',
        isWeb: false,
        releaseMode: false,
        platform: TargetPlatform.iOS,
      ),
      'http://127.0.0.1:3000',
    );
    expect(
      resolveApiBaseUrl(
        defined: '',
        isWeb: false,
        releaseMode: false,
        platform: TargetPlatform.android,
      ),
      'http://10.0.2.2:3000',
    );
    expect(
      resolveApiBaseUrl(
        defined: '',
        isWeb: false,
        releaseMode: true,
        platform: TargetPlatform.android,
      ),
      'http://10.0.2.2:3000',
    );
    expect(
      resolveApiBaseUrl(
        defined: '',
        isWeb: true,
        releaseMode: true,
        platform: TargetPlatform.android,
      ),
      'http://127.0.0.1:3000',
    );
  });

  test('iOS release sem define não cai em host local', () {
    final url = resolveApiBaseUrl(
      defined: '',
      isWeb: false,
      releaseMode: true,
      platform: TargetPlatform.iOS,
    );
    final host = Uri.parse(url).host;
    expect(host, isNot('127.0.0.1'));
    expect(host, isNot('localhost'));
    expect(host, isNot('10.0.2.2'));
  });
}
