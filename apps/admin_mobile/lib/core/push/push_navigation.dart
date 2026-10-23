import 'package:flutter/material.dart';

import '../../features/accounts/account_detail_screen.dart';
import '../../features/coupons/coupon_detail_screen.dart';
import '../../features/reports/report_detail_screen.dart';
import '../../features/sales/sale_detail_screen.dart';
import '../router/admin_navigation.dart';
import 'push_payload.dart';

void openAdminPushTarget(BuildContext context, PushNavTarget target) {
  final id = Uri.encodeComponent(target.id);
  final location = switch (target.kind) {
    PushNavKind.account => '/contas/$id',
    PushNavKind.sale => '/vendas/$id',
    PushNavKind.report => '/denuncias/$id',
    PushNavKind.coupon => '/cupons/$id',
  };
  final page = switch (target.kind) {
    PushNavKind.account => AccountDetailScreen(id: target.id),
    PushNavKind.sale => SaleDetailScreen(id: target.id),
    PushNavKind.report => ReportDetailScreen(id: target.id),
    PushNavKind.coupon => CouponDetailScreen(id: target.id),
  };
  pushAdminPage<void>(
    context,
    location: location,
    builder: (_) => page,
  );
}
