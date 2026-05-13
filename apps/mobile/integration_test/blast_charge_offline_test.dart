import 'package:flutter_test/flutter_test.dart';
import '../lib/features/tir/repositories/blast_charge_repository.dart';

/// TIR-04 Mobile integration test — offline blast charge capture.
///
/// 4 assertions:
///   1. 3 blast_charge rows created offline against a mock blast_plan_id
///   2. All 3 have pending_sync = true
///   3. listForBlastPlan(planId) returns 3 rows
///   4. Row with detonator_serial = 'DET-001' is retrievable
void main() {
  group('BlastChargeRepository — offline capture (TIR-04)', () {
    late BlastChargeRepository repo;
    const planId = 'plan-offline-test-001';
    const operatorId = 'op-terrain-001';

    setUp(() {
      repo = BlastChargeRepository();
    });

    test('creates 3 blast_charge rows offline with pending_sync=true', () async {
      // Arrange & Act: create 3 charge rows
      final c1 = await repo.append(
        id: 'charge-001',
        blastPlanId: planId,
        holeId: 'hole-A1',
        productType: 'ANFO',
        plannedQtyG: 10000,
        actualQtyG: 10200,
        detonatorSerial: 'DET-001',
        operatorId: operatorId,
      );
      final c2 = await repo.append(
        id: 'charge-002',
        blastPlanId: planId,
        holeId: 'hole-A2',
        productType: 'ANFO',
        plannedQtyG: 9500,
        actualQtyG: 9500,
        operatorId: operatorId,
      );
      final c3 = await repo.append(
        id: 'charge-003',
        blastPlanId: planId,
        holeId: 'hole-A3',
        productType: 'EMULSION',
        plannedQtyG: 5000,
        actualQtyG: 4800,
        operatorId: operatorId,
      );

      // Assertion 1: 3 rows created
      expect(c1.id, 'charge-001');
      expect(c2.id, 'charge-002');
      expect(c3.id, 'charge-003');

      // Assertion 2: all have pending_sync = true
      expect(c1.pendingSync, isTrue);
      expect(c2.pendingSync, isTrue);
      expect(c3.pendingSync, isTrue);

      // Assertion 3: listForBlastPlan returns exactly 3 rows
      final list = await repo.listForBlastPlan(planId);
      expect(list.length, 3);
      expect(list.every((c) => c.blastPlanId == planId), isTrue);

      // Assertion 4: row with detonator_serial = 'DET-001' is retrievable
      final bySerial = await repo.findByDetonatorSerial('DET-001');
      expect(bySerial, isNotNull);
      expect(bySerial!.detonatorSerial, 'DET-001');
      expect(bySerial.holeId, 'hole-A1');
    });

    test('variance_pct is computed correctly', () async {
      final charge = await repo.append(
        id: 'charge-variance',
        blastPlanId: planId,
        holeId: 'hole-V1',
        productType: 'ANFO',
        plannedQtyG: 10000,
        actualQtyG: 11000, // 10% over
        operatorId: operatorId,
      );
      expect(charge.variancePct, closeTo(10.0, 0.01));
    });

    test('listForBlastPlan returns only rows for the given planId', () async {
      await repo.append(
        id: 'charge-other',
        blastPlanId: 'OTHER-PLAN',
        holeId: 'hole-Z1',
        productType: 'ANFO',
        plannedQtyG: 1000,
        actualQtyG: 1000,
        operatorId: operatorId,
      );
      final list = await repo.listForBlastPlan(planId);
      expect(list.every((c) => c.blastPlanId == planId), isTrue);
    });
  });
}
