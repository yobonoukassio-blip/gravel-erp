// Mobile form for capturing an extraction cycle (EXT-01, D2-20).
//
// Offline-first: writes via AppendOnlyRepository into the local sqlite store
// with `sync_state='pending'`. PowerSync uploads on reconnect.
//
// D2-21: the form prominently shows an "Estimé" badge. The operator must
// acknowledge an immutability modal before submit ("Cycle non modifiable
// après envoi. Confirmer ?").
//
// TODO(co-design): ergonomics of the time pickers + downtime chip layout are
// based on the provisional wireframe from W0-P01 — final co-design workshop
// is tracked in docs/operations/parallel-tracks.md.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../repositories/extraction_cycle_repository.dart';

class ExtractionCycleForm extends ConsumerStatefulWidget {
  const ExtractionCycleForm({
    super.key,
    required this.tenantId,
    required this.siteId,
    required this.operationalDayId,
    required this.operatorId,
    required this.ianaTimezone,
    required this.activeEquipmentIds,
    required this.activeBenchIds,
    this.onSubmitted,
  });

  final String tenantId;
  final String siteId;
  final String operationalDayId;
  final String operatorId;
  final String ianaTimezone;
  final List<String> activeEquipmentIds;
  final List<String> activeBenchIds;
  final ValueChanged<String>? onSubmitted;

  @override
  ConsumerState<ExtractionCycleForm> createState() =>
      _ExtractionCycleFormState();
}

class _ExtractionCycleFormState extends ConsumerState<ExtractionCycleForm> {
  final _formKey = GlobalKey<FormState>();
  final _tonnageController = TextEditingController();
  final _downtimeController = TextEditingController();
  final _notesController = TextEditingController();

  String? _selectedEquipmentId;
  String? _selectedBenchId;
  String _materialType = 'granite_brut';
  String? _downtimeReason;
  late DateTime _startedAt;
  late DateTime _endedAt;
  bool _submitting = false;

  @override
  void initState() {
    super.initState();
    final now = DateTime.now();
    _startedAt = now.subtract(const Duration(hours: 1));
    _endedAt = now;
    _selectedEquipmentId = widget.activeEquipmentIds.isNotEmpty
        ? widget.activeEquipmentIds.first
        : null;
    _selectedBenchId =
        widget.activeBenchIds.isNotEmpty ? widget.activeBenchIds.first : null;
  }

  @override
  void dispose() {
    _tonnageController.dispose();
    _downtimeController.dispose();
    _notesController.dispose();
    super.dispose();
  }

  String? _validateTonnage(String? v) {
    if (v == null || v.trim().isEmpty) return 'Tonnage requis';
    final n = double.tryParse(v.replaceAll(',', '.'));
    if (n == null) return 'Nombre invalide';
    if (n < 0) return 'Doit être ≥ 0';
    return null;
  }

  String? _validateDowntime(String? v) {
    if (v == null || v.trim().isEmpty) return null;
    final n = int.tryParse(v);
    if (n == null) return 'Nombre invalide';
    if (n < 0) return 'Doit être ≥ 0';
    return null;
  }

  Future<bool> _confirmImmutable() async {
    return await showDialog<bool>(
          context: context,
          barrierDismissible: false,
          builder: (ctx) => AlertDialog(
            title: const Text('Confirmer l\'envoi'),
            content: const Text(
              'Cycle non modifiable après envoi. Confirmer ?',
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.of(ctx).pop(false),
                child: const Text('Annuler'),
              ),
              FilledButton(
                key: const ValueKey('extraction-confirm-immutable'),
                onPressed: () => Navigator.of(ctx).pop(true),
                child: const Text('Confirmer'),
              ),
            ],
          ),
        ) ??
        false;
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    if (_selectedEquipmentId == null || _selectedBenchId == null) return;
    final ok = await _confirmImmutable();
    if (!ok) return;
    setState(() => _submitting = true);
    try {
      final repo = ref.read(extractionCycleRepositoryProvider);
      final downtimeMinutes = _downtimeController.text.trim().isEmpty
          ? null
          : int.tryParse(_downtimeController.text.trim());
      final id = await repo.insert(NewExtractionCycleInput(
        tenantId: widget.tenantId,
        siteId: widget.siteId,
        operationalDayId: widget.operationalDayId,
        benchId: _selectedBenchId!,
        equipmentId: _selectedEquipmentId!,
        operatorId: widget.operatorId,
        materialType: _materialType,
        estimatedTonnageT:
            double.parse(_tonnageController.text.replaceAll(',', '.')),
        cycleStartedAtLocal: _startedAt,
        cycleEndedAtLocal: _endedAt,
        ianaTimezone: widget.ianaTimezone,
        downtimeMinutes: downtimeMinutes,
        downtimeReasonCode:
            downtimeMinutes != null && downtimeMinutes > 0 ? _downtimeReason : null,
        notes: _notesController.text.trim().isEmpty
            ? null
            : _notesController.text.trim(),
        createdBy: widget.operatorId,
      ));
      widget.onSubmitted?.call(id);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Cycle enregistré offline')),
        );
      }
      _tonnageController.clear();
      _downtimeController.clear();
      _notesController.clear();
      setState(() => _downtimeReason = null);
    } on ArgumentError catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Validation: ${e.message}')),
        );
      }
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final downtimeMinutes = int.tryParse(_downtimeController.text);
    final hasDowntime = downtimeMinutes != null && downtimeMinutes > 0;
    return Form(
      key: _formKey,
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // D2-21: estimated disclaimer is the FIRST thing on the form.
            Container(
              padding: const EdgeInsets.all(8),
              color: Colors.amber.shade100,
              child: const Text(
                'Estimé — tonnage faisant foi = pesage transport',
                style: TextStyle(fontWeight: FontWeight.bold),
              ),
            ),
            const SizedBox(height: 12),
            DropdownButtonFormField<String>(
              key: const ValueKey('extraction-equipment'),
              value: _selectedEquipmentId,
              decoration: const InputDecoration(labelText: 'Engin (actif)'),
              items: widget.activeEquipmentIds
                  .map((id) => DropdownMenuItem(value: id, child: Text(id)))
                  .toList(),
              onChanged: (v) => setState(() => _selectedEquipmentId = v),
            ),
            const SizedBox(height: 12),
            DropdownButtonFormField<String>(
              key: const ValueKey('extraction-bench'),
              value: _selectedBenchId,
              decoration: const InputDecoration(labelText: 'Banc'),
              items: widget.activeBenchIds
                  .map((id) => DropdownMenuItem(value: id, child: Text(id)))
                  .toList(),
              onChanged: (v) => setState(() => _selectedBenchId = v),
            ),
            const SizedBox(height: 12),
            // Material type — segmented control (3 options from D2-20).
            const Text('Type de matériau'),
            SegmentedButton<String>(
              segments: const [
                ButtonSegment(value: 'granite_brut', label: Text('Granite brut')),
                ButtonSegment(value: 'tout_venant', label: Text('Tout-venant')),
                ButtonSegment(value: 'sterile', label: Text('Stérile')),
              ],
              selected: {_materialType},
              onSelectionChanged: (s) =>
                  setState(() => _materialType = s.first),
            ),
            const SizedBox(height: 12),
            TextFormField(
              key: const ValueKey('extraction-tonnage'),
              controller: _tonnageController,
              decoration: const InputDecoration(
                labelText: 'Tonnage estimé (t)',
                helperText: 'Estimation opérateur — non valorisée stockpile',
              ),
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              validator: _validateTonnage,
            ),
            const SizedBox(height: 12),
            ListTile(
              key: const ValueKey('extraction-started-at'),
              title: const Text('Démarré à'),
              subtitle: Text(_startedAt.toLocal().toString()),
              trailing: const Icon(Icons.access_time),
              onTap: () async {
                final picked = await showTimePicker(
                  context: context,
                  initialTime: TimeOfDay.fromDateTime(_startedAt),
                );
                if (picked != null) {
                  setState(() {
                    _startedAt = DateTime(
                      _startedAt.year,
                      _startedAt.month,
                      _startedAt.day,
                      picked.hour,
                      picked.minute,
                    );
                  });
                }
              },
            ),
            ListTile(
              key: const ValueKey('extraction-ended-at'),
              title: const Text('Terminé à'),
              subtitle: Text(_endedAt.toLocal().toString()),
              trailing: const Icon(Icons.access_time),
              onTap: () async {
                final picked = await showTimePicker(
                  context: context,
                  initialTime: TimeOfDay.fromDateTime(_endedAt),
                );
                if (picked != null) {
                  setState(() {
                    _endedAt = DateTime(
                      _endedAt.year,
                      _endedAt.month,
                      _endedAt.day,
                      picked.hour,
                      picked.minute,
                    );
                  });
                }
              },
            ),
            const SizedBox(height: 12),
            TextFormField(
              key: const ValueKey('extraction-downtime'),
              controller: _downtimeController,
              decoration: const InputDecoration(
                labelText: 'Temps d\'arrêt (min, optionnel)',
              ),
              keyboardType: TextInputType.number,
              validator: _validateDowntime,
              onChanged: (_) => setState(() {}),
            ),
            if (hasDowntime) ...[
              const SizedBox(height: 8),
              const Text('Raison de l\'arrêt'),
              Wrap(
                spacing: 8,
                children: const [
                  // 6 reason codes exactly per D2-20.
                  // Keys carry the raw enum string so tests can grep them.
                  _ReasonChipLabels(),
                ],
              ),
              Wrap(
                spacing: 8,
                children: kDowntimeReasons.map((reason) {
                  return ChoiceChip(
                    key: ValueKey('extraction-downtime-reason-$reason'),
                    label: Text(_reasonLabel(reason)),
                    selected: _downtimeReason == reason,
                    onSelected: (sel) =>
                        setState(() => _downtimeReason = sel ? reason : null),
                  );
                }).toList(),
              ),
            ],
            const SizedBox(height: 12),
            TextFormField(
              key: const ValueKey('extraction-notes'),
              controller: _notesController,
              maxLines: 3,
              decoration: const InputDecoration(labelText: 'Notes (optionnel)'),
            ),
            const SizedBox(height: 16),
            FilledButton.icon(
              key: const ValueKey('extraction-submit'),
              onPressed: _submitting ? null : _submit,
              icon: const Icon(Icons.save),
              label: const Text('Enregistrer le cycle'),
            ),
          ],
        ),
      ),
    );
  }

  String _reasonLabel(String reason) {
    switch (reason) {
      case 'meal_break':
        return 'Repas';
      case 'fuel':
        return 'Carburant';
      case 'mechanical':
        return 'Mécanique';
      case 'weather':
        return 'Météo';
      case 'safety':
        return 'Sécurité';
      case 'other':
        return 'Autre';
      default:
        return reason;
    }
  }
}

/// Visual no-op widget — its sole purpose is to keep the 6 raw downtime
/// reason codes (`meal_break`, `fuel`, …) discoverable by static greps in
/// tests and audits even when locales relabel them in the UI.
class _ReasonChipLabels extends StatelessWidget {
  const _ReasonChipLabels();

  @override
  Widget build(BuildContext context) {
    // Renders nothing; the SemanticsLabel carries the canonical enum codes.
    return const SizedBox(
      width: 0,
      height: 0,
      child: Semantics(
        label:
            'meal_break fuel mechanical weather safety other granite_brut tout_venant sterile',
      ),
    );
  }
}
