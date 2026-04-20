import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'package:mobile/features/driver/driver_route_page.dart';
import 'package:mobile/features/driver/driver_stock_page.dart';
import 'package:mobile/features/driver/driver_support_page.dart';
import 'package:mobile/features/driver/driver_printer_page.dart';

class DriverDashboardPage extends StatefulWidget {
  final String phone;
  final String? nombre;
  final String? driverId;
  final String? profileId;
  final String? status;

  const DriverDashboardPage({
    super.key,
    required this.phone,
    this.nombre,
    this.driverId,
    this.profileId,
    this.status,
  });

  @override
  State<DriverDashboardPage> createState() => _DriverDashboardPageState();
}

class _DriverDashboardPageState extends State<DriverDashboardPage> {
  static const _navy = Color(0xFF0A1A2F);
  static const _royal = Color(0xFF1E4A7A);
  static const _accent = Color(0xFF4DADFF);
  static const _burgundy = Color(0xFF852838);

  bool _loading = true;
  String _nombre = '';
  String _telefono = '';
  String _status = 'available';
  String? _driverId;
  String? _profileId;

  String? _error;

  SupabaseClient get _sb => Supabase.instance.client;

  @override
  void initState() {
    super.initState();
    _bootstrap();
  }

  Future<void> _bootstrap() async {
    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final user = _sb.auth.currentUser;
      if (user == null) {
        throw Exception('Sesión no válida. Inicia sesión nuevamente.');
      }

      _telefono = widget.phone;
      _nombre = (widget.nombre ?? '').trim();
      _status = (widget.status ?? 'available').trim();
      _profileId = widget.profileId ?? user.id;
      _driverId = widget.driverId;

      final profile = await _sb
          .from('profiles')
          .select('id, role, nombre, activo')
          .eq('id', _profileId!)
          .maybeSingle();

      if (profile == null) {
        throw Exception('No se encontró tu perfil.');
      }
      if (profile['activo'] != true) {
        throw Exception('Tu acceso está desactivado.');
      }

      final nombreDb = (profile['nombre'] ?? '').toString().trim();
      if (_nombre.isEmpty && nombreDb.isNotEmpty) {
        _nombre = nombreDb;
      }

      final driver = await _sb
          .from('drivers')
          .select('id, profile_id, nombre, telefono, activo, current_status')
          .eq('profile_id', _profileId!)
          .maybeSingle();

      if (driver == null) {
        throw Exception('No se encontró tu registro de chofer.');
      }
      if (driver['activo'] != true) {
        throw Exception('Tu acceso está desactivado.');
      }

      _driverId = (driver['id'] ?? '').toString();

      final drvNombre = (driver['nombre'] ?? '').toString().trim();
      final drvTel = (driver['telefono'] ?? '').toString().trim();
      final drvStatus = (driver['current_status'] ?? 'available').toString().trim();

      if (_nombre.isEmpty && drvNombre.isNotEmpty) {
        _nombre = drvNombre;
      }
      if (drvTel.isNotEmpty) {
        _telefono = drvTel;
      }
      if (drvStatus.isNotEmpty) {
        _status = drvStatus;
      }

      if (!mounted) return;
      setState(() => _loading = false);
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString().replaceFirst('Exception: ', '');
        _loading = false;
      });
    }
  }

  String _statusLabel(String s) {
    switch (s.toLowerCase()) {
      case 'available':
        return 'Disponible';
      case 'on_route':
        return 'En ruta';
      case 'offline':
        return 'Offline';
      default:
        return s;
    }
  }

  Color _statusColor(String s) {
    switch (s.toLowerCase()) {
      case 'available':
        return const Color(0xFF10B981);
      case 'on_route':
        return const Color(0xFFF59E0B);
      case 'offline':
        return const Color(0xFF9CA3AF);
      default:
        return _accent;
    }
  }

  Future<void> _logout() async {
    try {
      await _sb.auth.signOut();
    } catch (_) {}
    if (!mounted) return;
    Navigator.of(context).popUntil((r) => r.isFirst);
  }

  void _openRoutePage() {
    if (_driverId == null || _driverId!.isEmpty || _profileId == null) return;

    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => DriverRoutePage(
          driverId: _driverId!,
          profileId: _profileId!,
          driverName: _nombre.isNotEmpty ? _nombre : 'Chofer',
          phone: _telefono,
        ),
      ),
    );
  }

  void _openStockPage() {
    if (_driverId == null || _driverId!.isEmpty || _profileId == null) return;

    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => DriverStockPage(
          driverId: _driverId!,
          profileId: _profileId!,
          driverName: _nombre.isNotEmpty ? _nombre : 'Chofer',
        ),
      ),
    );
  }

  void _openSupportPage() {
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => const DriverSupportPage(),
      ),
    );
  }

  void _openPrinterPage() {
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => DriverPrinterPage(
          driverName: _nombre.isNotEmpty ? _nombre : 'Chofer',
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final nameShown = _nombre.isNotEmpty ? _nombre : 'Chofer';
    final statusLabel = _statusLabel(_status);
    final statusColor = _statusColor(_status);

    return Scaffold(
      backgroundColor: _navy,
      appBar: AppBar(
        backgroundColor: _navy,
        foregroundColor: Colors.white,
        elevation: 0,
        automaticallyImplyLeading: false,
        title: const Text(
          'Global Ice de Mexico | Panel Chofer',
          style: TextStyle(fontWeight: FontWeight.w900),
        ),
        actions: [
          IconButton(
            onPressed: _loading ? null : _bootstrap,
            tooltip: 'Actualizar',
            icon: const Icon(Icons.refresh),
          ),
          IconButton(
            onPressed: _loading ? null : _logout,
            tooltip: 'Cerrar sesión',
            icon: const Icon(Icons.logout),
          ),
          const SizedBox(width: 6),
        ],
      ),
      body: Stack(
        children: [
          Positioned.fill(
            child: Container(
              decoration: const BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: [_navy, _royal],
                ),
              ),
            ),
          ),
          Positioned(
            top: -220,
            left: -160,
            child: Container(
              height: 520,
              width: 520,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: _accent.withOpacity(0.18),
              ),
            ),
          ),
          Positioned(
            bottom: -260,
            right: -200,
            child: Container(
              height: 640,
              width: 640,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: _burgundy.withOpacity(0.16),
              ),
            ),
          ),
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.all(18),
              child: _loading
                  ? const Center(
                      child: SizedBox(
                        height: 34,
                        width: 34,
                        child: CircularProgressIndicator(
                          strokeWidth: 3,
                          valueColor: AlwaysStoppedAnimation<Color>(_accent),
                        ),
                      ),
                    )
                  : _error != null
                      ? _ErrorPanel(
                          message: _error!,
                          onRetry: _bootstrap,
                        )
                      : Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            _GlassCard(
                              child: Row(
                                children: [
                                  Container(
                                    height: 54,
                                    width: 54,
                                    decoration: BoxDecoration(
                                      borderRadius: BorderRadius.circular(16),
                                      color: Colors.white.withOpacity(0.12),
                                      border: Border.all(
                                        color: Colors.white.withOpacity(0.18),
                                      ),
                                    ),
                                    child: const Icon(Icons.local_shipping, color: Colors.white),
                                  ),
                                  const SizedBox(width: 14),
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        Text(
                                          '¡Bienvenido, $nameShown! ',
                                          maxLines: 1,
                                          overflow: TextOverflow.ellipsis,
                                          style: const TextStyle(
                                            color: Colors.white,
                                            fontSize: 16,
                                            fontWeight: FontWeight.w900,
                                          ),
                                        ),
                                        const SizedBox(height: 4),
                                        Text(
                                          'Tel: $_telefono',
                                          style: TextStyle(
                                            color: Colors.white.withOpacity(0.70),
                                            fontSize: 8,
                                            fontWeight: FontWeight.w600,
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                ],
                              ),
                            ),
                            const SizedBox(height: 16),
                            Row(
                              children: [
                                Expanded(
                                  child: _ActionCard(
                                    icon: Icons.route,
                                    title: 'Mi ruta',
                                    subtitle: 'Ver asignaciones',
                                    onTap: _openRoutePage,
                                  ),
                                ),
                                const SizedBox(width: 16),
                                Expanded(
                                  child: _ActionCard(
                                    icon: Icons.inventory_2_outlined,
                                    title: 'Stock',
                                    subtitle: 'Carga consolidada',
                                    onTap: _openStockPage,
                                  ),
                                ),
                              ],
                            ),
                            const SizedBox(height: 12),
                            Row(
                              children: [
                                Expanded(
                                  child: _ActionCard(
                                    icon: Icons.print,
                                    title: 'Impresora',
                                    subtitle: 'Bluetooth térmica',
                                    onTap: _openPrinterPage,
                                  ),
                                ),
                                const SizedBox(width: 12),
                                Expanded(
                                  child: _ActionCard(
                                    icon: Icons.support_agent,
                                    title: 'Soporte',
                                    subtitle: 'Ventas / logística',
                                    onTap: _openSupportPage,
                                  ),
                                ),
                              ],
                            ),
                            const SizedBox(height: 12),
                            Row(
                              children: [
                                Expanded(
                                  child: _GlassMiniInfo(
                                    icon: Icons.verified_user_outlined,
                                    title: 'Estado actual',
                                    subtitle: statusLabel,
                                    badgeColor: statusColor,
                                  ),
                                ),
                                const SizedBox(width: 12),
                                Expanded(
                                  child: _GlassMiniInfo(
                                    icon: Icons.print_outlined,
                                    title: 'Impresión',
                                    subtitle: 'Configurar ticket',
                                    badgeColor: _accent,
                                  ),
                                ),
                              ],
                            ),
                            const SizedBox(height: 14),
                          ],
                        ),
            ),
          ),
        ],
      ),
    );
  }
}

/* ======================= UI Components ======================= */

class _GlassCard extends StatelessWidget {
  final Widget child;
  const _GlassCard({required this.child});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(22),
        color: Colors.white.withOpacity(0.10),
        border: Border.all(color: Colors.white.withOpacity(0.18)),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.30),
            blurRadius: 26,
            offset: const Offset(0, 12),
          ),
        ],
      ),
      child: child,
    );
  }
}

class _GlassMiniInfo extends StatelessWidget {
  final IconData icon;
  final String title;
  final String subtitle;
  final Color badgeColor;

  const _GlassMiniInfo({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.badgeColor,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 72,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(20),
        color: Colors.white.withOpacity(0.10),
        border: Border.all(color: Colors.white.withOpacity(0.14)),
      ),
      child: Row(
        children: [
          Container(
            height: 42,
            width: 42,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(14),
              color: Colors.white.withOpacity(0.10),
              border: Border.all(color: Colors.white.withOpacity(0.16)),
            ),
            child: Icon(icon, color: Colors.white),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    color: Colors.white.withOpacity(0.62),
                    fontWeight: FontWeight.w700,
                    fontSize: 12,
                  ),
                ),
                const SizedBox(height: 2),
                Row(
                  children: [
                    Container(
                      height: 8,
                      width: 8,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: badgeColor,
                      ),
                    ),
                    const SizedBox(width: 6),
                    Expanded(
                      child: Text(
                        subtitle,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          color: Colors.white,
                          fontWeight: FontWeight.w900,
                          fontSize: 13,
                        ),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _ActionCard extends StatelessWidget {
  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onTap;

  const _ActionCard({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white.withOpacity(0.10),
      borderRadius: BorderRadius.circular(20),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(20),
        child: Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: Colors.white.withOpacity(0.14)),
          ),
          child: Row(
            children: [
              Container(
                height: 44,
                width: 44,
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(16),
                  color: Colors.white.withOpacity(0.10),
                  border: Border.all(color: Colors.white.withOpacity(0.16)),
                ),
                child: Icon(icon, color: Colors.white),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.w900,
                        fontSize: 13.5,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      subtitle,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        color: Colors.white.withOpacity(0.65),
                        fontWeight: FontWeight.w600,
                        fontSize: 12,
                      ),
                    ),
                  ],
                ),
              ),
              Icon(Icons.chevron_right, color: Colors.white.withOpacity(0.70)),
            ],
          ),
        ),
      ),
    );
  }
}

class _InfoRow extends StatelessWidget {
  final IconData icon;
  final String label;
  final String value;

  const _InfoRow({
    required this.icon,
    required this.label,
    required this.value,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Icon(icon, color: Colors.white.withOpacity(0.80), size: 18),
        const SizedBox(width: 10),
        Text(
          '$label:',
          style: TextStyle(
            color: Colors.white.withOpacity(0.60),
            fontSize: 12,
            fontWeight: FontWeight.w700,
          ),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: Text(
            value,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            textAlign: TextAlign.right,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 12.5,
              fontWeight: FontWeight.w800,
            ),
          ),
        ),
      ],
    );
  }
}

class _ErrorPanel extends StatelessWidget {
  final String message;
  final VoidCallback onRetry;

  const _ErrorPanel({
    required this.message,
    required this.onRetry,
  });

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(22),
          color: Colors.white.withOpacity(0.10),
          border: Border.all(color: Colors.white.withOpacity(0.18)),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.error_outline, color: Color(0xFFFFC1C1)),
            const SizedBox(height: 10),
            Text(
              message,
              textAlign: TextAlign.center,
              style: TextStyle(
                color: Colors.white.withOpacity(0.92),
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: 14),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton.icon(
                onPressed: onRetry,
                icon: const Icon(Icons.refresh),
                label: const Text('Reintentar'),
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFF4DADFF),
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(vertical: 12),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(16),
                  ),
                  elevation: 0,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}