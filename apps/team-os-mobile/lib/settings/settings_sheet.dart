import 'package:flutter/material.dart';

import '../auth/team_role.dart';
import '../core/app_config.dart';
import '../notifications/push_capability.dart';
import 'attachment_capability.dart';

class TeamOsSettingsSheet extends StatelessWidget {
  const TeamOsSettingsSheet({
    required this.config,
    required this.role,
    required this.unreadCount,
    required this.onLogout,
    super.key,
  });

  final AppConfig config;
  final TeamRole role;
  final int unreadCount;
  final Future<void> Function() onLogout;

  @override
  Widget build(BuildContext context) {
    final push = PushCapability.current();
    final attachments = AttachmentCapability.current();

    return SafeArea(
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(20, 14, 20, 24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(
              child: Container(
                width: 42,
                height: 4,
                decoration: BoxDecoration(
                  color: const Color(0xFFCBD5E1),
                  borderRadius: BorderRadius.circular(99),
                ),
              ),
            ),
            const SizedBox(height: 20),
            Text('APP 设置', style: Theme.of(context).textTheme.headlineSmall),
            const SizedBox(height: 6),
            Text(
              '当前角色：${role.label} · 未读消息：$unreadCount',
              style: Theme.of(context).textTheme.bodyMedium,
            ),
            const SizedBox(height: 18),
            _SettingTile(
              icon: Icons.lock_outline_rounded,
              title: '会话安全',
              description:
                  '账号密码由同源登录页提交；Session 保持 HttpOnly，由系统 WebView CookieStore 管理。APP 不读取会话值，页面脚本无法读取。',
            ),
            _SettingTile(
              icon: Icons.dns_outlined,
              title: '企业服务地址',
              description: config.baseUri.origin,
            ),
            _SettingTile(
              icon: Icons.notifications_none_rounded,
              title: '${push.platform} 消息能力',
              description: 'Phase 7 站内消息已连接；${push.transport}已保留，当前不声明系统推送送达。',
            ),
            _SettingTile(
              icon: Icons.attach_file_rounded,
              title: '图片与文件能力',
              description: attachments.description,
            ),
            const SizedBox(height: 10),
            SizedBox(
              width: double.infinity,
              child: OutlinedButton.icon(
                onPressed: () async {
                  Navigator.of(context).pop();
                  await onLogout();
                },
                icon: const Icon(Icons.logout_rounded),
                label: const Text('安全退出账号'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _SettingTile extends StatelessWidget {
  const _SettingTile({
    required this.icon,
    required this.title,
    required this.description,
  });

  final IconData icon;
  final String title;
  final String description;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: const Color(0xFFE2E8F0)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: const Color(0xFFEEF2FF),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Icon(icon, color: const Color(0xFF4338CA), size: 21),
          ),
          const SizedBox(width: 13),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: const TextStyle(fontWeight: FontWeight.w700),
                ),
                const SizedBox(height: 5),
                Text(
                  description,
                  style: const TextStyle(
                    color: Color(0xFF64748B),
                    height: 1.45,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
