// Weighing ticket entry form (TRP-02, D2-31, D2-32, D2-33).
//
// Landscape-optimized for Samsung Tab Active 3 (pont-bascule operator).
// Offline-first: generates a local ticket number via OfflineTicketNumbering,
// captures gross/tare, computes net live, captures client + driver
// signatures, computes content_hash client-side using the canonical
// payload form (ADR-0009), and appends to local Drift store with
// pending_sync=true and is_offline_generated=true.

import 'dart:convert';

import 'package:crypto/crypto.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:uuid/uuid.dart';

import '../repositories/weighing_ticket_repository.dart';
import '../services/offline_ticket_numbering.dart';
import '../widgets/signature_pad.dart';

class WeighingTicketFormScreen extends ConsumerStatefulWidget {
  const WeighingTicketFormScreen({
    super.key,
    required this.siteCode,
    required this.operationalDayId,
    required this.weighingStationCode,
    required this.tenantId,
    required this.siteId,
  });

  final String siteCode;
  final String operationalDayId;
  final String weighingStationCode;
  final String tenantId;
  final String siteId;

  @override
  ConsumerState<WeighingTicketFormScreen> createState() =>
      _WeighingTicketFormScreenState();
}

class _WeighingTicketFormScreenState
    extends ConsumerState<WeighingTicketFormScreen> {
  final _formKey = GlobalKey<FormState>();
  final _grossCtrl = TextEditingController();
  final _tareCtrl = TextEditingController();
  final _notesCtrl = TextEditingController();

  static const _uuid = Uuid();
  static const _materialTypes = <String>['granite_brut', 'tout_venant', 'sterile'];

  String? _truckId = 'truck-1';
  String? _driverId = 'driver-1';
  String _materialType = 'granite_brut';
  SignatureResult? _clientSignature;
  SignatureResult? _driverSignature;
  bool _submitting = false;

  int get _grossKg => int.tryParse(_grossCtrl.text.trim()) ?? 0;
  int get _tareKg => int.tryParse(_tareCtrl.text.trim()) ?? 0;
  int get _netKg => _grossKg - _tareKg;

  @override
  void dispose() {
    _grossCtrl.dispose();
    _tareCtrl.dispose();
    _notesCtrl.dispose();
    super.dispose();
  }

  /// Canonical payload formatter — must match
  /// `WeighingTicketService.computeContentHash` on the server.
  String _canonicalLocalTs(DateTime d) {
    String pad(int n) => n.toString().padLeft(2, '0');
    return '${d.year.toString().padLeft(4, '0')}-${pad(d.month)}-${pad(d.day)}'
        'T${pad(d.hour)}:${pad(d.minute)}:${pad(d.second)}';
  }

  String _computeContentHash({
    required String ticketNumber,
    required int grossKg,
    required int tareKg,
    required int netKg,
    required String truckId,
    required String driverId,
    required String materialType,
    required DateTime weighedAtLocal,
    required String ianaTimezone,
    required String weighingStationCode,
    required String? clientSignatureSha256,
    required String? driverSignatureSha256,
  }) {
    final ordered = <String, dynamic>{
      'ticket_number': ticketNumber,
      'gross_kg': grossKg,
      'tare_kg': tareKg,
      'net_kg': netKg,
      'truck_equipment_id': truckId,
      'driver_id': driverId,
      'material_type': materialType,
      'weighed_at_local': _canonicalLocalTs(weighedAtLocal),
      'iana_timezone': ianaTimezone,
      'weighing_station_code': weighingStationCode,
      'client_signature_sha256': clientSignatureSha256,
      'driver_signature_sha256': driverSignatureSha256,
    };
    final json = jsonEncode(ordered);
    return sha256.convert(utf8.encode(json)).toString();
  }

  Future<bool> _confirmAppendOnly() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) {
        return AlertDialog(
          title: const Text('Confirmer envoi'),
          content: const Text('Ticket non modifiable. Confirmer.'),
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
    if (_truckId == null || _driverId == null) return;
    if (_netKg <= 0) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Net invalide (gross > tare requis)')),
      );
      return;
    }
    final confirmed = await _confirmAppendOnly();
    if (!mounted || !confirmed) return;

    setState(() => _submitting = true);
    try {
      final numbering = ref.read(offlineTicketNumberingProvider);
      final now = DateTime.now();
      final ticketNumber = await numbering.generate(
        siteCode: widget.siteCode,
        date: now,
      );
      const ianaTz = 'Africa/Abidjan';
      final contentHash = _computeContentHash(
        ticketNumber: ticketNumber,
        grossKg: _grossKg,
        tareKg: _tareKg,
        netKg: _netKg,
        truckId: _truckId!,
        driverId: _driverId!,
        materialType: _materialType,
        weighedAtLocal: now,
        ianaTimezone: ianaTz,
        weighingStationCode: widget.weighingStationCode,
        clientSignatureSha256: _clientSignature?.sha256Hex,
        driverSignatureSha256: _driverSignature?.sha256Hex,
      );

      final ticket = WeighingTicket(
        id: _uuid.v4(),
        tenantId: widget.tenantId,
        siteId: widget.siteId,
        ticketNumber: ticketNumber,
        grossKg: _grossKg,
        tareKg: _tareKg,
        truckEquipmentId: _truckId!,
        driverId: _driverId!,
        materialType: _materialType,
        weighedAtLocal: now,
        ianaTimezone: ianaTz,
        operationalDayId: widget.operationalDayId,
        weighingStationCode: widget.weighingStationCode,
        clientSignatureBlobSha256: _clientSignature?.sha256Hex,
        driverSignatureBlobSha256: _driverSignature?.sha256Hex,
        notes: _notesCtrl.text.isEmpty ? null : _notesCtrl.text,
        isOfflineGenerated: true,
        contentHash: contentHash,
        createdAtLocal: now,
      );

      final repo = ref.read(weighingTicketRepositoryProvider);
      await repo.appendLocal(ticket);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Ticket $ticketNumber — pending_sync')),
      );
      Navigator.of(context).pop(ticket);
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  Widget _glove(Widget child) => ConstrainedBox(
        constraints: const BoxConstraints(minHeight: 56),
        child: child,
      );

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Pesage — Nouveau ticket')),
      body: SafeArea(
        child: Form(
          key: _formKey,
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                // Landscape: left numeric inputs, right signatures.
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          _glove(TextFormField(
                            controller: _grossCtrl,
                            decoration: const InputDecoration(
                              labelText: 'Poids brut (kg)',
                              border: OutlineInputBorder(),
                            ),
                            keyboardType: TextInputType.number,
                            onChanged: (_) => setState(() {}),
                            validator: (v) =>
                                v == null || int.tryParse(v) == null
                                    ? 'Numérique requis'
                                    : null,
                          )),
                          const SizedBox(height: 12),
                          _glove(TextFormField(
                            controller: _tareCtrl,
                            decoration: const InputDecoration(
                              labelText: 'Tare (kg)',
                              border: OutlineInputBorder(),
                            ),
                            keyboardType: TextInputType.number,
                            onChanged: (_) => setState(() {}),
                            validator: (v) =>
                                v == null || int.tryParse(v) == null
                                    ? 'Numérique requis'
                                    : null,
                          )),
                          const SizedBox(height: 12),
                          Text(
                            'Net: $_netKg kg',
                            style: Theme.of(context).textTheme.titleLarge,
                          ),
                          const SizedBox(height: 12),
                          DropdownButtonFormField<String>(
                            value: _materialType,
                            decoration: const InputDecoration(
                              labelText: 'Matériau',
                              border: OutlineInputBorder(),
                            ),
                            items: _materialTypes
                                .map((m) => DropdownMenuItem(
                                    value: m, child: Text(m)))
                                .toList(),
                            onChanged: (v) =>
                                setState(() => _materialType = v ?? 'granite_brut'),
                          ),
                          const SizedBox(height: 12),
                          DropdownButtonFormField<String>(
                            value: _truckId,
                            decoration: const InputDecoration(
                              labelText: 'Camion',
                              border: OutlineInputBorder(),
                            ),
                            items: const [
                              DropdownMenuItem(
                                  value: 'truck-1', child: Text('Truck 1')),
                              DropdownMenuItem(
                                  value: 'truck-2', child: Text('Truck 2')),
                            ],
                            onChanged: (v) => setState(() => _truckId = v),
                          ),
                          const SizedBox(height: 12),
                          DropdownButtonFormField<String>(
                            value: _driverId,
                            decoration: const InputDecoration(
                              labelText: 'Chauffeur',
                              border: OutlineInputBorder(),
                            ),
                            items: const [
                              DropdownMenuItem(
                                  value: 'driver-1', child: Text('Driver 1')),
                              DropdownMenuItem(
                                  value: 'driver-2', child: Text('Driver 2')),
                            ],
                            onChanged: (v) => setState(() => _driverId = v),
                          ),
                          const SizedBox(height: 12),
                          TextFormField(
                            controller: _notesCtrl,
                            maxLines: 2,
                            decoration: const InputDecoration(
                              labelText: 'Notes (optionnel)',
                              border: OutlineInputBorder(),
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(width: 16),
                    Expanded(
                      child: Column(
                        children: [
                          SignaturePad(
                            label: 'Signature client',
                            onCaptured: (r) => setState(() => _clientSignature = r),
                          ),
                          const SizedBox(height: 12),
                          SignaturePad(
                            label: 'Signature chauffeur',
                            onCaptured: (r) => setState(() => _driverSignature = r),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 24),
                SizedBox(
                  height: 56,
                  child: FilledButton.icon(
                    onPressed: _submitting ? null : _submit,
                    icon: const Icon(Icons.send),
                    label: const Text('Enregistrer ticket — content_hash signé'),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
