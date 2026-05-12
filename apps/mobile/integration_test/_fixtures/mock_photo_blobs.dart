/// Mock photo blob fixtures for content-addressed S3 attachments
/// (Phase 2 D-29 / D2-61).
///
/// Tests that exercise photo upload paths (HSE incident, fuel gauge,
/// stockpile adjustment) need deterministic byte content + matching SHA-256.
/// These factories provide that.
library gravel.mobile.integration_test.fixtures.mock_photo_blobs;

import 'dart:convert';
import 'dart:typed_data';

import 'package:crypto/crypto.dart';

class MockPhotoBlob {
  final String sha256Hex;
  final int sizeKb;
  final Uint8List content;
  final String mimeType;

  const MockPhotoBlob({
    required this.sha256Hex,
    required this.sizeKb,
    required this.content,
    this.mimeType = 'image/jpeg',
  });

  /// Build a deterministic mock photo from a seed string.
  /// The seed becomes the body bytes; the sha256 is computed over those bytes.
  factory MockPhotoBlob.fromSeed(String seed, {int sizeKb = 512}) {
    final base = utf8.encode(seed);
    // Pad to roughly `sizeKb` KB by repeating the seed bytes.
    final targetBytes = sizeKb * 1024;
    final bytes = BytesBuilder();
    while (bytes.length < targetBytes) {
      bytes.add(base);
    }
    final content = Uint8List.fromList(bytes.takeBytes().take(targetBytes).toList());
    final digest = sha256.convert(content);
    return MockPhotoBlob(
      sha256Hex: digest.toString(),
      sizeKb: sizeKb,
      content: content,
    );
  }

  /// Pre-built fixtures referenced by name in specs.
  static MockPhotoBlob gaugeRefuelOk() => MockPhotoBlob.fromSeed('gauge-refuel-ok-2026-05-12', sizeKb: 512);
  static MockPhotoBlob hseIncidentAttachment() =>
      MockPhotoBlob.fromSeed('hse-incident-2026-05-12-cv01-photo1', sizeKb: 1024);
  static MockPhotoBlob stockpileAdjustment() =>
      MockPhotoBlob.fromSeed('stockpile-adj-2026-05-12-cv01-stk02', sizeKb: 256);

  Map<String, dynamic> toJson() => {
        'sha256_hex': sha256Hex,
        'size_kb': sizeKb,
        'mime_type': mimeType,
      };
}
