import 'package:flutter/material.dart';
import '../repositories/blast_charge_repository.dart';

// ---------------------------------------------------------------------------
// BlastChargeFormScreen — TIR-04 Mobile
// ---------------------------------------------------------------------------
// Offline-first blast charge capture per hole.
// Uses mobile_scanner for detonator serial barcode scan.
// Shows planned_qty_g for variance preview.
// ---------------------------------------------------------------------------

/// Simplified hole data loaded from local blast_plan cache (PowerSync).
class HoleEntry {
  final String id;
  final String label;
  final int plannedQtyG;

  const HoleEntry({
    required this.id,
    required this.label,
    required this.plannedQtyG,
  });
}

class BlastChargeFormScreen extends StatefulWidget {
  final String blastPlanId;
  final String operatorId;
  final List<HoleEntry> holes;
  final BlastChargeRepository repository;

  const BlastChargeFormScreen({
    super.key,
    required this.blastPlanId,
    required this.operatorId,
    required this.holes,
    required this.repository,
  });

  @override
  State<BlastChargeFormScreen> createState() => _BlastChargeFormScreenState();
}

class _BlastChargeFormScreenState extends State<BlastChargeFormScreen> {
  final Map<String, TextEditingController> _actualQtyControllers = {};
  final Map<String, TextEditingController> _detonatorControllers = {};
  bool _isSaving = false;

  @override
  void initState() {
    super.initState();
    for (final hole in widget.holes) {
      _actualQtyControllers[hole.id] = TextEditingController(
        text: hole.plannedQtyG.toString(),
      );
      _detonatorControllers[hole.id] = TextEditingController();
    }
  }

  @override
  void dispose() {
    for (final ctrl in _actualQtyControllers.values) {
      ctrl.dispose();
    }
    for (final ctrl in _detonatorControllers.values) {
      ctrl.dispose();
    }
    super.dispose();
  }

  double _computeVariance(HoleEntry hole) {
    final actualText = _actualQtyControllers[hole.id]?.text ?? '';
    final actual = int.tryParse(actualText) ?? hole.plannedQtyG;
    if (hole.plannedQtyG == 0) return 0;
    return ((actual - hole.plannedQtyG) / hole.plannedQtyG) * 100.0;
  }

  Future<void> _scanDetonator(String holeId) async {
    // In production: MobileScannerController().start() → reads barcode.
    // Here we show a dialog simulating the scan result for testability.
    final result = await showDialog<String>(
      context: context,
      builder: (ctx) {
        final ctrl = TextEditingController();
        return AlertDialog(
          title: const Text('Scan Detonator Serial'),
          content: TextField(
            controller: ctrl,
            decoration: const InputDecoration(
              hintText: 'Enter or scan serial number',
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx),
              child: const Text('Cancel'),
            ),
            TextButton(
              onPressed: () => Navigator.pop(ctx, ctrl.text),
              child: const Text('Confirm'),
            ),
          ],
        );
      },
    );
    if (result != null && result.isNotEmpty) {
      setState(() {
        _detonatorControllers[holeId]?.text = result;
      });
    }
  }

  Future<void> _saveAll() async {
    setState(() => _isSaving = true);
    try {
      for (final hole in widget.holes) {
        final actualText = _actualQtyControllers[hole.id]?.text ?? '';
        final actualQtyG = int.tryParse(actualText) ?? hole.plannedQtyG;
        final detonatorSerial = _detonatorControllers[hole.id]?.text;

        await widget.repository.append(
          id: '${widget.blastPlanId}-${hole.id}-${DateTime.now().millisecondsSinceEpoch}',
          blastPlanId: widget.blastPlanId,
          holeId: hole.id,
          productType: 'ANFO',
          plannedQtyG: hole.plannedQtyG,
          actualQtyG: actualQtyG,
          detonatorSerial: detonatorSerial?.isNotEmpty == true ? detonatorSerial : null,
          operatorId: widget.operatorId,
          occurredAtUtc: DateTime.now().toUtc(),
        );
      }
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Charges recorded — syncing when online')),
        );
        Navigator.pop(context, true);
      }
    } finally {
      if (mounted) setState(() => _isSaving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Blast Charge Entry'),
        actions: [
          if (_isSaving)
            const Padding(
              padding: EdgeInsets.all(16),
              child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
            )
          else
            TextButton(
              onPressed: _saveAll,
              child: const Text('Save All', style: TextStyle(color: Colors.white)),
            ),
        ],
      ),
      body: ListView.builder(
        padding: const EdgeInsets.all(16),
        itemCount: widget.holes.length,
        itemBuilder: (ctx, i) {
          final hole = widget.holes[i];
          return Card(
            margin: const EdgeInsets.only(bottom: 16),
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    hole.label,
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                  Text('Planned: ${hole.plannedQtyG} g'),
                  const SizedBox(height: 8),
                  TextField(
                    controller: _actualQtyControllers[hole.id],
                    keyboardType: TextInputType.number,
                    decoration: const InputDecoration(
                      labelText: 'Actual Quantity (g)',
                      border: OutlineInputBorder(),
                    ),
                    onChanged: (_) => setState(() {}),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    'Variance: ${_computeVariance(hole).toStringAsFixed(2)} %',
                    style: TextStyle(
                      color: _computeVariance(hole).abs() > 10 ? Colors.red : Colors.green,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      Expanded(
                        child: TextField(
                          controller: _detonatorControllers[hole.id],
                          decoration: const InputDecoration(
                            labelText: 'Detonator Serial (optional)',
                            border: OutlineInputBorder(),
                          ),
                        ),
                      ),
                      const SizedBox(width: 8),
                      IconButton(
                        icon: const Icon(Icons.qr_code_scanner),
                        tooltip: 'Scan barcode',
                        onPressed: () => _scanDetonator(hole.id),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }
}
