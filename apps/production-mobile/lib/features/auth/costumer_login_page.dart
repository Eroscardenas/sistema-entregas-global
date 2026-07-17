import 'package:flutter/material.dart';

class CustomerLoginPage extends StatelessWidget {
  const CustomerLoginPage({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Login Cliente')),
      body: const Center(child: Text('Aquí va el login de cliente (Supabase).')),
    );
  }
}