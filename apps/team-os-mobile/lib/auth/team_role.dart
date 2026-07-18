enum TeamRole {
  owner('TEAM_OWNER', '老板', '/team-os/analytics'),
  manager('TEAM_MANAGER', '主管', '/team-os/organization'),
  trainer('TRAINER', '培训师', '/team-os/training'),
  member('TEAM_MEMBER', '员工', '/team-os/tasks/my'),
  unknown('UNKNOWN', '企业成员', '/team-os');

  const TeamRole(this.code, this.label, this.entryPath);

  final String code;
  final String label;
  final String entryPath;

  static TeamRole highest(Iterable<Object?> values) {
    final codes = values.whereType<String>().toSet();
    for (final role in const [owner, manager, trainer, member]) {
      if (codes.contains(role.code)) return role;
    }
    return unknown;
  }
}
