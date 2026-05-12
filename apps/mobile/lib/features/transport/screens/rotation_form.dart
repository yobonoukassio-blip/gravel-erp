// Rotation form (TRP-01). Mobile-side capture of a truck rotation linked
// to an existing weighing ticket. Append-only.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:uuid/uuid.dart';

import '../repositories/rotation_repository.dart';

class RotationFormScreen extends ConsumerStatefulWidget {
  const RotationFormScreen({
    super.key,
    required this.tenantId,
    required this.siteId,
    required this.operationalDayId,
    required this.weighingTicketId,
  });

  final String tenantId;
  final String siteId;
  final String operationalDayId;
  final String weighingTicketId;

  @override
  ConsumerState<RotationFormScreen> createState() => _RotationFormScreenState();
}

class _RotationFormScreenState extends ConsumerState<RotationFormScreen> {
  final _formKey = GlobalKey<FormState>();
  static const _uuid = Uuid();

  String? _benchId = 'bench-1';
  String? _zoneId = 'zone-1';
  String _materialType = 'granite_brut';
  bool _submitting = false;
  DateTime? _unloadedAt;

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() => _submitting = true);
    try {
      final now = DateTime.now();
      final rotation = TruckRotation(
        id: _uuid.v4(),
        tenantId: widget.tenantId,
        siteId: widget.siteId,
        operationalDayId: widget.operationalDayId,
        loadedAtBenchId: _benchId ?? 'bench-1',
        unloadedAtZoneId: _zoneId ?? 'zone-1',
        materialType: _materialType,
        weighingTicketId: widget.weighingTicketId,
        loadedAtUtc: now.toUtc(),
        unloadedAtUtc: _unloadedAt?.toUtc(),
        createdAtLocal: now,
        ianaTimezone: 'Africa/Abidjan',
      );
      final repo = ref.read(rotationRepositoryProvider);
      await repo.appendLocal(rotation);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Rotation enregistrée — pending_sync')),
      );
      Navigator.of(context).pop(rotation);
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Nouvelle rotation')),
      body: Form(
        key: _formKey,
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text('Ticket de pesage: ${widget.weighingTicketId}'),
              const SizedBox(height: 12),
              DropdownButtonFormField<String>(
                value: _benchId,
                decoration: const InputDecoration(
                  labelText: 'Banc de chargement',
                  border: OutlineInputBorder(),
                ),
                items: const [
                  DropdownMenuItem(value: 'bench-1', child: Text('Bench 1')),
                  DropdownMenuItem(value: 'bench-2', child: Text('Bench 2')),
                ],
                onChanged: (v) => setState(() => _benchId = v),
              ),
              const SizedBox(height: 12),
              DropdownButtonFormField<String>(
                value: _zoneId,
                decoration: const InputDecoration(
                  labelText: 'Zone de déchargement',
                  border: OutlineInputBorder(),
                ),
                items: const [
                  DropdownMenuItem(value: 'zone-1', child: Text('Zone 1')),
                  DropdownMenuItem(value: 'zone-2', child: Text('Zone 2')),
                ],
                onChanged: (v) => setState(() => _zoneId = v),
              ),
              const SizedBox(height: 12),
              DropdownButtonFormField<String>(
                value: _materialType,
                decoration: const InputDecoration(
                  labelText: 'Matériau',
                  border: OutlineInputBorder(),
                ),
                items: const [
                  DropdownMenuItem(
                      value: 'granite_brut', child: Text('Granite brut')),
                  DropdownMenuItem(
                      value: 'tout_venant', child: Text('Tout venant')),
                  DropdownMenuItem(value: 'sterile', child: Text('Stérile')),
                ],
                onChanged: (v) =>
                    setState(() => _materialType = v ?? 'granite_brut'),
              ),
              const SizedBox(height: 24),
              SizedBox(
                height: 56,
                child: FilledButton.icon(
                  onPressed: _submitting ? null : _submit,
                  icon: const Icon(Icons.send),
                  label: const Text('Enregistrer rotation'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
