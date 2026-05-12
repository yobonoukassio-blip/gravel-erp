// REQ: FND-10 — Mobile capture offline du journal d'activité + sync sans perte ni doublon.
// Implementing plan: W1-P03 (sync + mobile activity-log feature).
//
// Wave 0 RED.
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets(
    "mobile captures journal d'activité offline, syncs on reconnect, no loss no duplicate",
    (tester) async {
      fail('NOT IMPLEMENTED — plan W1-P03 (sync + mobile)');
    },
  );

  testWidgets('events never use device.now() for ordering (Lamport / server_received_at per D-14)', (tester) async {
    fail('NOT IMPLEMENTED — plan W1-P03');
  });
}
