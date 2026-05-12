import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/auth/auth_service.dart';

final authServiceProvider = Provider<AuthService>((ref) => AuthService());

class LoginScreen extends ConsumerWidget {
  const LoginScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Icon(Icons.terrain, size: 80, color: Colors.indigo),
              const SizedBox(height: 24),
              const Text(
                'Gravel Ivoire ERP',
                style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 48),
              FilledButton.icon(
                onPressed: () async {
                  final ok = await ref.read(authServiceProvider).login();
                  if (!context.mounted) return;
                  if (ok) {
                    Navigator.of(context).pushReplacementNamed('/');
                  }
                },
                icon: const Icon(Icons.login),
                label: const Text('Sign in with Keycloak'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
