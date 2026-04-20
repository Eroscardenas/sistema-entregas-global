import 'package:flutter/material.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:timezone/data/latest.dart' as tz_data;

import 'app.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  try {
    // Inicializa base de zonas horarias
    tz_data.initializeTimeZones();

    // Carga variables de entorno
    await dotenv.load(fileName: ".env");

    final url = dotenv.env['SUPABASE_URL'];
    final anon = dotenv.env['SUPABASE_ANON_KEY'];

    if (url == null || url.isEmpty) {
      throw Exception('Falta SUPABASE_URL en .env');
    }

    if (anon == null || anon.isEmpty) {
      throw Exception('Falta SUPABASE_ANON_KEY en .env');
    }

    // Inicializa Supabase
    await Supabase.initialize(
      url: url,
      anonKey: anon,
    );

    runApp(const MyApp());
  } catch (e) {
    // Si falla antes de runApp, mostramos pantalla de error
    runApp(_BootErrorApp(error: e.toString()));
  }
}

class _BootErrorApp extends StatelessWidget {
  final String error;

  const _BootErrorApp({
    required this.error,
  });

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      home: Scaffold(
        backgroundColor: const Color(0xFF070B18),
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(18),
            child: Text(
              'Boot error:\n\n$error',
              style: const TextStyle(
                color: Colors.white,
                fontSize: 16,
              ),
              textAlign: TextAlign.center,
            ),
          ),
        ),
      ),
    );
  }
}