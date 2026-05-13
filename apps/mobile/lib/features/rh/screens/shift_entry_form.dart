// ShiftEntryFormScreen — supervisor records employee check-in/out (RH-02).
// Offline-first: writes to local SQLite via ShiftEntryRepository,
// syncs when online via PowerSync append_only_event strategy.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/sync/append_only_repository.dart';
import '../repositories/shift_entry_repository.dart';

/// Minimal employee preview loaded from PowerSync local cache.
class EmployeePreview {
  const EmployeePreview({
    required this.id,
    required this.firstName,
    required this.lastName,
    required this.roleCode,
  });

  final String id;
  final String firstName;
  final String lastName;
  final String roleCode;

  String get displayName => '$firstName $lastName ($roleCode)';
}

/// ShiftEntryFormScreen — supervisor selects employee and records check-in.
///
/// Offline-first contract:
///   - Form submits to local SQLite via [ShiftEntryRepository.appendLocal]
///   - pending_sync = true until PowerSync ACKs
///   - No offline numbering needed (UUID is sufficient — not human-facing)
class ShiftEntryFormScreen extends ConsumerStatefulWidget {
  const ShiftEntryFormScreen({
    super.key,
    required this.operationalDayId,
    required this.siteId,
    required this.tenantId,
    required this.supervisorId,
    required this.ianaTimezone,
  });

  final String operationalDayId;
  final String siteId;
  final String tenantId;
  final String supervisorId;
  final String ianaTimezone;

  @override
  ConsumerState<ShiftEntryFormScreen> createState() => _ShiftEntryFormScreenState();
}

class _ShiftEntryFormScreenState extends ConsumerState<ShiftEntryFormScreen> {
  final _formKey = GlobalKey<FormState>();

  EmployeePreview? _selectedEmployee;
  String? _positionCode;
  bool _isSubmitting = false;
  String? _errorMessage;

  // Placeholder employee list — loaded from PowerSync local cache in production
  final List<EmployeePreview> _employees = const [
    EmployeePreview(
      id: 'emp-demo-001',
      firstName: 'Kouadio',
      lastName: 'Koffi',
      roleCode: 'FOREUR',
    ),
    EmployeePreview(
      id: 'emp-demo-002',
      firstName: 'Koné',
      lastName: 'Ibrahim',
      roleCode: 'CHAUFFEUR',
    ),
  ];

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    if (_selectedEmployee == null) return;

    setState(() {
      _isSubmitting = true;
      _errorMessage = null;
    });

    try {
      final repo = ref.read(shiftEntryRepositoryProvider);
      final entry = ShiftEntry(
        id: repo.newId(),
        tenantId: widget.tenantId,
        siteId: widget.siteId,
        operationalDayId: widget.operationalDayId,
        employeeId: _selectedEmployee!.id,
        checkInUtc: DateTime.now().toUtc(),
        supervisorId: widget.supervisorId,
        positionCode: _positionCode,
        createdAtLocal: DateTime.now(),
        ianaTimezone: widget.ianaTimezone,
        pendingSync: true,
      );

      await repo.appendLocal(entry);

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              'Pointage enregistré pour ${_selectedEmployee!.displayName}. '
              'Synchronisation en attente.',
            ),
          ),
        );
        Navigator.of(context).pop();
      }
    } on StateError catch (e) {
      setState(() => _errorMessage = e.message);
    } finally {
      if (mounted) setState(() => _isSubmitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Nouveau pointage')),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: Form(
          key: _formKey,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // Employee dropdown — loaded from local PowerSync cache
              DropdownButtonFormField<EmployeePreview>(
                decoration: const InputDecoration(
                  labelText: 'Employé *',
                  border: OutlineInputBorder(),
                ),
                value: _selectedEmployee,
                items: _employees
                    .map(
                      (e) => DropdownMenuItem(
                        value: e,
                        child: Text(e.displayName),
                      ),
                    )
                    .toList(),
                onChanged: (v) => setState(() => _selectedEmployee = v),
                validator: (v) => v == null ? 'Sélectionner un employé' : null,
              ),
              const SizedBox(height: 16),
              TextFormField(
                decoration: const InputDecoration(
                  labelText: 'Code poste (optionnel)',
                  border: OutlineInputBorder(),
                ),
                onChanged: (v) => setState(() => _positionCode = v.isEmpty ? null : v),
              ),
              const SizedBox(height: 8),
              if (_errorMessage != null)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 8),
                  child: Text(
                    _errorMessage!,
                    style: const TextStyle(color: Colors.red),
                  ),
                ),
              const SizedBox(height: 16),
              ElevatedButton.icon(
                onPressed: _isSubmitting ? null : _submit,
                icon: _isSubmitting
                    ? const SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.check_circle_outline),
                label: const Text('Enregistrer le pointage'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
