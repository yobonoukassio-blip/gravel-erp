// Split-brain sync chaos harness (D-13).
// Implementing plan: W1-P03.
//
// Wave 0 stub — every method throws UnimplementedError.

class SyncChaosHarness {
  /// Disconnect the test client from PowerSync replica/server.
  Future<void> bringOffline() async {
    throw UnimplementedError('NOT IMPLEMENTED — plan W1-P03 (chaos harness)');
  }

  /// Restore connectivity and trigger sync.
  Future<void> bringOnline() async {
    throw UnimplementedError('NOT IMPLEMENTED — plan W1-P03');
  }

  /// Simulate two clients editing the same entity while offline.
  Future<void> simulateConflict() async {
    throw UnimplementedError('NOT IMPLEMENTED — plan W1-P03');
  }
}
