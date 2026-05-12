/// Mock OperationalDay fixtures (Phase 1 D-19, used by Phase 2 entities).
///
/// OperationalDay is the FK every operational table carries — its resolution
/// uses the site's IANA timezone, not the device clock. These fixtures
/// short-circuit that resolution for integration tests.
library gravel.mobile.integration_test.fixtures.mock_operational_day;

class MockOperationalDay {
  final String id;
  final String siteId;
  final DateTime shiftStartLocal;
  final DateTime shiftEndLocal;
  final String ianaTimezone;
  final String calendarDate; // ISO yyyy-MM-dd

  const MockOperationalDay({
    required this.id,
    required this.siteId,
    required this.shiftStartLocal,
    required this.shiftEndLocal,
    required this.ianaTimezone,
    required this.calendarDate,
  });

  /// Standard pilot site (CIV01) — Africa/Abidjan, shift starts 06:00 local.
  factory MockOperationalDay.pilotCi({String? siteId}) => MockOperationalDay(
        id: '00000000-0000-0000-0000-00000000d001',
        siteId: siteId ?? '00000000-0000-0000-0000-000000000c01',
        shiftStartLocal: DateTime(2026, 5, 12, 6, 0),
        shiftEndLocal: DateTime(2026, 5, 12, 18, 0),
        ianaTimezone: 'Africa/Abidjan',
        calendarDate: '2026-05-12',
      );

  /// Burkina Faso site — Africa/Ouagadougou, same convention.
  factory MockOperationalDay.pilotBf({String? siteId}) => MockOperationalDay(
        id: '00000000-0000-0000-0000-00000000d002',
        siteId: siteId ?? '00000000-0000-0000-0000-000000000c02',
        shiftStartLocal: DateTime(2026, 5, 12, 6, 0),
        shiftEndLocal: DateTime(2026, 5, 12, 18, 0),
        ianaTimezone: 'Africa/Ouagadougou',
        calendarDate: '2026-05-12',
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'site_id': siteId,
        'shift_start_local': shiftStartLocal.toIso8601String(),
        'shift_end_local': shiftEndLocal.toIso8601String(),
        'iana_timezone': ianaTimezone,
        'calendar_date': calendarDate,
      };
}
