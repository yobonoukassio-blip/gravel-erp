// HSE Incident form screen (HSE-01). Mobile-side capture of a new incident.
// Append-only: once submitted, the incident row is immutable (ADR-0008).
//
// Features:
//   - category (segmented selector)
//   - severity (1–5 stepper with color cue)
//   - location_text + GPS auto-capture
//   - chronology_md (multi-line markdown)
//   - people_impacted (dynamic add/remove rows)
//   - equipment_impacted (multi-value text input)
//   - photos (image_picker + flutter_image_compress → SHA-256 → S3 pre-signed upload)
//   - Confirmation modal "Incident immuable après envoi. Confirmer."

import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:uuid/uuid.dart';

import '../repositories/incident_repository.dart';

// ---------------------------------------------------------------------------
// Photo stub model (production: image_picker + flutter_image_compress)
// ---------------------------------------------------------------------------

class PhotoAttachment {
  const PhotoAttachment({required this.sha256Hex, required this.sizeBytes});
  final String sha256Hex;
  final int sizeBytes;
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

class IncidentFormScreen extends ConsumerStatefulWidget {
  const IncidentFormScreen({
    super.key,
    required this.tenantId,
    required this.siteId,
    required this.operationalDayId,
  });

  final String tenantId;
  final String siteId;
  final String operationalDayId;

  @override
  ConsumerState<IncidentFormScreen> createState() => _IncidentFormScreenState();
}

class _IncidentFormScreenState extends ConsumerState<IncidentFormScreen> {
  final _formKey = GlobalKey<FormState>();
  static const _uuid = Uuid();

  HseCategory _category = HseCategory.near_miss;
  int _severity = 1;
  final _locationController = TextEditingController();
  final _chronologyController = TextEditingController();
  double? _gpsLat;
  double? _gpsLon;
  bool _gpsCapturing = false;

  final List<_PersonRow> _people = [];
  final List<String> _equipmentIds = [];
  final List<PhotoAttachment> _photos = [];

  bool _submitting = false;

  @override
  void dispose() {
    _locationController.dispose();
    _chronologyController.dispose();
    super.dispose();
  }

  // ---------------------------------------------------------------------------
  // GPS capture (production: use geolocator package)
  // ---------------------------------------------------------------------------
  Future<void> _captureGps() async {
    setState(() => _gpsCapturing = true);
    try {
      // Production: final pos = await Geolocator.getCurrentPosition();
      // Stub returns a fixed coordinate for testing.
      await Future<void>.delayed(const Duration(milliseconds: 200));
      setState(() {
        _gpsLat = 5.3600; // Abidjan lat (stub)
        _gpsLon = -4.0083; // Abidjan lon (stub)
      });
    } finally {
      setState(() => _gpsCapturing = false);
    }
  }

  // ---------------------------------------------------------------------------
  // Photo picker (production: image_picker + flutter_image_compress + SHA-256)
  // ---------------------------------------------------------------------------
  Future<void> _pickPhoto() async {
    // Production:
    //   final picker = ImagePicker();
    //   final file = await picker.pickImage(source: ImageSource.camera, imageQuality: 85);
    //   if (file == null) return;
    //   final compressed = await FlutterImageCompress.compressWithFile(
    //     file.path, quality: 80, minWidth: 1920, minHeight: 1920,
    //   );
    //   final sha256Hex = sha256.convert(compressed!).toString();
    //   // Upload to pre-signed S3 URL, then call confirmUpload.
    //
    // Stub: adds a fake attachment.
    final fakeHash = 'a' * 64;
    if (!_photos.any((p) => p.sha256Hex == fakeHash)) {
      setState(() {
        _photos.add(const PhotoAttachment(sha256Hex: 'a' * 64, sizeBytes: 512000));
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Submit
  // ---------------------------------------------------------------------------
  Future<void> _confirmAndSubmit() async {
    if (!_formKey.currentState!.validate()) return;
    if (_chronologyController.text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('La chronologie est obligatoire.')),
      );
      return;
    }

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Confirmer la saisie'),
        content: const Text(
          'Cet incident est immuable après envoi.\n\n'
          'Toute correction devra être soumise comme un événement séparé '
          'référençant cet incident (ADR-0008).\n\n'
          'Confirmer ?',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('Annuler'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            child: const Text('Confirmer'),
          ),
        ],
      ),
    );

    if (confirmed != true) return;

    setState(() => _submitting = true);
    try {
      final now = DateTime.now();
      final incident = HseIncident(
        id: _uuid.v4(),
        tenantId: widget.tenantId,
        siteId: widget.siteId,
        operationalDayId: widget.operationalDayId,
        category: _category,
        severity: _severity,
        locationText: _locationController.text.trim(),
        chronologyMd: _chronologyController.text.trim(),
        occurredAtLocal: now,
        ianaTimezone: 'Africa/Abidjan',
        createdAtLocal: now,
        gpsLatitude: _gpsLat,
        gpsLongitude: _gpsLon,
        peopleImpacted: _people
            .where((p) => p.nameController.text.trim().isNotEmpty)
            .map(
              (p) => PersonImpacted(
                name: p.nameController.text.trim(),
                injuryType: p.injuryType,
                bodyPart: p.bodyPart,
                lostTimeH: double.tryParse(p.lostTimeController.text) ?? 0.0,
              ),
            )
            .toList(),
        equipmentImpactedIds: List.unmodifiable(_equipmentIds),
        photoSha256s:
            List.unmodifiable(_photos.map((p) => p.sha256Hex).toList()),
      );

      final repo = ref.read(incidentRepositoryProvider);
      await repo.appendLocal(incident);

      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Incident enregistré — pending_sync'),
        ),
      );
      Navigator.of(context).pop(incident);
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  // ---------------------------------------------------------------------------
  // Build
  // ---------------------------------------------------------------------------

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Nouveau incident HSE')),
      body: Form(
        key: _formKey,
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              _SectionHeader('Catégorie'),
              _CategorySelector(
                value: _category,
                onChanged: (v) => setState(() => _category = v),
              ),
              const SizedBox(height: 16),

              _SectionHeader('Sévérité (1 = mineur, 5 = fatal)'),
              _SeverityStepper(
                value: _severity,
                onChanged: (v) => setState(() => _severity = v),
              ),
              const SizedBox(height: 16),

              _SectionHeader('Localisation'),
              TextFormField(
                controller: _locationController,
                decoration: InputDecoration(
                  labelText: 'Description du lieu',
                  border: const OutlineInputBorder(),
                  suffixIcon: _gpsCapturing
                      ? const Padding(
                          padding: EdgeInsets.all(12),
                          child: SizedBox(
                            width: 20,
                            height: 20,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          ),
                        )
                      : IconButton(
                          icon: Icon(
                            _gpsLat != null ? Icons.gps_fixed : Icons.gps_not_fixed,
                            color: _gpsLat != null ? Colors.green : null,
                          ),
                          tooltip: 'Capturer GPS',
                          onPressed: _captureGps,
                        ),
                ),
                validator: (v) =>
                    (v == null || v.trim().isEmpty) ? 'Champ obligatoire' : null,
              ),
              if (_gpsLat != null)
                Padding(
                  padding: const EdgeInsets.only(top: 4),
                  child: Text(
                    'GPS: ${_gpsLat!.toStringAsFixed(5)}, ${_gpsLon!.toStringAsFixed(5)}',
                    style: const TextStyle(fontSize: 12, color: Colors.green),
                  ),
                ),
              const SizedBox(height: 16),

              _SectionHeader('Chronologie (Markdown)'),
              TextFormField(
                controller: _chronologyController,
                decoration: const InputDecoration(
                  labelText: 'Décrivez les faits dans l\'ordre chronologique',
                  border: OutlineInputBorder(),
                  alignLabelWithHint: true,
                ),
                minLines: 5,
                maxLines: 12,
                validator: (v) =>
                    (v == null || v.trim().isEmpty) ? 'Chronologie obligatoire' : null,
              ),
              const SizedBox(height: 16),

              _SectionHeader('Personnes impliquées'),
              ..._people.map((p) => _PersonRowWidget(
                    row: p,
                    onRemove: () => setState(() => _people.remove(p)),
                  )),
              TextButton.icon(
                onPressed: () => setState(() => _people.add(_PersonRow())),
                icon: const Icon(Icons.person_add),
                label: const Text('Ajouter une personne'),
              ),
              const SizedBox(height: 16),

              _SectionHeader('Photos (${_photos.length})'),
              ...(_photos.map(
                (p) => ListTile(
                  dense: true,
                  leading: const Icon(Icons.image),
                  title: Text(p.sha256Hex.substring(0, 16) + '…'),
                  subtitle: Text('${(p.sizeBytes / 1024).round()} KB'),
                  trailing: IconButton(
                    icon: const Icon(Icons.close),
                    onPressed: () => setState(() => _photos.remove(p)),
                  ),
                ),
              )),
              OutlinedButton.icon(
                onPressed: _pickPhoto,
                icon: const Icon(Icons.add_a_photo),
                label: const Text('Ajouter photo'),
              ),
              const SizedBox(height: 32),

              SizedBox(
                height: 56,
                child: FilledButton.icon(
                  onPressed: _submitting ? null : _confirmAndSubmit,
                  icon: const Icon(Icons.send),
                  label: const Text('Enregistrer l\'incident'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Widgets helpers
// ---------------------------------------------------------------------------

class _SectionHeader extends StatelessWidget {
  const _SectionHeader(this.title);
  final String title;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Text(
        title,
        style: Theme.of(context).textTheme.titleSmall,
      ),
    );
  }
}

class _CategorySelector extends StatelessWidget {
  const _CategorySelector({required this.value, required this.onChanged});
  final HseCategory value;
  final ValueChanged<HseCategory> onChanged;

  @override
  Widget build(BuildContext context) {
    return Wrap(
      spacing: 8,
      children: HseCategory.values.map((cat) {
        return ChoiceChip(
          label: Text(_categoryLabel(cat)),
          selected: value == cat,
          onSelected: (_) => onChanged(cat),
        );
      }).toList(),
    );
  }

  String _categoryLabel(HseCategory cat) => switch (cat) {
        HseCategory.accident_personnel => 'Acc. personnel',
        HseCategory.accident_materiel => 'Acc. matériel',
        HseCategory.near_miss => 'Presqu\'accident',
        HseCategory.environnement => 'Environnement',
        HseCategory.securite => 'Sécurité',
        HseCategory.autre => 'Autre',
      };
}

class _SeverityStepper extends StatelessWidget {
  const _SeverityStepper({required this.value, required this.onChanged});
  final int value;
  final ValueChanged<int> onChanged;

  static const _colors = [
    Color(0xFF4CAF50),
    Color(0xFF8BC34A),
    Color(0xFFFF9800),
    Color(0xFFF44336),
    Color(0xFFB71C1C),
  ];

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: List.generate(5, (i) {
        final level = i + 1;
        final selected = value == level;
        return Expanded(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 4),
            child: GestureDetector(
              onTap: () => onChanged(level),
              child: Container(
                height: 48,
                decoration: BoxDecoration(
                  color: _colors[i].withValues(alpha: selected ? 1.0 : 0.3),
                  borderRadius: BorderRadius.circular(8),
                  border: selected
                      ? Border.all(color: _colors[i], width: 3)
                      : null,
                ),
                alignment: Alignment.center,
                child: Text(
                  '$level',
                  style: TextStyle(
                    color: Colors.white,
                    fontWeight: selected ? FontWeight.bold : FontWeight.normal,
                    fontSize: selected ? 20 : 16,
                  ),
                ),
              ),
            ),
          ),
        );
      }),
    );
  }
}

// ---------------------------------------------------------------------------
// Person row model + widget
// ---------------------------------------------------------------------------

class _PersonRow {
  final nameController = TextEditingController();
  final lostTimeController = TextEditingController(text: '0');
  String? injuryType;
  String? bodyPart;
}

class _PersonRowWidget extends StatefulWidget {
  const _PersonRowWidget({required this.row, required this.onRemove});
  final _PersonRow row;
  final VoidCallback onRemove;

  @override
  State<_PersonRowWidget> createState() => _PersonRowWidgetState();
}

class _PersonRowWidgetState extends State<_PersonRowWidget> {
  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: Padding(
        padding: const EdgeInsets.all(8),
        child: Column(
          children: [
            Row(
              children: [
                Expanded(
                  child: TextFormField(
                    controller: widget.row.nameController,
                    decoration: const InputDecoration(
                      labelText: 'Nom / Prénom',
                      isDense: true,
                    ),
                  ),
                ),
                IconButton(
                  icon: const Icon(Icons.close),
                  onPressed: widget.onRemove,
                ),
              ],
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(
                  child: DropdownButtonFormField<String>(
                    value: widget.row.injuryType,
                    decoration: const InputDecoration(
                      labelText: 'Type blessure',
                      isDense: true,
                    ),
                    items: const [
                      DropdownMenuItem(value: 'fracture', child: Text('Fracture')),
                      DropdownMenuItem(value: 'laceration', child: Text('Lacération')),
                      DropdownMenuItem(value: 'brulure', child: Text('Brûlure')),
                      DropdownMenuItem(value: 'contusion', child: Text('Contusion')),
                      DropdownMenuItem(value: 'autre', child: Text('Autre')),
                    ],
                    onChanged: (v) => setState(() => widget.row.injuryType = v),
                  ),
                ),
                const SizedBox(width: 8),
                SizedBox(
                  width: 100,
                  child: TextFormField(
                    controller: widget.row.lostTimeController,
                    decoration: const InputDecoration(
                      labelText: 'Heures perdues',
                      isDense: true,
                    ),
                    keyboardType:
                        const TextInputType.numberWithOptions(decimal: true),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
