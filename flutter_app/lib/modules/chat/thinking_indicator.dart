import 'dart:math' as math;

import 'package:flutter/material.dart';

class ThinkingIndicator extends StatefulWidget {
  const ThinkingIndicator({
    this.onCancel,
    super.key,
  });

  final VoidCallback? onCancel;

  @override
  State<ThinkingIndicator> createState() => _ThinkingIndicatorState();
}

class _ThinkingIndicatorState extends State<ThinkingIndicator> with SingleTickerProviderStateMixin {
  late final AnimationController _controller;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1200),
    )..repeat();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _controller,
      builder: (context, _) {
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Text(
                  '正在思考中',
                  style: TextStyle(
                    color: Color(0xFF475569),
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(width: 8),
                for (var index = 0; index < 3; index += 1)
                  _PulsingDot(
                    value: _dotValue(index),
                  ),
              ],
            ),
            const SizedBox(height: 10),
            ClipRRect(
              borderRadius: BorderRadius.circular(999),
              child: LinearProgressIndicator(
                value: null,
                minHeight: 5,
                backgroundColor: const Color(0xFFE2E8F0),
                color: const Color(0xFF10A37F).withValues(alpha: 0.75),
              ),
            ),
            if (widget.onCancel != null) ...[
              const SizedBox(height: 8),
              TextButton.icon(
                onPressed: widget.onCancel,
                icon: const Icon(Icons.stop_circle_outlined, size: 17),
                label: const Text('取消本次回答'),
                style: TextButton.styleFrom(
                  foregroundColor: const Color(0xFF64748B),
                  visualDensity: VisualDensity.compact,
                ),
              ),
            ],
          ],
        );
      },
    );
  }

  double _dotValue(int index) {
    final phase = (_controller.value + index * 0.18) % 1.0;
    return 0.45 + math.sin(phase * math.pi) * 0.55;
  }
}

class _PulsingDot extends StatelessWidget {
  const _PulsingDot({required this.value});

  final double value;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 7,
      height: 7,
      margin: const EdgeInsets.only(right: 4),
      decoration: BoxDecoration(
        color: const Color(0xFF10A37F).withValues(alpha: value),
        shape: BoxShape.circle,
      ),
    );
  }
}
