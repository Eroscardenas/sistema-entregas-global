import 'dart:async';
import 'dart:convert';
import 'dart:math';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:crypto/crypto.dart';
import 'package:flutter/material.dart';

import 'package:mobile/features/production/production_dashboard_page.dart';

class ProductionLoginPage extends StatefulWidget {
  const ProductionLoginPage({super.key});

  @override
  State<ProductionLoginPage> createState() => _ProductionLoginPageState();
}

class _ProductionLoginPageState extends State<ProductionLoginPage>
    with SingleTickerProviderStateMixin {
  final _formKey = GlobalKey<FormState>();
  final _pinCtrl = TextEditingController();

  final FirebaseFirestore _db = FirebaseFirestore.instance;

  List<_ProductionEmployee> _employees = [];
  _ProductionEmployee? _selectedEmployee;

  bool _loadingEmployees = true;
  bool _loggingIn = false;
  bool _showPin = false;

  String _error = '';

  late final AnimationController _snowController;
  final List<_SnowParticle> _snowParticles = [];

  bool get _isBusy => _loadingEmployees || _loggingIn;

  @override
  void initState() {
    super.initState();
    _loadProductionEmployees();
    _initSnowEffect();
  }

  void _initSnowEffect() {
    _snowController = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 2),
    )..repeat();

    final random = Random();
    for (int i = 0; i < 40; i++) {
      _snowParticles.add(
        _SnowParticle(
          x: random.nextDouble(),
          y: random.nextDouble(),
          size: 1.5 + random.nextDouble() * 3,
          speed: 0.15 + random.nextDouble() * 0.4,
          opacity: 0.3 + random.nextDouble() * 0.5,
          drift: (random.nextDouble() - 0.5) * 0.8,
          delay: random.nextDouble() * 2,
        ),
      );
    }
  }

  @override
  void dispose() {
    _pinCtrl.dispose();
    _snowController.dispose();
    super.dispose();
  }

  String _normalizePin(String value) {
    final digits = value.replaceAll(RegExp(r'[^0-9]'), '');
    if (digits.length <= 4) {
      return digits;
    }
    return digits.substring(0, 4);
  }

  bool _isPinValid(String pin) {
    return RegExp(r'^\d{4}$').hasMatch(pin);
  }

  String _hashPin({
    required String pin,
    required String salt,
  }) {
    final input = utf8.encode('$salt:$pin');
    return sha256.convert(input).toString();
  }

  bool _isEmployeeActive(Map<String, dynamic> data) {
    if (data['isActive'] == false) {
      return false;
    }
    final status = (
      data['status'] ??
      data['estado'] ??
      'ACTIVO'
    ).toString().trim().toUpperCase();
    return status != 'INACTIVO';
  }

  Future<void> _loadProductionEmployees() async {
    if (mounted) {
      setState(() {
        _loadingEmployees = true;
        _error = '';
      });
    }

    try {
      final snapshot = await _db.collection('empleados').get();

      final employees = snapshot.docs
          .map((document) {
            final data = document.data();
            final role = (data['role'] ?? '')
                .toString()
                .trim()
                .toUpperCase();
            final codigo = (
              data['codigo'] ??
              document.id
            ).toString().trim().toUpperCase();
            final nombre = (
              data['nombre'] ??
              data['name'] ??
              codigo
            ).toString().trim();

            if (role != 'PRODUCCION') return null;
            if (!_isEmployeeActive(data)) return null;
            if (codigo.isEmpty || nombre.isEmpty) return null;

            return _ProductionEmployee(
              documentId: document.id,
              codigo: codigo,
              nombre: nombre,
              role: role,
              pinSalt: (data['pinSalt'] ?? '').toString().trim(),
              pinHash: (data['pinHash'] ?? '').toString().trim(),
            );
          })
          .whereType<_ProductionEmployee>()
          .toList();

      employees.sort(
        (a, b) => a.nombre.toLowerCase().compareTo(
              b.nombre.toLowerCase(),
            ),
      );

      if (!mounted) return;

      setState(() {
        _employees = employees;
        _selectedEmployee = employees.length == 1
            ? employees.first
            : null;
      });
    } on FirebaseException catch (error) {
      if (!mounted) return;
      setState(() {
        if (error.code == 'permission-denied') {
          _error = 'Firebase no permitió consultar empleados. Revisa las reglas de Firestore.';
        } else if (error.code == 'unavailable') {
          _error = 'No se pudo conectar con Inventario. Revisa tu conexión a internet.';
        } else {
          _error = 'No se pudieron cargar los empleados: ${error.message ?? error.code}';
        }
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _error = 'No se pudieron cargar los empleados de Producción.';
      });
    } finally {
      if (mounted) {
        setState(() {
          _loadingEmployees = false;
        });
      }
    }
  }

  Future<void> _submit() async {
    if (_isBusy) return;
    FocusScope.of(context).unfocus();

    setState(() {
      _error = '';
    });

    final formIsValid = _formKey.currentState?.validate() ?? false;
    if (!formIsValid) return;

    final employee = _selectedEmployee;
    if (employee == null) {
      setState(() {
        _error = 'Selecciona tu nombre.';
      });
      return;
    }

    setState(() {
      _loggingIn = true;
    });

    try {
      final pin = _normalizePin(_pinCtrl.text);

      final document = await _db
          .collection('empleados')
          .doc(employee.documentId)
          .get();

      if (!document.exists) {
        throw Exception('El empleado seleccionado ya no existe.');
      }

      final data = document.data() ?? <String, dynamic>{};
      final role = (data['role'] ?? '').toString().trim().toUpperCase();

      if (role != 'PRODUCCION') {
        throw Exception('Este usuario ya no tiene acceso a Producción.');
      }

      if (!_isEmployeeActive(data)) {
        throw Exception('Usuario desactivado. Contacta al administrador.');
      }

      final salt = (data['pinSalt'] ?? '').toString().trim();
      final storedHash = (data['pinHash'] ?? '').toString().trim();

      if (salt.isEmpty || storedHash.isEmpty) {
        throw Exception('El usuario no tiene PIN configurado. Contacta al administrador.');
      }

      final computedHash = _hashPin(pin: pin, salt: salt);
      if (computedHash != storedHash) {
        throw Exception('PIN incorrecto.');
      }

      final codigo = (
        data['codigo'] ??
        employee.codigo
      ).toString().trim().toUpperCase();

      final nombre = (
        data['nombre'] ??
        employee.nombre
      ).toString().trim();

      if (!mounted) return;

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            'Bienvenido ${nombre.isEmpty ? codigo : nombre} ✅',
          ),
        ),
      );

      Navigator.pushReplacement(
        context,
        MaterialPageRoute(
          builder: (_) => ProductionDashboardPage(
            nombre: nombre.isEmpty ? codigo : nombre,
            profileId: document.id,
          ),
        ),
      );
    } on FirebaseException catch (error) {
      if (!mounted) return;
      setState(() {
        if (error.code == 'permission-denied') {
          _error = 'Firebase no permitió validar el acceso. Revisa las reglas de Firestore.';
        } else if (error.code == 'unavailable') {
          _error = 'No se pudo conectar con Inventario. Revisa tu conexión a internet.';
        } else {
          _error = 'Error de Firebase: ${error.message ?? error.code}';
        }
      });
    } catch (error) {
      if (!mounted) return;
      final message = error.toString().replaceFirst('Exception: ', '').trim();
      setState(() {
        _error = message.isEmpty ? 'No se pudo iniciar sesión.' : message;
      });
    } finally {
      if (mounted) {
        setState(() {
          _loggingIn = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final year = DateTime.now().year;

    return Scaffold(
      body: Stack(
        children: [
          Positioned.fill(
            child: Image.asset(
              'assets/images/app_b.jpg',
              fit: BoxFit.cover,
              filterQuality: FilterQuality.medium,
              errorBuilder: (context, error, stackTrace) {
                return Container(
                  color: const Color(0xFF0A1A2F),
                );
              },
            ),
          ),
          Positioned.fill(
            child: Container(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [
                    Colors.black.withValues(alpha: 0.72),
                    Colors.black.withValues(alpha: 0.60),
                    Colors.black.withValues(alpha: 0.76),
                  ],
                ),
              ),
            ),
          ),
          Positioned(
            top: -220,
            left: -170,
            child: Container(
              height: 520,
              width: 520,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: const Color(0xFF4DADFF)
                    .withValues(alpha: 0.20),
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
                color: const Color(0xFF852838)
                    .withValues(alpha: 0.16),
              ),
            ),
          ),
          // Partículas de nieve
          ..._snowParticles.map((particle) => _buildSnowParticle(particle)),
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.all(18),
              child: Center(
                child: ConstrainedBox(
                  constraints: const BoxConstraints(
                    maxWidth: 520,
                  ),
                  child: SingleChildScrollView(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Row(
                          children: [
                            _IconGlassButton(
                              onTap: () => Navigator.pop(context),
                              icon: Icons.arrow_back,
                            ),
                            const SizedBox(width: 12),
                            const Expanded(
                              child: Text(
                                'Global Ice Producción',
                                style: TextStyle(
                                  color: Colors.white,
                                  fontSize: 20,
                                  fontWeight: FontWeight.w800,
                                ),
                              ),
                            ),
                            _IconGlassButton(
                              onTap: _isBusy
                                  ? () {}
                                  : _loadProductionEmployees,
                              icon: Icons.refresh,
                            ),
                          ],
                        ),
                        const SizedBox(height: 16),
                        Container(
                          width: double.infinity,
                          padding: const EdgeInsets.all(22),
                          decoration: BoxDecoration(
                            borderRadius: BorderRadius.circular(26),
                            color: Colors.white.withValues(
                              alpha: 0.12,
                            ),
                            border: Border.all(
                              color: Colors.white.withValues(
                                alpha: 0.20,
                              ),
                            ),
                            boxShadow: [
                              BoxShadow(
                                color: Colors.black.withValues(
                                  alpha: 0.35,
                                ),
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
                                Row(
                                  children: [
                                    Container(
                                      height: 58,
                                      width: 58,
                                      decoration: BoxDecoration(
                                        borderRadius:
                                            BorderRadius.circular(18),
                                        color: Colors.white,
                                        boxShadow: [
                                          BoxShadow(
                                            color: Colors.white
                                                .withValues(
                                              alpha: 0.22,
                                            ),
                                            blurRadius: 18,
                                            spreadRadius: 1,
                                          ),
                                        ],
                                      ),
                                      child: ClipRRect(
                                        borderRadius:
                                            BorderRadius.circular(18),
                                        child: Padding(
                                          padding:
                                              const EdgeInsets.all(8),
                                          child: Image.asset(
                                            'assets/images/global_ice.png',
                                            fit: BoxFit.contain,
                                            filterQuality:
                                                FilterQuality.medium,
                                            errorBuilder: (
                                              context,
                                              error,
                                              stackTrace,
                                            ) {
                                              return const Icon(
                                                Icons.factory_outlined,
                                                color:
                                                    Color(0xFF0A1A2F),
                                                size: 35,
                                              );
                                            },
                                          ),
                                        ),
                                      ),
                                    ),
                                    const SizedBox(width: 13),
                                    Expanded(
                                      child: Column(
                                        crossAxisAlignment:
                                            CrossAxisAlignment.start,
                                        children: [
                                          Text(
                                            'Acceso de Producción',
                                            style: TextStyle(
                                              color: Colors.white
                                                  .withValues(
                                                alpha: 0.95,
                                              ),
                                              fontSize: 17,
                                              fontWeight:
                                                  FontWeight.w900,
                                            ),
                                          ),
                                          const SizedBox(height: 3),
                                          Text(
                                            'Selecciona tu nombre e ingresa el PIN asignado en Inventario',
                                            style: TextStyle(
                                              color: Colors.white
                                                  .withValues(
                                                alpha: 0.70,
                                              ),
                                              fontSize: 12,
                                              height: 1.3,
                                            ),
                                          ),
                                        ],
                                      ),
                                    ),
                                  ],
                                ),
                                const SizedBox(height: 22),
                                _buildEmployeeSelector(),
                                const SizedBox(height: 14),
                                _GlassField(
                                  label: 'PIN',
                                  controller: _pinCtrl,
                                  hintText: '••••',
                                  keyboardType:
                                      TextInputType.number,
                                  prefixIcon: Icons.pin_outlined,
                                  enabled: !_isBusy,
                                  obscureText: !_showPin,
                                  maxLength: 4,
                                  validator: (value) {
                                    final pin = _normalizePin(
                                      value ?? '',
                                    );
                                    if (!_isPinValid(pin)) {
                                      return 'El PIN debe tener 4 dígitos';
                                    }
                                    return null;
                                  },
                                  trailing: IconButton(
                                    onPressed: _isBusy
                                        ? null
                                        : () {
                                            setState(() {
                                              _showPin = !_showPin;
                                            });
                                          },
                                    icon: Icon(
                                      _showPin
                                          ? Icons.visibility_off
                                          : Icons.visibility,
                                      color: Colors.white.withValues(
                                        alpha: 0.75,
                                      ),
                                    ),
                                  ),
                                ),
                                const SizedBox(height: 14),
                                AnimatedSwitcher(
                                  duration: const Duration(
                                    milliseconds: 250,
                                  ),
                                  child: _error.isEmpty
                                      ? const SizedBox.shrink()
                                      : Container(
                                          key: ValueKey(_error),
                                          width: double.infinity,
                                          padding:
                                              const EdgeInsets.all(12),
                                          decoration: BoxDecoration(
                                            borderRadius:
                                                BorderRadius.circular(
                                              16,
                                            ),
                                            color: const Color(
                                              0xFFFF4D4D,
                                            ).withValues(
                                              alpha: 0.14,
                                            ),
                                            border: Border.all(
                                              color: const Color(
                                                0xFFFF4D4D,
                                              ).withValues(
                                                alpha: 0.25,
                                              ),
                                            ),
                                          ),
                                          child: Row(
                                            crossAxisAlignment:
                                                CrossAxisAlignment
                                                    .start,
                                            children: [
                                              const Icon(
                                                Icons.error_outline,
                                                color:
                                                    Color(0xFFFFC1C1),
                                              ),
                                              const SizedBox(width: 10),
                                              Expanded(
                                                child: Text(
                                                  _error,
                                                  style: TextStyle(
                                                    color: Colors.white
                                                        .withValues(
                                                      alpha: 0.92,
                                                    ),
                                                    fontSize: 12.5,
                                                    height: 1.25,
                                                  ),
                                                ),
                                              ),
                                            ],
                                          ),
                                        ),
                                ),
                                const SizedBox(height: 16),
                                SizedBox(
                                  width: double.infinity,
                                  child: ElevatedButton.icon(
                                    onPressed:
                                        _isBusy ? null : _submit,
                                    icon: _loggingIn
                                        ? const SizedBox(
                                            height: 18,
                                            width: 18,
                                            child:
                                                CircularProgressIndicator(
                                              strokeWidth: 2.4,
                                              valueColor:
                                                  AlwaysStoppedAnimation<
                                                      Color>(
                                                Colors.white,
                                              ),
                                            ),
                                          )
                                        : const Icon(Icons.login),
                                    label: Text(
                                      _loggingIn
                                          ? 'Validando acceso...'
                                          : 'Entrar a Producción',
                                      style: const TextStyle(
                                        fontWeight:
                                            FontWeight.w800,
                                      ),
                                    ),
                                    style: ElevatedButton.styleFrom(
                                      padding:
                                          const EdgeInsets.symmetric(
                                        vertical: 15,
                                      ),
                                      backgroundColor:
                                          const Color(0xFF4DADFF),
                                      foregroundColor: Colors.white,
                                      disabledBackgroundColor:
                                          const Color(0xFF4DADFF)
                                              .withValues(
                                        alpha: 0.45,
                                      ),
                                      disabledForegroundColor:
                                          Colors.white70,
                                      shape: RoundedRectangleBorder(
                                        borderRadius:
                                            BorderRadius.circular(18),
                                      ),
                                      elevation: 0,
                                    ),
                                  ),
                                ),
                                const SizedBox(height: 11),
                                Text(
                                  'Los empleados y PIN se administran desde el sistema de Inventario.',
                                  textAlign: TextAlign.center,
                                  style: TextStyle(
                                    color: Colors.white.withValues(
                                      alpha: 0.55,
                                    ),
                                    fontSize: 12,
                                    height: 1.3,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                        const SizedBox(height: 14),
                        Text(
                          '© $year Global Ice de México S.A. de C.V.',
                          style: TextStyle(
                            color: Colors.white.withValues(
                              alpha: 0.52,
                            ),
                            fontSize: 12,
                          ),
                        ),
                      ],
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

  Widget _buildEmployeeSelector() {
    if (_loadingEmployees) {
      return Container(
        width: double.infinity,
        padding: const EdgeInsets.symmetric(
          horizontal: 16,
          vertical: 17,
        ),
        decoration: BoxDecoration(
          color: Colors.white.withValues(alpha: 0.10),
          borderRadius: BorderRadius.circular(18),
          border: Border.all(
            color: Colors.white.withValues(alpha: 0.16),
          ),
        ),
        child: const Row(
          children: [
            SizedBox(
              height: 20,
              width: 20,
              child: CircularProgressIndicator(
                strokeWidth: 2.3,
                valueColor: AlwaysStoppedAnimation<Color>(
                  Color(0xFF4DADFF),
                ),
              ),
            ),
            SizedBox(width: 12),
            Text(
              'Cargando empleados de Producción...',
              style: TextStyle(
                color: Colors.white,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
        ),
      );
    }

    if (_employees.isEmpty) {
      return Container(
        width: double.infinity,
        padding: const EdgeInsets.all(15),
        decoration: BoxDecoration(
          color: Colors.white.withValues(alpha: 0.08),
          borderRadius: BorderRadius.circular(18),
          border: Border.all(
            color: Colors.white.withValues(alpha: 0.15),
          ),
        ),
        child: Column(
          children: [
            const Icon(
              Icons.groups_outlined,
              color: Colors.white70,
              size: 32,
            ),
            const SizedBox(height: 8),
            const Text(
              'No se encontraron empleados activos de Producción.',
              textAlign: TextAlign.center,
              style: TextStyle(
                color: Colors.white,
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: 8),
            TextButton.icon(
              onPressed: _loadProductionEmployees,
              icon: const Icon(Icons.refresh),
              label: const Text('Volver a cargar'),
              style: TextButton.styleFrom(
                foregroundColor: const Color(0xFF4DADFF),
              ),
            ),
          ],
        ),
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Empleado',
          style: TextStyle(
            color: Colors.white.withValues(alpha: 0.82),
            fontSize: 13,
            fontWeight: FontWeight.w700,
          ),
        ),
        const SizedBox(height: 8),
        DropdownButtonFormField<_ProductionEmployee>(
          initialValue: _selectedEmployee,
          isExpanded: true,
          dropdownColor: const Color(0xFF13243A),
          iconEnabledColor: Colors.white,
          style: const TextStyle(
            color: Colors.white,
            fontWeight: FontWeight.w600,
          ),
          decoration: InputDecoration(
            prefixIcon: Icon(
              Icons.badge_outlined,
              color: Colors.white.withValues(alpha: 0.75),
            ),
            filled: true,
            fillColor: Colors.white.withValues(alpha: 0.10),
            contentPadding: const EdgeInsets.symmetric(
              horizontal: 14,
              vertical: 14,
            ),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(18),
              borderSide: BorderSide(
                color: Colors.white.withValues(alpha: 0.16),
              ),
            ),
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(18),
              borderSide: const BorderSide(
                color: Color(0xFF4DADFF),
                width: 1.4,
              ),
            ),
            errorBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(18),
              borderSide: const BorderSide(
                color: Color(0xFFFF7777),
              ),
            ),
            focusedErrorBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(18),
              borderSide: const BorderSide(
                color: Color(0xFFFF7777),
              ),
            ),
            errorStyle: TextStyle(
              color: Colors.red.shade100,
            ),
          ),
          hint: Text(
            'Selecciona tu nombre',
            style: TextStyle(
              color: Colors.white.withValues(alpha: 0.48),
            ),
          ),
          items: _employees.map((employee) {
            return DropdownMenuItem<_ProductionEmployee>(
              value: employee,
              child: Text(
                '${employee.nombre} · ${employee.codigo}',
                overflow: TextOverflow.ellipsis,
              ),
            );
          }).toList(),
          onChanged: _isBusy
              ? null
              : (employee) {
                  setState(() {
                    _selectedEmployee = employee;
                    _pinCtrl.clear();
                    _error = '';
                  });
                },
          validator: (employee) {
            if (employee == null) {
              return 'Selecciona tu nombre';
            }
            return null;
          },
        ),
      ],
    );
  }

  Widget _buildSnowParticle(_SnowParticle particle) {
    return Positioned(
      left: particle.x * MediaQuery.of(context).size.width,
      top: particle.y * MediaQuery.of(context).size.height,
      child: AnimatedBuilder(
        animation: _snowController,
        builder: (context, child) {
          final progress = _snowController.value + particle.delay;
          // Movimiento descendente continuo
          final yOffset = (progress * particle.speed * 300) %
              (MediaQuery.of(context).size.height * 1.2);
          // Movimiento de deriva lateral
          final xOffset = sin(progress * 2 + particle.x * 5) * particle.drift * 40;
          
          // Efecto de parpadeo
          final opacityValue = particle.opacity * 
              (0.5 + 0.5 * sin(progress * 1.2 + particle.y * 3));

          return Transform.translate(
            offset: Offset(xOffset, yOffset - 
                (MediaQuery.of(context).size.height * particle.y)),
            child: Opacity(
              opacity: opacityValue.clamp(0.0, 1.0),
              child: Container(
                width: particle.size,
                height: particle.size,
                decoration: BoxDecoration(
                  color: Colors.white,
                  shape: BoxShape.circle,
                  boxShadow: [
                    BoxShadow(
                      color: Colors.white.withValues(alpha: 0.3),
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

class _ProductionEmployee {
  final String documentId;
  final String codigo;
  final String nombre;
  final String role;
  final String pinSalt;
  final String pinHash;

  const _ProductionEmployee({
    required this.documentId,
    required this.codigo,
    required this.nombre,
    required this.role,
    required this.pinSalt,
    required this.pinHash,
  });

  @override
  bool operator ==(Object other) {
    return other is _ProductionEmployee &&
        other.documentId == documentId;
  }

  @override
  int get hashCode => documentId.hashCode;
}

class _IconGlassButton extends StatelessWidget {
  final VoidCallback onTap;
  final IconData icon;

  const _IconGlassButton({
    required this.onTap,
    required this.icon,
  });

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white.withValues(alpha: 0.10),
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(14),
        child: Container(
          height: 44,
          width: 44,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(14),
            border: Border.all(
              color: Colors.white.withValues(alpha: 0.16),
            ),
          ),
          child: Icon(
            icon,
            color: Colors.white,
          ),
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
  final int? maxLength;
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
    this.maxLength,
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
            color: Colors.white.withValues(alpha: 0.82),
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
          maxLength: maxLength,
          style: const TextStyle(
            color: Colors.white,
            fontWeight: FontWeight.w600,
          ),
          decoration: InputDecoration(
            hintText: hintText,
            counterText: '',
            hintStyle: TextStyle(
              color: Colors.white.withValues(alpha: 0.38),
            ),
            prefixIcon: Icon(
              prefixIcon,
              color: Colors.white.withValues(alpha: 0.75),
            ),
            suffixIcon: trailing,
            filled: true,
            fillColor: Colors.white.withValues(alpha: 0.10),
            contentPadding: const EdgeInsets.symmetric(
              horizontal: 14,
              vertical: 14,
            ),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(18),
              borderSide: BorderSide(
                color: Colors.white.withValues(alpha: 0.16),
              ),
            ),
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(18),
              borderSide: const BorderSide(
                color: Color(0xFF4DADFF),
                width: 1.4,
              ),
            ),
            errorBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(18),
              borderSide: BorderSide(
                color: const Color(0xFFFF4D4D)
                    .withValues(alpha: 0.60),
              ),
            ),
            focusedErrorBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(18),
              borderSide: BorderSide(
                color: const Color(0xFFFF4D4D)
                    .withValues(alpha: 0.80),
              ),
            ),
            disabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(18),
              borderSide: BorderSide(
                color: Colors.white.withValues(alpha: 0.08),
              ),
            ),
            errorStyle: TextStyle(
              color: Colors.red.shade100,
            ),
          ),
        ),
      ],
    );
  }
}

class _SnowParticle {
  final double x;
  final double y;
  final double size;
  final double speed;
  final double opacity;
  final double drift;
  final double delay;

  _SnowParticle({
    required this.x,
    required this.y,
    required this.size,
    required this.speed,
    required this.opacity,
    required this.drift,
    required this.delay,
  });
}