import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'package:mobile/features/driver/driver_dashboard_page.dart';

class DriverLoginPage extends StatefulWidget {
  const DriverLoginPage({super.key});

  @override
  State<DriverLoginPage> createState() => _DriverLoginPageState();
}

class _DriverLoginPageState extends State<DriverLoginPage> {
  final _formKey = GlobalKey<FormState>();

  final _phoneCtrl = TextEditingController();
  final _passCtrl = TextEditingController();

  bool _loading = false;
  bool _showPass = false;
  String _error = '';

  // ✅ FIX: NO usar Supabase.instance.client en getter/global
  late final SupabaseClient _sb;

  @override
  void initState() {
    super.initState();
    _sb = Supabase.instance.client;
  }

  @override
  void dispose() {
    _phoneCtrl.dispose();
    _passCtrl.dispose();
    super.dispose();
  }

  String _digitsOnly(String s) => s.replaceAll(RegExp(r'[^0-9]'), '');

  /// Debe coincidir con tu normalizePhoneToLoginEmail() del admin-web
  /// (por tu UI dice: telefono@drivers.local)
  String _phoneToDriverEmail(String phoneDigits) => '$phoneDigits@drivers.local';

  Future<void> _submit() async {
    if (_loading) return;

    setState(() => _error = '');
    final ok = _formKey.currentState?.validate() ?? false;
    if (!ok) return;

    setState(() => _loading = true);

    try {
      final phoneDigits = _digitsOnly(_phoneCtrl.text.trim());
      final pass = _passCtrl.text.trim();

      final email = _phoneToDriverEmail(phoneDigits);

      // 1) LOGIN AUTH (creado desde admin)
      final authRes = await _sb.auth.signInWithPassword(email: email, password: pass);
      final user = authRes.user;
      if (user == null) throw Exception('No se pudo iniciar sesión');

      final profileId = user.id;

      // 2) Verifica perfil (rol/activo)
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

      // 3) Carga driver row (para tener driverId y estado)
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

      final driverId = (driver['id'] ?? '').toString();
      final driverNombre = ((driver['nombre'] ?? '') as String).isNotEmpty
          ? (driver['nombre'] ?? '').toString()
          : profNombre;

      final driverTelefono = ((driver['telefono'] ?? '') as String).isNotEmpty
          ? (driver['telefono'] ?? '').toString()
          : phoneDigits;

      final currentStatus = (driver['current_status'] ?? 'available').toString();

      if (!mounted) return;

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Bienvenido $driverNombre ✅')),
      );

      // ✅ DASHBOARD
      // IMPORTANTE:
      // Como no sé la firma exacta de tu DriverDashboardPage,
      // aquí lo dejamos seguro para compilar: SOLO phone.
      //
      // Si tu DriverDashboardPage SÍ acepta los demás parámetros,
      // abajo te dejo el bloque alterno comentado.
      Navigator.pushReplacement(
        context,
        MaterialPageRoute(
          builder: (_) => DriverDashboardPage(
            phone: driverTelefono,
          ),
        ),
      );

      /*
      // ✅ Alternativa si tu DriverDashboardPage tiene estos params:
      Navigator.pushReplacement(
        context,
        MaterialPageRoute(
          builder: (_) => DriverDashboardPage(
            phone: driverTelefono,
            driverId: driverId,
            profileId: profileId,
            nombre: driverNombre,
            status: currentStatus,
          ),
        ),
      );
      */
    } on AuthException catch (e) {
      if (!mounted) return;
      setState(() {
        final msg = (e.message).toLowerCase();
        if (msg.contains('invalid') || msg.contains('credentials')) {
          _error = 'Credenciales inválidas. Verifica teléfono y contraseña.';
        } else {
          _error = 'No se pudo iniciar sesión: ${e.message}';
        }
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        final msg = e.toString().replaceFirst('Exception: ', '');
        _error = msg.isEmpty ? 'No se pudo iniciar sesión. Verifica teléfono y contraseña.' : msg;
      });
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Stack(
        children: [
          /// Fondo imagen
          Positioned.fill(
            child: Image.asset(
              'assets/images/app_b.jpg',
              fit: BoxFit.cover,
              filterQuality: FilterQuality.high,
            ),
          ),

          /// Overlay para contraste
          Positioned.fill(
            child: Container(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [
                    Colors.black.withOpacity(0.72),
                    Colors.black.withOpacity(0.60),
                    Colors.black.withOpacity(0.76),
                  ],
                ),
              ),
            ),
          ),

          /// Glow corporativo
          Positioned(
            top: -220,
            left: -170,
            child: Container(
              height: 520,
              width: 520,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: const Color(0xFF4DADFF).withOpacity(0.20),
              ),
            ),
          ),
          Positioned(
            bottom: -260,
            right: -200,
            child: Container(
              height: 620,
              width: 620,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: const Color(0xFF852838).withOpacity(0.16),
              ),
            ),
          ),

          SafeArea(
            child: Padding(
              padding: const EdgeInsets.all(18),
              child: Center(
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 460),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      /// Header
                      Row(
                        children: [
                          _IconGlassButton(
                            onTap: () => Navigator.pop(context),
                            icon: Icons.arrow_back,
                          ),
                          const SizedBox(width: 12),
                          const Expanded(
                            child: Text(
                              'Acceso Driver Global Ice',
                              style: TextStyle(
                                color: Colors.white,
                                fontSize: 20,
                                fontWeight: FontWeight.w800,
                              ),
                            ),
                          ),
                        ],
                      ),

                      const SizedBox(height: 16),

                      /// Card principal
                      Container(
                        width: double.infinity,
                        padding: const EdgeInsets.all(20),
                        decoration: BoxDecoration(
                          borderRadius: BorderRadius.circular(26),
                          color: Colors.white.withOpacity(0.12),
                          border: Border.all(color: Colors.white.withOpacity(0.20)),
                          boxShadow: [
                            BoxShadow(
                              color: Colors.black.withOpacity(0.35),
                              blurRadius: 30,
                              offset: const Offset(0, 14),
                            ),
                          ],
                        ),
                        child: Form(
                          key: _formKey,
                          child: Column(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              /// Logo + texto
                              Row(
                                children: [
                                  Container(
                                    height: 52,
                                    width: 52,
                                    decoration: BoxDecoration(
                                      borderRadius: BorderRadius.circular(16),
                                      color: Colors.white,
                                      boxShadow: [
                                        BoxShadow(
                                          color: Colors.white.withOpacity(0.22),
                                          blurRadius: 18,
                                          spreadRadius: 1,
                                        ),
                                      ],
                                    ),
                                    child: ClipRRect(
                                      borderRadius: BorderRadius.circular(16),
                                      child: Padding(
                                        padding: const EdgeInsets.all(8),
                                        child: Image.asset(
                                          'assets/images/global_ice.png',
                                          fit: BoxFit.contain,
                                          filterQuality: FilterQuality.high,
                                        ),
                                      ),
                                    ),
                                  ),
                                  const SizedBox(width: 12),
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        Text(
                                          'Inicia sesión',
                                          style: TextStyle(
                                            color: Colors.white.withOpacity(0.95),
                                            fontSize: 16,
                                            fontWeight: FontWeight.w900,
                                          ),
                                        ),
                                        const SizedBox(height: 2),
                                        Text(
                                          'Usa las credenciales asignadas',
                                          style: TextStyle(
                                            color: Colors.white.withOpacity(0.70),
                                            fontSize: 12,
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                ],
                              ),

                              const SizedBox(height: 18),

                              /// Teléfono
                              _GlassField(
                                label: 'Teléfono',
                                controller: _phoneCtrl,
                                hintText: '33 1234 5678',
                                keyboardType: TextInputType.phone,
                                prefixIcon: Icons.phone_iphone,
                                enabled: !_loading,
                                validator: (v) {
                                  final digits = _digitsOnly((v ?? '').trim());
                                  if (digits.isEmpty) return 'Ingresa tu teléfono';
                                  if (digits.length < 10) return 'Teléfono inválido (mínimo 10 dígitos)';
                                  return null;
                                },
                              ),

                              const SizedBox(height: 12),

                              /// Contraseña
                              _GlassField(
                                label: 'Contraseña',
                                controller: _passCtrl,
                                hintText: '••••••••',
                                prefixIcon: Icons.lock_outline,
                                enabled: !_loading,
                                obscureText: !_showPass,
                                validator: (v) {
                                  if ((v ?? '').isEmpty) return 'Ingresa tu contraseña';
                                  if ((v ?? '').length < 6) return 'Mínimo 6 caracteres';
                                  return null;
                                },
                                trailing: IconButton(
                                  onPressed: _loading ? null : () => setState(() => _showPass = !_showPass),
                                  icon: Icon(
                                    _showPass ? Icons.visibility_off : Icons.visibility,
                                    color: Colors.white.withOpacity(0.75),
                                  ),
                                ),
                              ),

                              const SizedBox(height: 14),

                              /// Error
                              AnimatedSwitcher(
                                duration: const Duration(milliseconds: 250),
                                child: _error.isEmpty
                                    ? const SizedBox.shrink()
                                    : Container(
                                        width: double.infinity,
                                        padding: const EdgeInsets.all(12),
                                        decoration: BoxDecoration(
                                          borderRadius: BorderRadius.circular(16),
                                          color: const Color(0xFFFF4D4D).withOpacity(0.14),
                                          border: Border.all(
                                            color: const Color(0xFFFF4D4D).withOpacity(0.25),
                                          ),
                                        ),
                                        child: Row(
                                          crossAxisAlignment: CrossAxisAlignment.start,
                                          children: [
                                            const Icon(Icons.error_outline, color: Color(0xFFFFC1C1)),
                                            const SizedBox(width: 10),
                                            Expanded(
                                              child: Text(
                                                _error,
                                                style: TextStyle(
                                                  color: Colors.white.withOpacity(0.92),
                                                  fontSize: 12.5,
                                                  height: 1.25,
                                                ),
                                              ),
                                            ),
                                          ],
                                        ),
                                      ),
                              ),

                              const SizedBox(height: 14),

                              /// Botón login
                              SizedBox(
                                width: double.infinity,
                                child: ElevatedButton(
                                  onPressed: _loading ? null : _submit,
                                  style: ElevatedButton.styleFrom(
                                    padding: const EdgeInsets.symmetric(vertical: 14),
                                    backgroundColor: const Color(0xFF4DADFF),
                                    foregroundColor: Colors.white,
                                    shape: RoundedRectangleBorder(
                                      borderRadius: BorderRadius.circular(18),
                                    ),
                                    elevation: 0,
                                  ),
                                  child: _loading
                                      ? const SizedBox(
                                          height: 18,
                                          width: 18,
                                          child: CircularProgressIndicator(
                                            strokeWidth: 2.4,
                                            valueColor: AlwaysStoppedAnimation<Color>(Colors.white),
                                          ),
                                        )
                                      : const Text(
                                          'Entrar',
                                          style: TextStyle(fontWeight: FontWeight.w800),
                                        ),
                                ),
                              ),

                              const SizedBox(height: 10),

                              Text(
                                'Si no puedes entrar, solicita que se revise tu acceso.',
                                textAlign: TextAlign.center,
                                style: TextStyle(color: Colors.white.withOpacity(0.55), fontSize: 12),
                              ),

                              const SizedBox(height: 8),

                              /// Nota técnica (opcional, útil para soporte)
                            ],
                          ),
                        ),
                      ),

                      const SizedBox(height: 14),

                      Text(
                        '© ${DateTime.now().year} Global Ice de Mexico S.A de C.V',
                        style: TextStyle(color: Colors.white.withOpacity(0.52), fontSize: 12),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/* ======================= UI Helpers ======================= */

class _IconGlassButton extends StatelessWidget {
  final VoidCallback onTap;
  final IconData icon;

  const _IconGlassButton({required this.onTap, required this.icon});

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white.withOpacity(0.10),
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(14),
        child: Container(
          height: 44,
          width: 44,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: Colors.white.withOpacity(0.16)),
          ),
          child: Icon(icon, color: Colors.white),
        ),
      ),
    );
  }
}

class _GlassField extends StatelessWidget {
  final String label;
  final TextEditingController controller;
  final String? hintText;
  final IconData prefixIcon;
  final TextInputType? keyboardType;
  final bool enabled;
  final bool obscureText;
  final String? Function(String?)? validator;
  final Widget? trailing;

  const _GlassField({
    required this.label,
    required this.controller,
    required this.prefixIcon,
    this.hintText,
    this.keyboardType,
    this.enabled = true,
    this.obscureText = false,
    this.validator,
    this.trailing,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: TextStyle(
            color: Colors.white.withOpacity(0.82),
            fontSize: 13,
            fontWeight: FontWeight.w700,
          ),
        ),
        const SizedBox(height: 8),
        TextFormField(
          controller: controller,
          enabled: enabled,
          obscureText: obscureText,
          validator: validator,
          keyboardType: keyboardType,
          style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w600),
          decoration: InputDecoration(
            hintText: hintText,
            hintStyle: TextStyle(color: Colors.white.withOpacity(0.38)),
            prefixIcon: Icon(prefixIcon, color: Colors.white.withOpacity(0.75)),
            suffixIcon: trailing,
            filled: true,
            fillColor: Colors.white.withOpacity(0.10),
            contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(18),
              borderSide: BorderSide(color: Colors.white.withOpacity(0.16)),
            ),
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(18),
              borderSide: const BorderSide(color: Color(0xFF4DADFF), width: 1.4),
            ),
            errorBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(18),
              borderSide: BorderSide(color: const Color(0xFFFF4D4D).withOpacity(0.6)),
            ),
            focusedErrorBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(18),
              borderSide: BorderSide(color: const Color(0xFFFF4D4D).withOpacity(0.8)),
            ),
            errorStyle: TextStyle(color: Colors.red.shade100),
          ),
        ),
      ],
    );
  }
}