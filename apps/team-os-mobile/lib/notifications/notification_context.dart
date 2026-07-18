import '../auth/team_role.dart';

class NotificationContext {
  const NotificationContext({required this.role, required this.unreadCount});

  const NotificationContext.initial()
    : role = TeamRole.unknown,
      unreadCount = 0;

  final TeamRole role;
  final int unreadCount;

  static NotificationContext? fromBridgeArguments(List<dynamic> arguments) {
    if (arguments.length != 1 || arguments.first is! Map) return null;
    final raw = Map<Object?, Object?>.from(arguments.first as Map);
    if (raw['schemaVersion'] != 1 || raw['roles'] is! List) return null;

    final roles = List<Object?>.from(raw['roles'] as List);
    final unread = raw['unreadCount'];
    if (unread is! num || unread < 0 || unread > 100000) return null;

    return NotificationContext(
      role: TeamRole.highest(roles),
      unreadCount: unread.toInt(),
    );
  }

  static const bridgeHandler = 'aiTeamOsContext';

  static const syncScript = '''
(() => {
  const safeJson = async (response) => {
    if (!response.ok) return null;
    try { return await response.json(); } catch (_) { return null; }
  };
  return Promise.all([
    fetch('/api/team-os/organization', {
      method: 'GET', credentials: 'same-origin', cache: 'no-store'
    }).then(safeJson),
    fetch('/api/team-os/notifications?page=1&pageSize=1', {
      method: 'GET', credentials: 'same-origin', cache: 'no-store'
    }).then(safeJson)
  ]).then(([organization, notifications]) => {
    const organizationData = organization && organization.data;
    const notificationData = notifications && notifications.data;
    const roles = [];
    if (organizationData && Array.isArray(organizationData.ownerCompanyIds)
        && organizationData.ownerCompanyIds.length > 0) {
      roles.push('TEAM_OWNER');
    }
    if (organizationData && Array.isArray(organizationData.teams)) {
      for (const team of organizationData.teams) {
        if (team && typeof team.currentUserRole === 'string') {
          roles.push(team.currentUserRole);
        }
      }
    }
    const unread = notificationData && Number.isInteger(notificationData.unreadCount)
      ? notificationData.unreadCount : 0;
    return window.flutter_inappwebview.callHandler('aiTeamOsContext', {
      schemaVersion: 1,
      roles: Array.from(new Set(roles)),
      unreadCount: Math.max(0, unread)
    });
  }).catch(() => null);
})();
''';
}
