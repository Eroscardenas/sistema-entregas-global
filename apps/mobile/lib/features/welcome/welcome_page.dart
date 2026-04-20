import 'dart:async';
import 'package:flutter/material.dart';
import 'package:mobile/features/auth/driver_login_page.dart';
import 'package:mobile/features/customer/customer_home_page.dart';

class WelcomePage extends StatefulWidget {
  const WelcomePage({super.key});

  @override
  State<WelcomePage> createState() => _WelcomePageState();
}

class _WelcomePageState extends State<WelcomePage>
    with SingleTickerProviderStateMixin {
  static const int _splashSeconds = 8;

  // Paleta corporativa
  static const Color _navy = Color(0xFF0A1A2F);
  static const Color _accent = Color(0xFF4DADFF);

  late final AnimationController _ac;
  late final Animation<double> _fade;
  late final Animation<double> _scale;

  Timer? _timer;
  bool _ready = false;

  @override
  void initState() {
    super.initState();

    _ac = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 900),
    );

    _fade = CurvedAnimation(
      parent: _ac,
      curve: Curves.easeOutCubic,
    );

    _scale = Tween<double>(
      begin: 0.96,
      end: 1.0,
    ).animate(
      CurvedAnimation(
        parent: _ac,
        curve: Curves.easeOutBack,
      ),
    );

    _timer = Timer(const Duration(seconds: _splashSeconds), () {
      if (!mounted) return;
      setState(() => _ready = true);
      _ac.forward(from: 0);
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    _ac.dispose();
    super.dispose();
  }

  void _goDriverLogin() {
    Navigator.push(
      context,
      MaterialPageRoute(builder: (_) => const DriverLoginPage()),
    );
  }

  void _goCustomerHome() {
    Navigator.push(
      context,
      MaterialPageRoute(builder: (_) => const CustomerHomePage()),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: _navy,
      body: Stack(
        children: [
          // Fondo imagen
          Positioned.fill(
            child: Image.asset(
              'assets/images/app_b.jpg',
              fit: BoxFit.cover,
              filterQuality: FilterQuality.high,
              errorBuilder: (_, __, ___) {
                return Container(
                  decoration: const BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.topCenter,
                      end: Alignment.bottomCenter,
                      colors: [
                        _navy,
                        Color(0xFF0F2A40),
                        Color(0xFF111827),
                      ],
                    ),
                  ),
                );
              },
            ),
          ),

          // Overlay para contraste
          Positioned.fill(
            child: Container(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [
                    Colors.black.withOpacity(0.58),
                    Colors.black.withOpacity(0.72),
                  ],
                ),
              ),
            ),
          ),

          // Glow azul superior izquierdo
          Positioned(
            top: -220,
            left: -180,
            child: Container(
              height: 520,
              width: 520,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: _accent.withOpacity(0.18),
              ),
            ),
          ),

          // Glow azul inferior derecho
          Positioned(
            bottom: -240,
            right: -180,
            child: Container(
              height: 540,
              width: 540,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: _accent.withOpacity(0.10),
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
                      // Logo
                      Container(
                        height: 112,
                        width: 112,
                        decoration: BoxDecoration(
                          borderRadius: BorderRadius.circular(28),
                          color: Colors.white,
                          boxShadow: [
                            BoxShadow(
                              color: Colors.white.withOpacity(0.22),
                              blurRadius: 20,
                              spreadRadius: 1,
                            ),
                            BoxShadow(
                              color: Colors.black.withOpacity(0.38),
                              blurRadius: 20,
                              offset: const Offset(0, 10),
                            ),
                          ],
                        ),
                        child: ClipRRect(
                          borderRadius: BorderRadius.circular(28),
                          child: Padding(
                            padding: const EdgeInsets.all(16),
                            child: Image.asset(
                              'assets/images/global_ice.png',
                              fit: BoxFit.contain,
                              filterQuality: FilterQuality.high,
                              errorBuilder: (_, __, ___) {
                                return const Icon(
                                  Icons.ac_unit,
                                  size: 48,
                                  color: _navy,
                                );
                              },
                            ),
                          ),
                        ),
                      ),

                      const SizedBox(height: 18),

                      const Text(
                        'Sistema de Entregas',
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          color: Colors.white,
                          fontSize: 29,
                          fontWeight: FontWeight.w900,
                          letterSpacing: 0.2,
                        ),
                      ),

                      const SizedBox(height: 6),

                      Text(
                        'Global Ice de México S.A de C.V',
                        style: TextStyle(
                          color: Colors.white.withOpacity(0.80),
                          fontSize: 14,
                          fontWeight: FontWeight.w500,
                        ),
                      ),

                      const SizedBox(height: 24),

                      Container(
                        width: double.infinity,
                        padding: const EdgeInsets.all(20),
                        decoration: BoxDecoration(
                          borderRadius: BorderRadius.circular(24),
                          color: Colors.white.withOpacity(0.12),
                          border: Border.all(
                            color: Colors.white.withOpacity(0.18),
                          ),
                          boxShadow: [
                            BoxShadow(
                              color: Colors.black.withOpacity(0.35),
                              blurRadius: 30,
                              offset: const Offset(0, 14),
                            ),
                          ],
                        ),
                        child: AnimatedSwitcher(
                          duration: const Duration(milliseconds: 400),
                          switchInCurve: Curves.easeOut,
                          switchOutCurve: Curves.easeIn,
                          child: _ready
                              ? _buildReadyCard(context)
                              : _buildSplashCard(context),
                        ),
                      ),

                      const SizedBox(height: 18),

                      Text(
                        '© ${DateTime.now().year} Global Ice de Mexico',
                        style: TextStyle(
                          color: Colors.white.withOpacity(0.55),
                          fontSize: 12,
                        ),
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

  Widget _buildSplashCard(BuildContext context) {
    return Column(
      key: const ValueKey('splash'),
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          'Preparando tu sesión…',
          style: TextStyle(
            color: Colors.white.withOpacity(0.95),
            fontSize: 16,
            fontWeight: FontWeight.w800,
          ),
        ),
        const SizedBox(height: 14),
        ClipRRect(
          borderRadius: BorderRadius.circular(999),
          child: LinearProgressIndicator(
            minHeight: 10,
            backgroundColor: Colors.white.withOpacity(0.18),
            valueColor: AlwaysStoppedAnimation<Color>(
              Colors.white.withOpacity(0.95),
            ),
          ),
        ),
        const SizedBox(height: 12),
        Text(
          'Cargando módulos de chofer y cliente…',
          textAlign: TextAlign.center,
          style: TextStyle(
            color: Colors.white.withOpacity(0.70),
            fontSize: 12,
          ),
        ),
      ],
    );
  }

  Widget _buildReadyCard(BuildContext context) {
    return FadeTransition(
      key: const ValueKey('ready'),
      opacity: _fade,
      child: ScaleTransition(
        scale: _scale,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text(
              '¡Bienvenido!',
              style: TextStyle(
                color: Colors.white,
                fontSize: 18,
                fontWeight: FontWeight.w900,
              ),
            ),
            const SizedBox(height: 8),
            const SizedBox(height: 16),

            SizedBox(
              width: double.infinity,
              child: FilledButton.icon(
                onPressed: _goDriverLogin,
                icon: const Icon(Icons.local_shipping),
                label: const Text('Soy chofer'),
                style: FilledButton.styleFrom(
                  backgroundColor: _accent,
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(18),
                  ),
                ),
              ),
            ),

            const SizedBox(height: 10),

            SizedBox(
              width: double.infinity,
              child: OutlinedButton.icon(
                onPressed: _goCustomerHome,
                icon: const Icon(Icons.shopping_cart_outlined),
                label: const Text('Quiero hacer pedidos'),
                style: OutlinedButton.styleFrom(
                  foregroundColor: Colors.white,
                  side: BorderSide(
                    color: Colors.white.withOpacity(0.38),
                  ),
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(18),
                  ),
                ),
              ),
            ),

            const SizedBox(height: 12),
          ],
        ),
      ),
    );
  }
}