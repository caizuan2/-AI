import 'dart:io';

class AttachmentCapability {
  const AttachmentCapability({
    required this.cameraReserved,
    required this.imagePickerReserved,
    required this.filePickerReserved,
    required this.description,
  });

  final bool cameraReserved;
  final bool imagePickerReserved;
  final bool filePickerReserved;
  final String description;

  static AttachmentCapability current() {
    final mobile = Platform.isAndroid || Platform.isIOS;
    return AttachmentCapability(
      cameraReserved: mobile,
      imagePickerReserved: true,
      filePickerReserved: true,
      description: mobile
          ? '已保留相机、图片与文件选择边界；当前版本不提前申请设备权限。'
          : '已保留图片与文件选择边界；桌面端不会申请移动相机权限。',
    );
  }
}
