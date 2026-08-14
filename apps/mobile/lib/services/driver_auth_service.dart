import 'package:supabase_flutter/supabase_flutter.dart';

class DriverSession {
  final String profileId; // auth user id
  final String driverId;  // drivers.id
  final String nombre;
  final String telefono;
  final bool activo;
  final String currentStatus;

  DriverSession({
    required this.profileId,
    required this.driverId,
    required this.nombre,
    required this.telefono,
    required this.activo,
    required this.currentStatus,
  });
}

class DriverAuthService {
  SupabaseClient get _sb => Supabase.instance.client;

  String _digitsOnly(String s) => s.replaceAll(RegExp(r'[^0-9]'), '');

  /// Debe coincidir con tu normalizePhoneToLoginEmail del backend
  String phoneToDriverEmail(String phone) {
    final digits = _digitsOnly(phone.trim());
    return '$digits@drivers.local';
  }


  Future<DriverSession> loginWithPhoneAndPassword({
    required String phone,
    required String password,
  }) async {
    final digits = _digitsOnly(phone);
    if (digits.length < 10) {
      throw Exception('Teléfono inválido');
    }
    if (password.trim().length < 6) {
      throw Exception('Contraseña inválida');
    }

    final email = phoneToDriverEmail(digits);

    // 1) Login Supabase Auth
    final authRes = await _sb.auth.signInWithPassword(
      email: email,
      password: password,
    );

    final user = authRes.user;
    if (user == null) throw Exception('No se pudo iniciar sesión');

    final profileId = user.id;

    // 2) Verifica profile (rol y activo)
    final profile = await _sb
        .from('profiles')
        .select('id, role, nombre, activo')
        .eq('id', profileId)
        .maybeSingle();

    if (profile == null) {
      await _sb.auth.signOut();
      throw Exception('Perfil no encontrado');
    }

    final role = (profile['role'] ?? '').toString();
    final profActivo = profile['activo'] == true;
    final profNombre = (profile['nombre'] ?? '').toString();

    if (role != 'driver') {
      await _sb.auth.signOut();
      throw Exception('No autorizado');
    }
    if (!profActivo) {
      await _sb.auth.signOut();
      throw Exception('Tu acceso está desactivado');
    }

    // 3) Busca driver row
    final driver = await _sb
        .from('drivers')
        .select('id, profile_id, nombre, telefono, activo, current_status')
        .eq('profile_id', profileId)
        .maybeSingle();

    if (driver == null) {
      await _sb.auth.signOut();
      throw Exception('Registro de chofer no encontrado');
    }

    final drvActivo = driver['activo'] == true;
    if (!drvActivo) {
      await _sb.auth.signOut();
      throw Exception('Tu acceso está desactivado');
    }

      profileId: profileId,
      driverId: (driver['id'] ?? '')
    return DriverSession(
      profileId: profileId,
      driverId: (driver['id'] ?? '').toString(),
      nombre: (driver['nombre'] ?? profNombre).toString(),
      telefono: (driver['telefono'] ?? digits).toString(),
      activo: true,
      currentStatus: (driver['current_status'] ?? 'available').toString(),
    );
    

    return DriverSession{
      profileId: profileId,
      driverId: (driver['id'] ?? '').toString(),
      nombre: (driver['nombre'] ?? profNombre).toString(),
      telefono: (driver['telefono'])

    }
  }

  Future<void> logout() async {
    await _sb.auth.signOut();
  }
}