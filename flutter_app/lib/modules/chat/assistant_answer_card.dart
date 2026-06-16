import 'package:flutter/material.dart';

import 'chat_markdown_view.dart';

class AssistantAnswerCard extends StatelessWidget {
  const AssistantAnswerCard({
    required this.data,
    this.streaming = false,
    this.bodyFontSize,
    super.key,
  });

  final String data;
  final bool streaming;
  final double? bodyFontSize;

  @override
  Widget build(BuildContext context) {
    final sections = _AssistantAnswerSections.parse(data);
    final textColor = const Color(0xFF0F172A);

    return SizedBox(
      width: double.infinity,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const _SectionHeader(
            icon: Icons.auto_awesome_outlined,
            title: '回答摘要',
          ),
          const SizedBox(height: 10),
          _AnswerSurface(
            child: ChatMarkdownView(
              data: sections.summary,
              isUser: false,
              textColor: textColor,
              bodyFontSize: bodyFontSize,
              streaming: streaming && sections.suggestions.isEmpty,
            ),
          ),
          if (sections.suggestions.isNotEmpty) ...[
            const SizedBox(height: 16),
            const Divider(height: 1, color: Color(0xFFE2E8F0)),
            const SizedBox(height: 14),
            const _SectionHeader(
              icon: Icons.checklist_rounded,
              title: '建议步骤',
            ),
            const SizedBox(height: 10),
            _AnswerSurface(
              subtle: true,
              child: ChatMarkdownView(
                data: sections.suggestions,
                isUser: false,
                textColor: textColor,
                bodyFontSize: bodyFontSize,
                streaming: streaming,
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _SectionHeader extends StatelessWidget {
  const _SectionHeader({
    required this.icon,
    required this.title,
  });

  final IconData icon;
  final String title;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Container(
          width: 28,
          height: 28,
          decoration: BoxDecoration(
            color: const Color(0xFFEFF6FF),
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: const Color(0xFFDBEAFE)),
          ),
          child: Icon(icon, size: 16, color: const Color(0xFF2563EB)),
        ),
        const SizedBox(width: 10),
        Text(
          title,
          style: const TextStyle(
            color: Color(0xFF0F172A),
            fontSize: 17,
            fontWeight: FontWeight.w800,
            height: 1.2,
          ),
        ),
      ],
    );
  }
}

class _AnswerSurface extends StatelessWidget {
  const _AnswerSurface({
    required this.child,
    this.subtle = false,
  });

  final Widget child;
  final bool subtle;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 13),
      decoration: BoxDecoration(
        color: subtle ? const Color(0xFFF8FAFC) : Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: const Color(0xFFE2E8F0)),
      ),
      child: child,
    );
  }
}

class _AssistantAnswerSections {
  const _AssistantAnswerSections({
    required this.summary,
    required this.suggestions,
  });

  final String summary;
  final String suggestions;

  static _AssistantAnswerSections parse(String source) {
    final text = source.trim();
    if (text.isEmpty) {
      return _AssistantAnswerSections(
        summary: '知识库中暂无明确资料。',
        suggestions: _defaultSuggestions(),
      );
    }

    final summaryMatch = RegExp(
      r'(^|\n)#{1,3}\s*回答摘要\s*\n',
      multiLine: true,
    ).firstMatch(text);
    final stepsMatch = RegExp(
      r'(^|\n)#{1,3}\s*建议步骤\s*\n',
      multiLine: true,
    ).firstMatch(text);

    if (summaryMatch == null && stepsMatch == null) {
      return _AssistantAnswerSections(
        summary: text,
        suggestions: _defaultSuggestions(),
      );
    }

    final summaryStart = summaryMatch?.end ?? 0;
    final summaryEnd = stepsMatch?.start ?? text.length;
    final safeSummaryEnd = summaryEnd.clamp(summaryStart, text.length).toInt();
    final summary = text.substring(summaryStart, safeSummaryEnd).trim();
    final suggestions =
        stepsMatch == null ? '' : text.substring(stepsMatch.end).trim();

    return _AssistantAnswerSections(
      summary: summary.isEmpty ? '知识库中暂无明确资料。' : summary,
      suggestions: suggestions.isEmpty ? _defaultSuggestions() : suggestions,
    );
  }

  static String _defaultSuggestions() {
    return '''
1. 可以继续补充与问题相关的资料到知识库。
2. 可以换一种更具体的提问方式再次检索。
3. 如果这是业务必需资料，可以联系管理员补充知识来源。
''';
  }
}
