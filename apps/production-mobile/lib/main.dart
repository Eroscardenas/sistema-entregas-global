import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:timezone/data/latest.dart' as tz_data;

import 'app.dart';
import 'firebase_options.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  try {
    // Inicializa la base de zonas horarias.
    tz_data.initializeTimeZones();

    // Inicializa Firebase con el proyecto inventario-global.
    await Firebase.initializeApp(
      options: DefaultFirebaseOptions.currentPlatform,
    );

    // Carga las variables del proyecto de entregas.
    await dotenv.load(fileName: '.env');

    final supabaseUrl = dotenv.env['SUPABASE_URL'];
    final supabaseAnonKey = dotenv.env['SUPABASE_ANON_KEY'];

    if (supabaseUrl == null || supabaseUrl.isEmpty) {
      throw Exception('Falta SUPABASE_URL en .env');
    }

    if (supabaseAnonKey == null || supabaseAnonKey.isEmpty) {
      throw Exception('Falta SUPABASE_ANON_KEY en .env');
    }

    // Conservamos Supabase para ventas, precios y reportes.
    await Supabase.initialize(
      url: supabaseUrl,
      anonKey: supabaseAnonKey,
    );

    runApp(const MyApp());
  } catch (error, stackTrace) {
    debugPrint('ERROR AL INICIAR LA APP: $error');
    debugPrintStack(stackTrace: stackTrace);

    runApp(
      _BootErrorApp(
        error: error.toString(),
      ),
    );
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
      title: 'Global Ice Producción',
      home: Scaffold(
        backgroundColor: const Color(0xFF070B18),
        body: SafeArea(
          child: Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(24),
              child: ConstrainedBox(
                constraints: const BoxConstraints(
                  maxWidth: 520,
                ),
                child: Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(22),
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.08),
                    borderRadius: BorderRadius.circular(24),
                    border: Border.all(
                      color: Colors.white.withValues(alpha: 0.14),
                    ),
                  ),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(
                        Icons.error_outline,
                        size: 52,
                        color: Color(0xFFFFB4B4),
                      ),
                      const SizedBox(height: 16),
                      const Text(
                        'No se pudo iniciar Global Ice Producción',
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          color: Colors.white,
                          fontSize: 20,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                      const SizedBox(height: 12),
                      Text(
                        error,
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          color: Colors.white.withValues(alpha: 0.76),
                          fontSize: 14,
                          height: 1.4,
                        ),
                      ),
                    ],
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
