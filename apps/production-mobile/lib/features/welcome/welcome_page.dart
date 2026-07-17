import 'dart:async';
import 'dart:math';

import 'package:flutter/material.dart';
import 'package:mobile/features/production/production_login_page.dart';

class WelcomePage extends StatefulWidget {
  const WelcomePage({super.key});

  @override
  State<WelcomePage> createState() => _WelcomePageState();
}

class _WelcomePageState extends State<WelcomePage>
    with SingleTickerProviderStateMixin {
  // Paleta de azules y blancos
  static const Color _navy = Color(0xFF0A1A2F);
  static const Color _accentBlue = Color(0xFF4DADFF);
  static const Color _lightBlue = Color(0xFF7EC8FF);
  static const Color _darkBlue = Color(0xFF0D2847);
  static const Color _softBlue = Color(0xFF1E3A5F);
  static const Color _white = Color(0xFFFFFFFF);

  late final AnimationController _animationController;
  late final Animation<double> _fadeAnimation;
  late final Animation<double> _scaleAnimation;
  late final Animation<double> _pulseAnimation;

  Timer? _navigationTimer;
  final List<_FrostParticle> _particles = [];

  @override
  void initState() {
    super.initState();

    _animationController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1200),
    );

    _fadeAnimation = CurvedAnimation(
      parent: _animationController,
      curve: Curves.easeOutCubic,
    );

    _scaleAnimation = Tween<double>(
      begin: 0.94,
      end: 1,
    ).animate(
      CurvedAnimation(
        parent: _animationController,
        curve: Curves.easeOutBack,
      ),
    );

    _pulseAnimation = Tween<double>(
      begin: 0.8,
      end: 1.2,
    ).animate(
      CurvedAnimation(
        parent: _animationController,
        curve: Curves.easeInOut,
      ),
    );

    _animationController.forward();

    _navigationTimer = Timer(
      const Duration(seconds: 4),
      _openProductionLogin,
    );

    _generateParticles();
  }

  void _generateParticles() {
    final random = Random();
    for (int i = 0; i < 30; i++) {
      _particles.add(
        _FrostParticle(
          x: random.nextDouble(),
          y: random.nextDouble(),
          size: 2 + random.nextDouble() * 4,
          speed: 0.3 + random.nextDouble() * 0.7,
          opacity: 0.3 + random.nextDouble() * 0.5,
          drift: (random.nextDouble() - 0.5) * 0.5,
        ),
      );
    }
  }

  void _openProductionLogin() {
    if (!mounted) return;

    Navigator.of(context).pushReplacement(
      MaterialPageRoute(
        builder: (_) => const ProductionLoginPage(),
      ),
    );
  }

  @override
  void dispose() {
    _navigationTimer?.cancel();
    _animationController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final year = DateTime.now().year;

    return Scaffold(
      backgroundColor: _navy,
      body: Stack(
        children: [
          // Fondo de pantalla
          Positioned.fill(
            child: Image.asset(
              'assets/images/background_app.jpg',
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

          // Overlay oscuro
          Positioned.fill(
            child: Container(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [
                    Colors.black.withValues(alpha: 0.55),
                    _darkBlue.withValues(alpha: 0.40),
                    Colors.black.withValues(alpha: 0.75),
                  ],
                  stops: const [0.0, 0.4, 1.0],
                ),
              ),
            ),
          ),

          // Círculos decorativos en azul
          Positioned(
            top: -220,
            left: -180,
            child: Container(
              height: 520,
              width: 520,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: _accentBlue.withValues(alpha: 0.10),
              ),
            ),
          ),
          Positioned(
            bottom: -250,
            right: -190,
            child: Container(
              height: 560,
              width: 560,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: _lightBlue.withValues(alpha: 0.06),
              ),
            ),
          ),
          Positioned(
            top: 100,
            right: -50,
            child: Container(
              height: 200,
              width: 200,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: _accentBlue.withValues(alpha: 0.08),
              ),
            ),
          ),

          // Partículas de escarcha
          ..._particles.map((particle) => _buildParticle(particle)),

          SafeArea(
            child: Center(
              child: SingleChildScrollView(
                padding: const EdgeInsets.all(24),
                child: ConstrainedBox(
                  constraints: const BoxConstraints(
                    maxWidth: 520,
                  ),
                  child: FadeTransition(
                    opacity: _fadeAnimation,
                    child: ScaleTransition(
                      scale: _scaleAnimation,
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          // Logo con glow pulsante
                          AnimatedBuilder(
                            animation: _pulseAnimation,
                            builder: (context, child) {
                              return Container(
                                height: 126,
                                width: 126,
                                padding: const EdgeInsets.all(18),
                                decoration: BoxDecoration(
                                  color: Colors.white,
                                  borderRadius: BorderRadius.circular(32),
                                  boxShadow: [
                                    BoxShadow(
                                      color: _accentBlue.withValues(alpha: 0.35),
                                      blurRadius: 40 * _pulseAnimation.value,
                                      spreadRadius: 4,
                                    ),
                                    BoxShadow(
                                      color: _lightBlue.withValues(alpha: 0.20),
                                      blurRadius: 30,
                                      spreadRadius: 2,
                                    ),
                                    BoxShadow(
                                      color: Colors.black.withValues(alpha: 0.40),
                                      blurRadius: 26,
                                      offset: const Offset(0, 12),
                                    ),
                                  ],
                                ),
                                child: Image.asset(
                                  'assets/images/global_ice.png',
                                  fit: BoxFit.contain,
                                  errorBuilder: (_, __, ___) {
                                    return Icon(
                                      Icons.ac_unit,
                                      size: 58,
                                      color: _navy,
                                    );
                                  },
                                ),
                              );
                            },
                          ),
                          const SizedBox(height: 24),

                          // Título en blanco
                          Text(
                            'Global Ice Producción',
                            textAlign: TextAlign.center,
                            style: TextStyle(
                              color: Colors.white,
                              fontSize: 31,
                              fontWeight: FontWeight.w900,
                              letterSpacing: 0.5,
                            ),
                          ),
                          const SizedBox(height: 8),

                          // Subtítulo con badge
                          Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 16,
                              vertical: 4,
                            ),
                            decoration: BoxDecoration(
                              color: _softBlue.withValues(alpha: 0.3),
                              borderRadius: BorderRadius.circular(20),
                              border: Border.all(
                                color: _accentBlue.withValues(alpha: 0.2),
                              ),
                            ),
                            child: Text(
                              'VENTAS · PRODUCCIÓN · INVENTARIO',
                              style: TextStyle(
                                color: _lightBlue.withValues(alpha: 0.8),
                                fontSize: 10,
                                fontWeight: FontWeight.w700,
                                letterSpacing: 2,
                              ),
                            ),
                          ),
                          const SizedBox(height: 30),

                          // Card de carga
                          Container(
                            width: double.infinity,
                            padding: const EdgeInsets.all(24),
                            decoration: BoxDecoration(
                              color: Colors.white.withValues(alpha: 0.06),
                              borderRadius: BorderRadius.circular(26),
                              border: Border.all(
                                color: Colors.white.withValues(alpha: 0.08),
                                width: 1,
                              ),
                              boxShadow: [
                                BoxShadow(
                                  color: _accentBlue.withValues(alpha: 0.12),
                                  blurRadius: 30,
                                  spreadRadius: 2,
                                  offset: const Offset(0, 8),
                                ),
                                BoxShadow(
                                  color: Colors.black.withValues(alpha: 0.30),
                                  blurRadius: 28,
                                  offset: const Offset(0, 14),
                                ),
                              ],
                            ),
                            child: Column(
                              children: [
                                // Icono
                                Container(
                                  padding: const EdgeInsets.all(12),
                                  decoration: BoxDecoration(
                                    color: _accentBlue.withValues(alpha: 0.15),
                                    shape: BoxShape.circle,
                                  ),
                                  child: Icon(
                                    Icons.factory_outlined,
                                    color: _accentBlue,
                                    size: 38,
                                  ),
                                ),
                                const SizedBox(height: 14),
                                Text(
                                  'Preparando módulo de Producción',
                                  textAlign: TextAlign.center,
                                  style: TextStyle(
                                    color: Colors.white,
                                    fontSize: 17,
                                    fontWeight: FontWeight.w800,
                                  ),
                                ),
                                const SizedBox(height: 16),
                                ClipRRect(
                                  borderRadius: BorderRadius.circular(999),
                                  child: LinearProgressIndicator(
                                    minHeight: 8,
                                    backgroundColor:
                                        Colors.white.withValues(alpha: 0.10),
                                    valueColor:
                                        const AlwaysStoppedAnimation<Color>(
                                          _accentBlue,
                                        ),
                                  ),
                                ),
                                const SizedBox(height: 14),
                                Row(
                                  mainAxisAlignment: MainAxisAlignment.center,
                                  children: [
                                    AnimatedBuilder(
                                      animation: _pulseAnimation,
                                      builder: (context, child) {
                                        return Container(
                                          width: 6,
                                          height: 6,
                                          decoration: BoxDecoration(
                                            color: _accentBlue.withValues(
                                              alpha: 0.4 + (0.4 * (_pulseAnimation.value - 0.8) / 0.4),
                                            ),
                                            shape: BoxShape.circle,
                                          ),
                                        );
                                      },
                                    ),
                                    const SizedBox(width: 10),
                                    Text(
                                      'Conectando inventario, empleados y ventas…',
                                      textAlign: TextAlign.center,
                                      style: TextStyle(
                                        color: Colors.white.withValues(alpha: 0.60),
                                        fontSize: 12.5,
                                        letterSpacing: 0.2,
                                      ),
                                    ),
                                    const SizedBox(width: 10),
                                    AnimatedBuilder(
                                      animation: _pulseAnimation,
                                      builder: (context, child) {
                                        return Container(
                                          width: 6,
                                          height: 6,
                                          decoration: BoxDecoration(
                                            color: _lightBlue.withValues(
                                              alpha: 0.4 + (0.4 * (_pulseAnimation.value - 0.8) / 0.4),
                                            ),
                                            shape: BoxShape.circle,
                                          ),
                                        );
                                      },
                                    ),
                                  ],
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(height: 28),

                          // Botón continuar
                          Container(
                            width: 200,
                            height: 52,
                            decoration: BoxDecoration(
                              color: _accentBlue,
                              borderRadius: BorderRadius.circular(16),
                              boxShadow: [
                                BoxShadow(
                                  color: _accentBlue.withValues(alpha: 0.4),
                                  blurRadius: 24,
                                  spreadRadius: 2,
                                  offset: const Offset(0, 6),
                                ),
                                BoxShadow(
                                  color: _lightBlue.withValues(alpha: 0.2),
                                  blurRadius: 16,
                                  spreadRadius: 1,
                                ),
                              ],
                            ),
                            child: TextButton.icon(
                              onPressed: _openProductionLogin,
                              icon: const Icon(
                                Icons.arrow_forward_rounded,
                                size: 20,
                              ),
                              label: const Text(
                                'Continuar',
                                style: TextStyle(
                                  fontSize: 16,
                                  fontWeight: FontWeight.w700,
                                  letterSpacing: 0.5,
                                ),
                              ),
                              style: TextButton.styleFrom(
                                foregroundColor: Colors.white,
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 32,
                                ),
                                shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(16),
                                ),
                              ),
                            ),
                          ),
                          const SizedBox(height: 20),

                          // Footer
                          Column(
                            children: [
                              Container(
                                width: 60,
                                height: 1.5,
                                color: _accentBlue.withValues(alpha: 0.2),
                              ),
                              const SizedBox(height: 10),
                              Text(
                                '© $year Global Ice de México S.A. de C.V.',
                                style: TextStyle(
                                  color: Colors.white.withValues(alpha: 0.40),
                                  fontSize: 11,
                                  letterSpacing: 0.3,
                                ),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildParticle(_FrostParticle particle) {
    return Positioned(
      left: particle.x * MediaQuery.of(context).size.width,
      top: particle.y * MediaQuery.of(context).size.height,
      child: AnimatedBuilder(
        animation: _animationController,
        builder: (context, child) {
          final progress = _animationController.value;
          final yOffset = (progress * particle.speed * 200) % 
              (MediaQuery.of(context).size.height * 1.2);
          final xOffset = sin(progress * 3 + particle.x * 10) * particle.drift * 30;
          
          return Transform.translate(
            offset: Offset(xOffset, yOffset),
            child: Opacity(
              opacity: particle.opacity * (0.5 + 0.5 * sin(progress * 2 + particle.y * 5)),
              child: Container(
                width: particle.size,
                height: particle.size,
                decoration: BoxDecoration(
                  color: Colors.white,
                  shape: BoxShape.circle,
                  boxShadow: [
                    BoxShadow(
                      color: Colors.white.withValues(alpha: 0.5),
                      blurRadius: 6,
                      spreadRadius: 1,
                    ),
                  ],
                ),
              ),
            ),
          );
        },
      ),
    );
  }
}

class _FrostParticle {
  final double x;
  final double y;
  final double size;
  final double speed;
  final double opacity;
  final double drift;

  _FrostParticle({
    required this.x,
    required this.y,
    required this.size,
    required this.speed,
    required this.opacity,
    required this.drift,
  });
}