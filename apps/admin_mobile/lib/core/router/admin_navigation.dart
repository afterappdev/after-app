import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'admin_location.dart';

class AdminShellScope extends InheritedWidget {
  const AdminShellScope({
    super.key,
    required this.sectionFragment,
    required super.child,
  });

  final String sectionFragment;

  static AdminShellScope? maybeOf(BuildContext context) {
    return context.dependOnInheritedWidgetOfExactType<AdminShellScope>();
  }

  @override
  bool updateShouldNotify(AdminShellScope oldWidget) {
    return sectionFragment != oldWidget.sectionFragment;
  }
}

AdminLocation currentAdminLocation() {
  if (!kIsWeb) return AdminLocation.dashboard;
  return locationFromUri(Uri.base);
}

void publishAdminLocation(String location, {bool replace = true}) {
  if (!kIsWeb) return;
  final path = location.startsWith('/') ? location : '/$location';
  SystemNavigator.routeInformationUpdated(
    uri: Uri(path: path),
    replace: replace,
  );
}

Future<T?> pushAdminPage<T>(
  BuildContext context, {
  required String location,
  required WidgetBuilder builder,
}) {
  publishAdminLocation(location, replace: false);
  return Navigator.of(context)
      .push<T>(MaterialPageRoute<T>(builder: builder))
      .whenComplete(() {
    if (!context.mounted) return;
    final section =
        AdminShellScope.maybeOf(context)?.sectionFragment ?? '/dashboard';
    publishAdminLocation(section, replace: true);
  });
}
