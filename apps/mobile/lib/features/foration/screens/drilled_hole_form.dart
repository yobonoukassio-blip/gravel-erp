// Mobile drilled hole entry form (D2-11, D2-12, D2-81, D2-83).
//
// FOR-02: offline-first capture of one drilled hole. Append-only — once
// submitted to the local Drift store, no edit. Corrections come back as
// new rows referencing this one via `correctsHoleId`.
//
// FOR-04: fuel_liters_consumed captured here.
//
// UX rules (D2-81):
//   - GPS accuracy indicator visible & colored (red > 30 / amber > 10 / green)
//   - Tolerance check (D2-12): depth > 10% or diameter > 5% deviation
//     opens a confirmation modal demanding a free-text reason — NOT
//     blocking.
//   - Pre-submit confirmation: "Une fois envoyé, non modifiable."
//   - 56 dp minimum tap targets on every interactive element.
//   - Auto-save: draft every 5 seconds while form is dirty.
//
// TODO(co-design): screen layout below is provisional from
// docs/design/phase-02/provisional-wireframes.md. Confirm with the 3
// field operators during the co-design workshop. Items needing review:
//   - whether to show planned vs actual side-by-side or stacked
//   - slider vs picker for inclinaison
//   - whether the "photo optionnelle" CTA stays in primary or secondary
//   - bottom-sheet vs full-screen modal for tolerance confirmation

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:uuid/uuid.dart';

import '../providers/foration_providers.dart';
import '../repositories/drilled_hole_repository.dart';
import '../widgets/gps_accuracy_indicator.dart';

class DrilledHoleFormScreen extends ConsumerStatefulWidget {
  const DrilledHoleFormScreen({super.key, required this.planId});

  final String planId;

  @override
  ConsumerState<DrilledHoleFormScreen> createState() =>
      _DrilledHoleFormScreenState();
}

class _DrilledHoleFormScreenState
    extends ConsumerState<DrilledHoleFormScreen> {
  final _formKey = GlobalKey<FormState>();
  final _depthCtrl = TextEditingController();
  final _diameterCtrl = TextEditingController();
  final _fuelCtrl = TextEditingController();
  final _notesCtrl = TextEditingController();

  double _inclinationDeg = 0.0;
  double? _gpsAccuracyM = 8.0;
  double? _gpsLatitude;
  double? _gpsLongitude;
  bool _submitting = false;
  Timer? _autoSaveTimer;
  bool _dirty = false;

  static const _uuid = Uuid();

  @override
  void initState() {
    super.initState();
    _startAutoSave();
  }

  void _startAutoSave() {
    _autoSaveTimer?.cancel();
    _autoSaveTimer = Timer.periodic(const Duration(seconds: 5), (_) {
      if (_dirty) {
        _saveDraft();
      }
    });
  }

  void _saveDraft() {
    // Draft persistence wired against Drift in follow-up task.
    // For now we just mark the dirty flag handled.
    _dirty = false;
  }

  @override
  void dispose() {
    _autoSaveTimer?.cancel();
    _depthCtrl.dispose();
    _diameterCtrl.dispose();
    _fuelCtrl.dispose();
    _notesCtrl.dispose();
    super.dispose();
  }

  /// Plan target — wired against the local plan cache in follow-up.
  /// Stubbed at module level until the Drift codegen lands.
  ({double depthM, int diameterMm}) _planTarget() {
    final plans = ref.read(activeDrillingPlansProvider);
    final plan = plans.firstWhere(
      (p) => p.id == widget.planId,
      orElse: () => plans.first,
    );
    return (depthM: plan.targetDepthM, diameterMm: plan.targetDiameterMm);
  }

  bool _checkTolerance({
    required double actualDepthM,
    required int actualDiameterMm,
  }) {
    final target = _planTarget();
    final depthDeviation =
        (actualDepthM - target.depthM).abs() / target.depthM;
    final diameterDeviation =
        (actualDiameterMm - target.diameterMm).abs() / target.diameterMm;
    return depthDeviation > 0.10 || diameterDeviation > 0.05;
  }

  Future<String?> _askToleranceReason() async {
    final reasonCtrl = TextEditingController();
    final reason = await showDialog<String>(
      context: context,
      builder: (ctx) {
        return AlertDialog(
          title: const Text('Hors tolérance — Confirmer ?'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Text(
                'L\'écart dépasse la tolérance (>10% profondeur ou >5% diamètre).'
                '\nVeuillez expliquer pourquoi vous confirmez quand même.',
              ),
              const SizedBox(height: 12),
              TextField(
                controller: reasonCtrl,
                maxLines: 3,
                decoration: const InputDecoration(
                  labelText: 'Raison',
                  border: OutlineInputBorder(),
                ),
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(ctx).pop(null),
              child: const Text('Annuler'),
            ),
            FilledButton(
              onPressed: () {
                final r = reasonCtrl.text.trim();
                if (r.isEmpty) return;
                Navigator.of(ctx).pop(r);
              },
              child: const Text('Confirmer'),
            ),
          ],
        );
      },
    );
    reasonCtrl.dispose();
    return reason;
  }

  Future<bool> _confirmAppendOnly() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) {
        return AlertDialog(
          title: const Text('Confirmer envoi'),
          content: const Text(
            'Une fois envoyé, non modifiable. Confirmer.',
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
    final depth = double.parse(_depthCtrl.text.replaceAll(',', '.'));
    final diameter = int.parse(_diameterCtrl.text);

    String? reason;
    if (_checkTolerance(actualDepthM: depth, actualDiameterMm: diameter)) {
      reason = await _askToleranceReason();
      if (!mounted) return;
      if (reason == null) {
        // User cancelled — do not submit but keep form data.
        return;
      }
    }

    final confirmed = await _confirmAppendOnly();
    if (!mounted || !confirmed) return;

    setState(() => _submitting = true);
    try {
      final repo = ref.read(drilledHoleRepositoryProvider);
      final now = DateTime.now();
      final hole = DrilledHole(
        id: _uuid.v4(),
        tenantId: 'tenant-current', // TODO(co-design): bind from auth CLS
        siteId: 'site-current',
        planId: widget.planId,
        holeIndexInPlan: 1, // TODO(co-design): bind to plan progress
        gpsLatitude: _gpsLatitude,
        gpsLongitude: _gpsLongitude,
        gpsAccuracyM: _gpsAccuracyM,
        actualDepthM: depth,
        actualDiameterMm: diameter,
        inclinationDeg: _inclinationDeg,
        startedAtLocal: now.subtract(const Duration(minutes: 30)),
        endedAtLocal: now,
        createdAtLocal: now,
        ianaTimezone: 'Africa/Abidjan',
        operationalDayId: 'opday-current',
        operatorId: 'operator-current',
        machineId: 'machine-current',
        fuelLitersConsumed: _fuelCtrl.text.isEmpty
            ? null
            : double.tryParse(_fuelCtrl.text.replaceAll(',', '.')),
        notesText: _notesCtrl.text.isEmpty ? null : _notesCtrl.text,
        toleranceViolation: reason != null,
        toleranceViolationReason: reason,
      );

      await repo.appendLocal(hole);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Trou enregistré — pending_sync')),
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
      appBar: AppBar(title: const Text('Saisie trou foré')),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Form(
          key: _formKey,
          onChanged: () => _dirty = true,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              GpsAccuracyIndicator(accuracyM: _gpsAccuracyM),
              const SizedBox(height: 16),
              _glove(TextFormField(
                key: const ValueKey('depth'),
                controller: _depthCtrl,
                decoration: const InputDecoration(
                  labelText: 'Profondeur réelle (m)',
                  border: OutlineInputBorder(),
                ),
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                validator: (v) =>
                    v == null || v.trim().isEmpty ? 'Obligatoire' : null,
              )),
              const SizedBox(height: 12),
              _glove(TextFormField(
                key: const ValueKey('diameter'),
                controller: _diameterCtrl,
                decoration: const InputDecoration(
                  labelText: 'Diamètre (mm)',
                  border: OutlineInputBorder(),
                ),
                keyboardType: TextInputType.number,
                validator: (v) =>
                    v == null || v.trim().isEmpty ? 'Obligatoire' : null,
              )),
              const SizedBox(height: 12),
              Text('Inclinaison: ${_inclinationDeg.toStringAsFixed(0)}°'),
              Slider(
                value: _inclinationDeg,
                min: 0,
                max: 90,
                divisions: 90,
                onChanged: (v) => setState(() {
                  _inclinationDeg = v;
                  _dirty = true;
                }),
              ),
              const SizedBox(height: 12),
              _glove(TextFormField(
                key: const ValueKey('fuel'),
                controller: _fuelCtrl,
                decoration: const InputDecoration(
                  labelText: 'Carburant consommé (L)',
                  border: OutlineInputBorder(),
                ),
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
              )),
              const SizedBox(height: 12),
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
                  icon: const Icon(Icons.send),
                  label: const Text('Envoyer'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
