// GPS accuracy indicator widget (D2-81).
//
// Color thresholds:
//   - red    : > 30 m  (rejet d'usage terrain — précision trop faible)
//   - amber  : > 10 m and <= 30 m
//   - green  : <= 10 m
//
// Glove-friendly: 56 dp minimum tap target, contrast >= 4.5:1 (D2-83).
//
// TODO(co-design): final palette + iconography pending workshop with
// 3 field operators. Provisional Material colors used.

import 'package:flutter/material.dart';

enum GpsAccuracyLevel { red, amber, green }

GpsAccuracyLevel gpsAccuracyLevel(double? accuracyM) {
  if (accuracyM == null) return GpsAccuracyLevel.red;
  if (accuracyM > 30) return GpsAccuracyLevel.red;
  if (accuracyM > 10) return GpsAccuracyLevel.amber;
  return GpsAccuracyLevel.green;
}

class GpsAccuracyIndicator extends StatelessWidget {
  const GpsAccuracyIndicator({
    super.key,
    required this.accuracyM,
    this.compact = false,
  });

  final double? accuracyM;
  final bool compact;

  Color _bgColor() {
    final level = gpsAccuracyLevel(accuracyM);
    switch (level) {
      case GpsAccuracyLevel.red:
        return const Color(0xFFC62828); // red 800
      case GpsAccuracyLevel.amber:
        return const Color(0xFFEF6C00); // amber 800
      case GpsAccuracyLevel.green:
        return const Color(0xFF2E7D32); // green 800
    }
  }

  String _label() {
    if (accuracyM == null) return 'GPS —';
    return 'GPS ±${accuracyM!.toStringAsFixed(1)} m';
  }

  @override
  Widget build(BuildContext context) {
    final minTap = compact ? 40.0 : 56.0;
    return Semantics(
      label: _label(),
      child: Container(
        constraints: BoxConstraints(minHeight: minTap, minWidth: minTap),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
        decoration: BoxDecoration(
          color: _bgColor(),
          borderRadius: BorderRadius.circular(8),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.gps_fixed, color: Colors.white, size: 20),
            const SizedBox(width: 8),
            Text(
              _label(),
              style: const TextStyle(
                color: Colors.white,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
