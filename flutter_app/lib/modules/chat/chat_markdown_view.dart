import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_markdown/flutter_markdown.dart';

class ChatMarkdownView extends StatelessWidget {
  const ChatMarkdownView({
    required this.data,
    required this.isUser,
    required this.textColor,
    this.streaming = false,
    this.bodyFontSize,
    super.key,
  });

  final String data;
  final bool isUser;
  final Color textColor;
  final bool streaming;
  final double? bodyFontSize;

  @override
  Widget build(BuildContext context) {
    final segments = _splitCodeBlocks(data);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        for (final segment in segments)
          if (segment.isCode)
            _CodeBlock(
              code: segment.content,
              language: segment.language,
            )
          else if (segment.content.trim().isNotEmpty)
            MarkdownBody(
              data: segment.content,
              selectable: true,
              styleSheet:
                  MarkdownStyleSheet.fromTheme(Theme.of(context)).copyWith(
                p: TextStyle(
                  color: textColor,
                  fontSize: bodyFontSize,
                  height: 1.58,
                ),
                h1: TextStyle(
                    color: textColor,
                    fontSize: 22,
                    fontWeight: FontWeight.w800),
                h2: TextStyle(
                    color: textColor,
                    fontSize: 19,
                    fontWeight: FontWeight.w800),
                h3: TextStyle(
                    color: textColor,
                    fontSize: 16,
                    fontWeight: FontWeight.w800),
                listBullet: TextStyle(color: textColor),
                tableBody: TextStyle(color: textColor),
                tableHead:
                    TextStyle(color: textColor, fontWeight: FontWeight.w700),
                code: TextStyle(
                  backgroundColor:
                      isUser ? Colors.white12 : const Color(0xFFF1F5F9),
                  color: textColor,
                  fontFamily: 'monospace',
                ),
              ),
            ),
        if (streaming)
          Padding(
            padding: const EdgeInsets.only(top: 2),
            child: Text(
              '▍',
              style: TextStyle(
                color: isUser ? Colors.white70 : const Color(0xFF10A37F),
                fontWeight: FontWeight.w800,
              ),
            ),
          ),
      ],
    );
  }

  List<_MarkdownSegment> _splitCodeBlocks(String source) {
    final regex =
        RegExp(r'```([A-Za-z0-9_-]+)?\n([\s\S]*?)```', multiLine: true);
    final segments = <_MarkdownSegment>[];
    var cursor = 0;

    for (final match in regex.allMatches(source)) {
      if (match.start > cursor) {
        segments
            .add(_MarkdownSegment.text(source.substring(cursor, match.start)));
      }

      segments.add(_MarkdownSegment.code(
        match.group(2) ?? '',
        language: match.group(1) ?? '',
      ));
      cursor = match.end;
    }

    if (cursor < source.length) {
      segments.add(_MarkdownSegment.text(source.substring(cursor)));
    }

    if (segments.isEmpty) {
      segments.add(_MarkdownSegment.text(source));
    }

    return segments;
  }
}

class _CodeBlock extends StatelessWidget {
  const _CodeBlock({
    required this.code,
    required this.language,
  });

  final String code;
  final String language;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.symmetric(vertical: 10),
      decoration: BoxDecoration(
        color: const Color(0xFF0F172A),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: const Color(0xFF1E293B)),
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            color: const Color(0xFF111827),
            child: Row(
              children: [
                Text(
                  language.isEmpty ? 'code' : language.toLowerCase(),
                  style: const TextStyle(
                    color: Color(0xFFCBD5E1),
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const Spacer(),
                TextButton.icon(
                  onPressed: () => Clipboard.setData(ClipboardData(text: code)),
                  icon: const Icon(Icons.copy, size: 15),
                  label: const Text('复制代码'),
                  style: TextButton.styleFrom(
                    foregroundColor: const Color(0xFFE2E8F0),
                    visualDensity: VisualDensity.compact,
                  ),
                ),
              ],
            ),
          ),
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.all(14),
            child: SelectableText.rich(
              TextSpan(children: _highlight(code, language)),
              style: const TextStyle(
                color: Color(0xFFE2E8F0),
                fontSize: 13,
                height: 1.55,
                fontFamily: 'monospace',
              ),
            ),
          ),
        ],
      ),
    );
  }

  List<TextSpan> _highlight(String source, String language) {
    final keywords = _keywordsFor(language);
    final pattern = RegExp(
      r"""("(?:\\.|[^"])*"|'(?:\\.|[^'])*'|//[^\n]*|#[^\n]*|\b\d+(?:\.\d+)?\b|\b[A-Za-z_][A-Za-z0-9_]*\b)""",
      multiLine: true,
    );
    final spans = <TextSpan>[];
    var cursor = 0;

    for (final match in pattern.allMatches(source)) {
      if (match.start > cursor) {
        spans.add(TextSpan(text: source.substring(cursor, match.start)));
      }

      final token = match.group(0) ?? '';
      spans.add(TextSpan(
        text: token,
        style: TextStyle(color: _colorForToken(token, keywords)),
      ));
      cursor = match.end;
    }

    if (cursor < source.length) {
      spans.add(TextSpan(text: source.substring(cursor)));
    }

    return spans;
  }

  Color _colorForToken(String token, Set<String> keywords) {
    if (token.startsWith('"') || token.startsWith("'")) {
      return const Color(0xFFA7F3D0);
    }
    if (token.startsWith('//') || token.startsWith('#')) {
      return const Color(0xFF94A3B8);
    }
    if (RegExp(r'^\d').hasMatch(token)) {
      return const Color(0xFFFCA5A5);
    }
    if (keywords.contains(token)) {
      return const Color(0xFF93C5FD);
    }
    return const Color(0xFFE2E8F0);
  }

  Set<String> _keywordsFor(String language) {
    switch (language.toLowerCase()) {
      case 'dart':
        return {
          'async',
          'await',
          'class',
          'const',
          'final',
          'for',
          'if',
          'import',
          'in',
          'return',
          'var',
          'void',
          'while',
        };
      case 'js':
      case 'javascript':
      case 'ts':
      case 'typescript':
        return {
          'async',
          'await',
          'const',
          'export',
          'function',
          'if',
          'import',
          'let',
          'return',
          'type',
          'var',
        };
      case 'py':
      case 'python':
        return {
          'async',
          'await',
          'class',
          'def',
          'for',
          'from',
          'if',
          'import',
          'in',
          'return',
          'while',
        };
      default:
        return const {};
    }
  }
}

class _MarkdownSegment {
  const _MarkdownSegment._({
    required this.content,
    required this.isCode,
    this.language = '',
  });

  factory _MarkdownSegment.text(String content) {
    return _MarkdownSegment._(content: content, isCode: false);
  }

  factory _MarkdownSegment.code(String content, {required String language}) {
    return _MarkdownSegment._(
      content: content,
      isCode: true,
      language: language,
    );
  }

  final String content;
  final bool isCode;
  final String language;
}
