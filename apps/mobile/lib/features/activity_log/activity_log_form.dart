import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'activity_log_repository.dart';

/// Form to capture one daily activity log entry. The `captured_at_local`
/// field is local wall-clock; the form widget is intentionally the ONLY
/// place that calls `DateTime.now()` because this field is display-only and
/// is NOT part of any ordering path (D-14).
class ActivityLogForm extends ConsumerStatefulWidget {
  const ActivityLogForm({
    super.key,
    required this.tenantId,
    required this.siteId,
    required this.authorUserId,
    this.onSubmitted,
  });

  final String tenantId;
  final String siteId;
  final String authorUserId;
  final ValueChanged<String>? onSubmitted;

  @override
  ConsumerState<ActivityLogForm> createState() => _ActivityLogFormState();
}

class _ActivityLogFormState extends ConsumerState<ActivityLogForm> {
  final _formKey = GlobalKey<FormState>();
  final _notesController = TextEditingController();
  late DateTime _capturedAt;
  bool _submitting = false;

  @override
  void initState() {
    super.initState();
    _capturedAt = DateTime.now(); // display-only timestamp (D-14 compliant)
  }

  @override
  void dispose() {
    _notesController.dispose();
    super.dispose();
  }

  String? _validateNotes(String? value) {
    if (value == null || value.trim().isEmpty) {
      return 'Notes are required';
    }
    if (value.length > 500) {
      return 'Max 500 characters';
    }
    return null;
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() => _submitting = true);
    try {
      final repo = ref.read(activityLogRepositoryProvider);
      final id = await repo.insert(NewActivityLogInput(
        tenantId: widget.tenantId,
        siteId: widget.siteId,
        authorUserId: widget.authorUserId,
        capturedAtLocal: _capturedAt,
        notes: _notesController.text,
      ));
      widget.onSubmitted?.call(id);
      _notesController.clear();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Entry saved offline')),
        );
      }
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Form(
      key: _formKey,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Captured at: ${_capturedAt.toIso8601String()}',
              style: Theme.of(context).textTheme.bodySmall,
            ),
            const SizedBox(height: 12),
            TextFormField(
              key: const ValueKey('activity-log-notes'),
              controller: _notesController,
              maxLength: 500,
              maxLines: 4,
              validator: _validateNotes,
              decoration: const InputDecoration(
                labelText: 'Notes',
                hintText: 'What happened today?',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 16),
            FilledButton.icon(
              key: const ValueKey('activity-log-submit'),
              onPressed: _submitting ? null : _submit,
              icon: const Icon(Icons.save),
              label: const Text('Save'),
            ),
          ],
        ),
      ),
    );
  }
}
