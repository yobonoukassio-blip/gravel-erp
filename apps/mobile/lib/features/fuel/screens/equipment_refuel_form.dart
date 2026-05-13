// EquipmentRefuel offline entry form (CAR-02, D2-51).
//
// UX rules (D2-81 pattern, consistent with drilled_hole_form.dart):
//   - Tank dropdown (filtered by site)
//   - Equipment dropdown (active only, filtered by site)
//   - Liters input (large numeric, required > 0)
//   - Hour meter reading (numeric, must be >= previous)
//   - Optional gauge photo (image_picker + compression + SHA-256)
//   - Optional notes
//   - Pre-submit confirmation: "Une fois envoyé, non modifiable."
//   - 56 dp minimum tap targets.
//   - Append-only: no edit after submit.

import 'dart:convert';
import 'dart:typed_data';

import 'package:crypto/crypto.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:uuid/uuid.dart';

import '../repositories/equipment_refuel_repository.dart';

class EquipmentRefuelFormScreen extends ConsumerStatefulWidget {
  const EquipmentRefuelFormScreen({super.key});

  @override
  ConsumerState<EquipmentRefuelFormScreen> createState() =>
      _EquipmentRefuelFormScreenState();
}

class _EquipmentRefuelFormScreenState
    extends ConsumerState<EquipmentRefuelFormScreen> {
  final _formKey = GlobalKey<FormState>();
  final _litersCtrl = TextEditingController();
  final _hourMeterCtrl = TextEditingController();
  final _notesCtrl = TextEditingController();

  String? _selectedTankId;
  String? _selectedEquipmentId;
  String? _gaugePhotoSha256;
  bool _submitting = false;

  static const _uuid = Uuid();

  @override
  void dispose() {
    _litersCtrl.dispose();
    _hourMeterCtrl.dispose();
    _notesCtrl.dispose();
    super.dispose();
  }

  /// Compute SHA-256 of photo bytes (mimics server-side content-addressing).
  String _computeSha256(Uint8List bytes) {
    return sha256.convert(bytes).toString();
  }

  /// Simulated gauge photo capture.
  Future<void> _captureGaugePhoto() async {
    // In production: use image_picker, compress, compute SHA-256.
    // Stubbed here to avoid build dependency on image_picker in the unit test target.
    const fakeBytes = [0x89, 0x50, 0x4e, 0x47]; // PNG magic bytes
    setState(() {
      _gaugePhotoSha256 = _computeSha256(Uint8List.fromList(fakeBytes));
    });
  }

  Future<bool> _confirmAppendOnly() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) {
        return AlertDialog(
          title: const Text('Confirmer le ravitaillement'),
          content: const Text(
            'Une fois envoyé, non modifiable. Confirmer ?',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(ctx).pop(false),
              child: const Text('Annuler'),
            ),
            FilledButton(
              onPressed: () => Navigator.of(ctx).pop(true),
              child: const Text('Envoyer'),
            ),
          ],
        );
      },
    );
    return ok ?? false;
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;

    final liters = double.parse(_litersCtrl.text.replaceAll(',', '.'));
    final hourMeter = double.parse(_hourMeterCtrl.text.replaceAll(',', '.'));

    // Validate hour meter against previous reading
    final repo = ref.read(equipmentRefuelRepositoryProvider);
    if (_selectedEquipmentId != null) {
      final previous = await repo.latestForEquipment(_selectedEquipmentId!);
      if (previous != null && hourMeter < previous.equipmentHourMeterReading) {
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              'Compteur horaire régressif: ${hourMeter.toStringAsFixed(1)} < ${previous.equipmentHourMeterReading.toStringAsFixed(1)}',
            ),
            backgroundColor: Colors.red,
          ),
        );
        return;
      }
    }

    final confirmed = await _confirmAppendOnly();
    if (!mounted || !confirmed) return;

    setState(() => _submitting = true);
    try {
      final now = DateTime.now();
      final refuel = EquipmentRefuel(
        id: _uuid.v4(),
        tenantId: 'tenant-current', // TODO(co-design): bind from auth CLS
        siteId: 'site-current',
        tankId: _selectedTankId ?? 'tank-current',
        equipmentId: _selectedEquipmentId ?? 'eq-current',
        operatorId: 'operator-current',
        liters: liters,
        equipmentHourMeterReading: hourMeter,
        operationalDayId: 'opday-current',
        createdAtLocal: now,
        ianaTimezone: 'Africa/Abidjan',
        createdBy: 'user-current',
        gaugePhotoBlobSha256: _gaugePhotoSha256,
        notes: _notesCtrl.text.isEmpty ? null : _notesCtrl.text,
      );

      await repo.appendLocal(refuel);

      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Ravitaillement enregistré — pending_sync'),
        ),
      );
      Navigator.of(context).pop();
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  Widget _glove(Widget child) =>
      ConstrainedBox(constraints: const BoxConstraints(minHeight: 56), child: child);

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Ravitaillement engin')),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Form(
          key: _formKey,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // Tank dropdown (filtered by site)
              _glove(DropdownButtonFormField<String>(
                key: const ValueKey('tank_dropdown'),
                decoration: const InputDecoration(
                  labelText: 'Cuve',
                  border: OutlineInputBorder(),
                ),
                value: _selectedTankId,
                items: const [
                  // TODO(co-design): bind to tank list from PowerSync
                  DropdownMenuItem(value: 'tank-1', child: Text('Cuve principale A')),
                  DropdownMenuItem(value: 'tank-2', child: Text('Cuve secondaire B')),
                ],
                onChanged: (v) => setState(() => _selectedTankId = v),
                validator: (v) => v == null ? 'Sélectionner une cuve' : null,
              )),
              const SizedBox(height: 12),

              // Equipment dropdown (active, filtered by site)
              _glove(DropdownButtonFormField<String>(
                key: const ValueKey('equipment_dropdown'),
                decoration: const InputDecoration(
                  labelText: 'Engin',
                  border: OutlineInputBorder(),
                ),
                value: _selectedEquipmentId,
                items: const [
                  // TODO(co-design): bind from PowerSync active equipment list
                  DropdownMenuItem(value: 'eq-1', child: Text('CAT 345 — EX-001')),
                  DropdownMenuItem(value: 'eq-2', child: Text('BELL 40D — TD-003')),
                ],
                onChanged: (v) => setState(() => _selectedEquipmentId = v),
                validator: (v) => v == null ? 'Sélectionner un engin' : null,
              )),
              const SizedBox(height: 12),

              // Liters — large tap target
              _glove(TextFormField(
                key: const ValueKey('liters'),
                controller: _litersCtrl,
                decoration: const InputDecoration(
                  labelText: 'Quantité (L)',
                  border: OutlineInputBorder(),
                ),
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                style: const TextStyle(fontSize: 22),
                validator: (v) {
                  if (v == null || v.trim().isEmpty) return 'Obligatoire';
                  final n = double.tryParse(v.replaceAll(',', '.'));
                  if (n == null || n <= 0) return 'Doit être > 0';
                  return null;
                },
              )),
              const SizedBox(height: 12),

              // Hour meter reading
              _glove(TextFormField(
                key: const ValueKey('equipment_hour_meter_reading'),
                controller: _hourMeterCtrl,
                decoration: const InputDecoration(
                  labelText: 'Compteur horaire (h)',
                  border: OutlineInputBorder(),
                ),
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                validator: (v) {
                  if (v == null || v.trim().isEmpty) return 'Obligatoire';
                  final n = double.tryParse(v.replaceAll(',', '.'));
                  if (n == null || n < 0) return 'Doit être >= 0';
                  return null;
                },
              )),
              const SizedBox(height: 12),

              // Gauge photo (optional)
              ListTile(
                contentPadding: EdgeInsets.zero,
                title: Text(
                  _gaugePhotoSha256 != null
                      ? 'Photo jauge: ${_gaugePhotoSha256!.substring(0, 8)}…'
                      : 'Photo jauge (optionnel)',
                ),
                trailing: IconButton(
                  key: const ValueKey('photo_button'),
                  icon: Icon(
                    _gaugePhotoSha256 != null
                        ? Icons.check_circle
                        : Icons.camera_alt,
                    color: _gaugePhotoSha256 != null ? Colors.green : null,
                  ),
                  onPressed: _captureGaugePhoto,
                  tooltip: 'Photographier la jauge',
                ),
              ),
              const SizedBox(height: 8),

              // Notes
              TextFormField(
                key: const ValueKey('notes'),
                controller: _notesCtrl,
                maxLines: 3,
                decoration: const InputDecoration(
                  labelText: 'Notes (optionnel)',
                  border: OutlineInputBorder(),
                ),
              ),
              const SizedBox(height: 24),

              SizedBox(
                height: 56,
                child: FilledButton.icon(
                  key: const ValueKey('submit'),
                  onPressed: _submitting ? null : _submit,
                  icon: const Icon(Icons.local_gas_station),
                  label: const Text('Enregistrer'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
