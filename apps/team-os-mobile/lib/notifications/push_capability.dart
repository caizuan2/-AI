import 'dart:io';

enum PushIntegrationState { reserved }

class PushCapability {
  const PushCapability({
    required this.platform,
    required this.transport,
    required this.state,
  });

  final String platform;
  final String transport;
  final PushIntegrationState state;

  static PushCapability current() {
    if (Platform.isAndroid) {
      return const PushCapability(
        platform: 'Android',
        transport: 'Android Push 设备注册接口',
        state: PushIntegrationState.reserved,
      );
    }
    if (Platform.isIOS) {
      return const PushCapability(
        platform: 'iOS',
        transport: 'APNs 设备注册接口',
        state: PushIntegrationState.reserved,
      );
    }
    if (Platform.isWindows) {
      return const PushCapability(
        platform: 'Windows',
        transport: 'Windows 系统通知接口',
        state: PushIntegrationState.reserved,
      );
    }
    return const PushCapability(
      platform: 'macOS',
      transport: 'macOS 系统通知接口',
      state: PushIntegrationState.reserved,
    );
  }
}
