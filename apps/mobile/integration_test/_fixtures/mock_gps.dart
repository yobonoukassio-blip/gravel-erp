/// Mock GPS fixtures for Phase 2 integration tests.
///
/// Used by Foration, Extraction, Transport, HSE screens that capture
/// GPS at form submission. The real `geolocator` plugin is mocked at
/// test time via a Riverpod override that returns one of these factories.
library gravel.mobile.integration_test.fixtures.mock_gps;

class MockGpsPoint {
  final double lat;
  final double lng;
  final double accuracyM;
  final DateTime capturedAtUtc;

  const MockGpsPoint({
    required this.lat,
    required this.lng,
    required this.accuracyM,
    required this.capturedAtUtc,
  });

  /// Green accuracy band (D2-81): ≤ 10 m.
  factory MockGpsPoint.greenAccuracy({double? lat, double? lng}) => MockGpsPoint(
        lat: lat ?? 6.823,
        lng: lng ?? -5.241,
        accuracyM: 4.2,
        capturedAtUtc: DateTime.utc(2026, 5, 12, 6, 42),
      );

  /// Amber accuracy band (D2-81): 10–30 m.
  factory MockGpsPoint.amberAccuracy({double? lat, double? lng}) => MockGpsPoint(
        lat: lat ?? 6.823,
        lng: lng ?? -5.241,
        accuracyM: 18.5,
        capturedAtUtc: DateTime.utc(2026, 5, 12, 7, 15),
      );

  /// Red accuracy band (D2-81): > 30 m. UI must warn but never block.
  factory MockGpsPoint.redAccuracy({double? lat, double? lng}) => MockGpsPoint(
        lat: lat ?? 6.823,
        lng: lng ?? -5.241,
        accuracyM: 47.0,
        capturedAtUtc: DateTime.utc(2026, 5, 12, 7, 50),
      );

  /// Used to simulate a device with GPS unavailable.
  static const MockGpsPoint? unavailable = null;

  Map<String, dynamic> toJson() => {
        'lat': lat,
        'lng': lng,
        'accuracy_m': accuracyM,
        'captured_at_utc': capturedAtUtc.toIso8601String(),
      };
}
