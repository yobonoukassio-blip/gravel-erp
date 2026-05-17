import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/auth/auth_service.dart';

final authServiceProvider = Provider<AuthService>((ref) => AuthService());

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _formKey = GlobalKey<FormState>();
  final _emailCtrl = TextEditingController();
  final _passwordCtrl = TextEditingController();
  bool _loading = false;
  bool _obscure = true;
  String? _error;

  @override
  void dispose() {
    _emailCtrl.dispose();
    _passwordCtrl.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_loading) return;
    if (!(_formKey.currentState?.validate() ?? false)) return;

    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      await ref.read(authServiceProvider).loginWithPassword(
            _emailCtrl.text,
            _passwordCtrl.text,
          );
      if (!mounted) return;
      Navigator.of(context).pushReplacementNamed('/');
    } on AuthException catch (e) {
      if (!mounted) return;
      setState(() => _error = e.message);
    } on Object {
      if (!mounted) return;
      setState(() => _error = 'Erreur inattendue. Réessayez.');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0A1628),
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: Card(
                elevation: 8,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(14),
                ),
                child: Padding(
                  padding: const EdgeInsets.all(24),
                  child: Form(
                    key: _formKey,
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        const _Header(),
                        const SizedBox(height: 24),
                        const Text(
                          'Connectez-vous à votre espace.',
                          style: TextStyle(
                              fontSize: 14, color: Color(0xFF5A6373)),
                        ),
                        const SizedBox(height: 16),
                        TextFormField(
                          controller: _emailCtrl,
                          keyboardType: TextInputType.emailAddress,
                          autofillHints: const [
                            AutofillHints.username,
                            AutofillHints.email
                          ],
                          textInputAction: TextInputAction.next,
                          decoration: const InputDecoration(
                            labelText: 'Email',
                            border: OutlineInputBorder(),
                            prefixIcon: Icon(Icons.mail_outline),
                          ),
                          validator: (v) => (v == null || v.trim().isEmpty)
                              ? 'Email requis'
                              : null,
                        ),
                        const SizedBox(height: 12),
                        TextFormField(
                          controller: _passwordCtrl,
                          obscureText: _obscure,
                          autofillHints: const [AutofillHints.password],
                          textInputAction: TextInputAction.done,
                          onFieldSubmitted: (_) => _submit(),
                          decoration: InputDecoration(
                            labelText: 'Mot de passe',
                            border: const OutlineInputBorder(),
                            prefixIcon: const Icon(Icons.lock_outline),
                            suffixIcon: IconButton(
                              icon: Icon(_obscure
                                  ? Icons.visibility
                                  : Icons.visibility_off),
                              onPressed: () =>
                                  setState(() => _obscure = !_obscure),
                            ),
                          ),
                          validator: (v) => (v == null || v.isEmpty)
                              ? 'Mot de passe requis'
                              : null,
                        ),
                        if (_error != null) ...[
                          const SizedBox(height: 12),
                          Container(
                            padding: const EdgeInsets.all(10),
                            decoration: BoxDecoration(
                              color: const Color(0xFFFEF2F2),
                              border:
                                  Border.all(color: const Color(0xFFFECACA)),
                              borderRadius: BorderRadius.circular(6),
                            ),
                            child: Text(
                              _error!,
                              style: const TextStyle(
                                  color: Color(0xFFB91C1C), fontSize: 13),
                            ),
                          ),
                        ],
                        const SizedBox(height: 16),
                        FilledButton(
                          onPressed: _loading ? null : _submit,
                          style: FilledButton.styleFrom(
                            padding: const EdgeInsets.symmetric(vertical: 14),
                          ),
                          child: _loading
                              ? const SizedBox(
                                  height: 20,
                                  width: 20,
                                  child: CircularProgressIndicator(
                                      strokeWidth: 2, color: Colors.white),
                                )
                              : const Text('Se connecter',
                                  style: TextStyle(
                                      fontSize: 14,
                                      fontWeight: FontWeight.w600)),
                        ),
                        const SizedBox(height: 16),
                        const _DemoCreds(),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _Header extends StatelessWidget {
  const _Header();

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Container(
          width: 56,
          height: 56,
          decoration: BoxDecoration(
            gradient: const RadialGradient(
              center: Alignment(-0.3, -0.3),
              colors: [
                Color(0xFFF0C75E),
                Color(0xFFC8A040),
                Color(0xFF886820)
              ],
            ),
            borderRadius: BorderRadius.circular(14),
          ),
          child: const Center(
            child: Text(
              'GV',
              style: TextStyle(
                  fontWeight: FontWeight.w800,
                  color: Color(0xFF3A2A08),
                  letterSpacing: 1.5),
            ),
          ),
        ),
        const SizedBox(width: 16),
        const Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('GRAVEL IVOIRE',
                  style: TextStyle(
                      fontSize: 10,
                      fontWeight: FontWeight.w700,
                      letterSpacing: 2.5,
                      color: Color(0xFFC8A040))),
              Text('ERP Carrière',
                  style:
                      TextStyle(fontSize: 22, fontWeight: FontWeight.w700)),
              Text('Quarry Operations',
                  style: TextStyle(fontSize: 12, color: Color(0xFF5A6373))),
            ],
          ),
        ),
      ],
    );
  }
}

class _DemoCreds extends StatelessWidget {
  const _DemoCreds();

  @override
  Widget build(BuildContext context) {
    return ExpansionTile(
      tilePadding: EdgeInsets.zero,
      childrenPadding: const EdgeInsets.symmetric(vertical: 8),
      title: const Text('Comptes de démo',
          style: TextStyle(fontSize: 12, color: Color(0xFF2C5AA0))),
      children: const [
        _DemoRow(email: 'admin@gravel-ivoire.ci', role: 'Direction Groupe'),
        _DemoRow(
            email: 'directeur.mobaye@gravel-ivoire.ci',
            role: 'Directeur Site'),
        _DemoRow(
            email: 'chef.carriere@gravel-ivoire.ci', role: 'Chef Carrière'),
        Padding(
          padding: EdgeInsets.only(top: 8),
          child: Text('Mot de passe : Gravel2026!',
              style: TextStyle(fontSize: 12, color: Color(0xFF5A6373))),
        ),
      ],
    );
  }
}

class _DemoRow extends StatelessWidget {
  const _DemoRow({required this.email, required this.role});
  final String email;
  final String role;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 2),
      child: Text(
        '$email · $role',
        style: const TextStyle(
            fontSize: 11,
            color: Color(0xFF5A6373),
            fontFamily: 'monospace'),
      ),
    );
  }
}
