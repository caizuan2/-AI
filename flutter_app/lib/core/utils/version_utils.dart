int compareVersions(String left, String right) {
  final leftParts = left.split('.').map((part) => int.tryParse(part) ?? 0).toList();
  final rightParts = right.split('.').map((part) => int.tryParse(part) ?? 0).toList();
  final maxLength = leftParts.length > rightParts.length ? leftParts.length : rightParts.length;

  for (var index = 0; index < maxLength; index += 1) {
    final leftValue = index < leftParts.length ? leftParts[index] : 0;
    final rightValue = index < rightParts.length ? rightParts[index] : 0;
    if (leftValue != rightValue) {
      return leftValue.compareTo(rightValue);
    }
  }

  return 0;
}

bool isRemoteNewer({
  required String localVersion,
  required int localBuild,
  required String remoteVersion,
  required int remoteBuild,
}) {
  if (remoteBuild > localBuild) {
    return true;
  }

  if (remoteBuild < localBuild) {
    return false;
  }

  return compareVersions(remoteVersion, localVersion) > 0;
}
