import 'package:flutter/material.dart';

import 'update_dialog.dart';
import 'update_service.dart';

class UpdateGate extends StatefulWidget {
  const UpdateGate({
    required this.updateService,
    required this.child,
    super.key,
  });

  final UpdateService updateService;
  final Widget child;

  @override
  State<UpdateGate> createState() => _UpdateGateState();
}

class _UpdateGateState extends State<UpdateGate> {
  static bool _promptShownInSession = false;
  bool _checked = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_checked) {
      return;
    }
    _checked = true;
    WidgetsBinding.instance.addPostFrameCallback((_) => _check());
  }

  Future<void> _check() async {
    if (_promptShownInSession) {
      return;
    }

    await Future<void>.delayed(const Duration(milliseconds: 700));
    if (!mounted || _promptShownInSession) {
      return;
    }

    try {
      final result = await widget.updateService.checkForUpdate();
      if (!mounted || !result.shouldPrompt) {
        return;
      }

      _promptShownInSession = true;
      await showUpdateDialog(
        context,
        manifest: result.manifest,
        force: result.forceUpdate,
      );
    } catch (error) {
      debugPrint('Update check failed: $error');
      return;
    }
  }

  @override
  Widget build(BuildContext context) => widget.child;
}
