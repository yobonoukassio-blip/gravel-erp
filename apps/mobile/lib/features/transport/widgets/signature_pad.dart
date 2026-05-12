// Signature pad (TRP-02). Wraps the `signature` package and exposes a
// callback returning the captured PNG bytes plus their SHA-256 hex digest.
//
// Pad is compositor-friendly: it stays under 200 KB after PNG export
// (ADR-0009).

import 'dart:typed_data';

import 'package:crypto/crypto.dart';
import 'package:flutter/material.dart';
import 'package:signature/signature.dart';

class SignatureResult {
  const SignatureResult({required this.bytes, required this.sha256Hex});

  final Uint8List bytes;
  final String sha256Hex;
}

class SignaturePad extends StatefulWidget {
  const SignaturePad({
    super.key,
    required this.label,
    required this.onCaptured,
    this.height = 180,
  });

  final String label;
  final ValueChanged<SignatureResult?> onCaptured;
  final double height;

  @override
  State<SignaturePad> createState() => _SignaturePadState();
}

class _SignaturePadState extends State<SignaturePad> {
  late final SignatureController _controller;

  @override
  void initState() {
    super.initState();
    _controller = SignatureController(
      penStrokeWidth: 2.0,
      penColor: Colors.black,
      exportBackgroundColor: Colors.white,
    );
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _capture() async {
    if (_controller.isEmpty) {
      widget.onCaptured(null);
      return;
    }
    final png = await _controller.toPngBytes();
    if (png == null) {
      widget.onCaptured(null);
      return;
    }
    final digest = sha256.convert(png);
    widget.onCaptured(SignatureResult(bytes: png, sha256Hex: digest.toString()));
  }

  void _clear() {
    _controller.clear();
    widget.onCaptured(null);
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(widget.label, style: Theme.of(context).textTheme.titleSmall),
        const SizedBox(height: 4),
        SizedBox(
          height: widget.height,
          child: Signature(
            controller: _controller,
            backgroundColor: const Color(0xFFF5F5F5),
          ),
        ),
        const SizedBox(height: 4),
        Row(
          mainAxisAlignment: MainAxisAlignment.end,
          children: [
            TextButton.icon(
              onPressed: _clear,
              icon: const Icon(Icons.clear),
              label: const Text('Effacer'),
            ),
            const SizedBox(width: 8),
            FilledButton.icon(
              onPressed: _capture,
              icon: const Icon(Icons.check),
              label: const Text('Capturer'),
            ),
          ],
        ),
      ],
    );
  }
}
