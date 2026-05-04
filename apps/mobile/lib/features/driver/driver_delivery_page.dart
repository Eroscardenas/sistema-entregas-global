import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'package:mobile/pages/driver_delivery_detail_page.dart';

class DriverDeliveriesPage extends StatefulWidget {
  const DriverDeliveriesPage({super.key});

  @override
  State<DriverDeliveriesPage> createState() => _DriverDeliveriesPageState();
}

class _DriverDeliveriesPageState extends State<DriverDeliveriesPage> {
  static const _navy = Color(0xFF0A1A2F);
  static const _royal = Color(0xFF1E4A7A);
  static const _accent = Color(0xFF4DADFF);
  static const _success = Color(0xFF10B981);
  static const _warning = Color(0xFFF59E0B);

  final _sb = Supabase.instance.client;

  bool _loading = true;
  bool _refreshing = false;
  String? _error;

  late final String _workDate;
  List<_DeliveryCardRow> _rows = [];

  @override
  void initState() {
    super.initState();
    _workDate = _todayYmd();
    _load();
  }

  static String _todayYmd() {
    final now = DateTime.now();
    final y = now.year.toString().padLeft(4, '0');
    final m = now.month.toString().padLeft(2, '0');
    final d = now.day.toString().padLeft(2, '0');
    return '$y-$m-$d';
  }

  String _normalizePhone(String input) {
    return input.replaceAll(RegExp(r'[^0-9]'), '');
  }

  Future<String?> _resolveDriverId() async {
    final user = _sb.auth.currentUser;
    if (user == null) return null;

    final email = (user.email ?? '').trim().toLowerCase();

    if (email.isNotEmpty && email.endsWith('@drivers.local')) {
      final phoneDigits = email.replaceAll('@drivers.local', '').trim();

      final allDrivers = await _sb.from('drivers').select('id, telefono, activo');

      for (final raw in (allDrivers as List)) {
        final telefono = _normalizePhone((raw['telefono'] ?? '').toString());
        final activo = (raw['activo'] ?? true) == true;

        if (activo && telefono == phoneDigits) {
          return (raw['id'] ?? '').toString();
        }
      }
    }

    final profileDriverId = user.userMetadata?['driver_id']?.toString();
    if (profileDriverId != null && profileDriverId.isNotEmpty) {
      return profileDriverId;
    }

    return null;
  }

  Future<void> _load({bool silent = false}) async {
    if (!mounted) return;

    if (!silent) {
      setState(() {
        _loading = true;
        _error = null;
      });
    } else {
      setState(() {
        _refreshing = true;
      });
    }

    try {
      final driverId = await _resolveDriverId();

      if (driverId == null || driverId.isEmpty) {
        throw Exception('No se pudo identificar el chofer actual.');
      }

      final assignments = await _sb
          .from('assignments')
          .select('id, work_date, status')
          .eq('driver_id', driverId)
          .eq('work_date', _workDate);

      final assignmentIds = (assignments as List)
          .map((e) => (e['id'] ?? '').toString())
          .where((e) => e.isNotEmpty)
          .toList();

      if (assignmentIds.isEmpty) {
        if (!mounted) return;
        setState(() {
          _rows = [];
          _loading = false;
          _refreshing = false;
        });
        return;
      }

      final deliveries = await _sb
          .from('deliveries')
          .select(
            'id, folio, status, total_expected, total_real, customer_nombre_snapshot, diner_nombre_snapshot, delivered_at, payment_method, assignment_id',
          )
          .inFilter('assignment_id', assignmentIds)
          .order('folio', ascending: true);

      final mapped = (deliveries as List)
          .map(
            (raw) => _DeliveryCardRow(
              id: (raw['id'] ?? '').toString(),
              folio: (raw['folio'] ?? '—').toString(),
              customerName: (raw['customer_nombre_snapshot'] ?? 'Cliente').toString(),
              dinerName: (raw['diner_nombre_snapshot'] ?? '').toString(),
              status: (raw['status'] ?? 'PENDIENTE').toString(),
              paymentMethod: (raw['payment_method'] ?? '').toString(),
              deliveredAt: raw['delivered_at']?.toString(),
              totalExpected: ((raw['total_expected'] ?? 0) as num).toDouble(),
              totalReal: ((raw['total_real'] ?? 0) as num).toDouble(),
            ),
          )
          .toList();

      if (!mounted) return;

      setState(() {
        _rows = mapped;
        _loading = false;
        _refreshing = false;
      });
    } catch (e) {
      if (!mounted) return;

      setState(() {
        _error = e.toString().replaceFirst('Exception: ', '');
        _loading = false;
        _refreshing = false;
      });
    }
  }

  Future<void> _openDetail(_DeliveryCardRow row) async {
    await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        builder: (_) => DriverDeliveryDetailPage(
          deliveryId: row.id,
          folio: row.folio,
          customerName: row.customerName,
        ),
      ),
    );

    if (!mounted) return;
    await _load(silent: true);
  }

  String _normalizeStatus(String? status) {
    return (status ?? '').trim().toUpperCase();
  }

  bool _isDeliveredStatus(String? status) {
    final s = _normalizeStatus(status);
    return s == 'ENTREGADA' ||
        s == 'CONFIRMADA' ||
        s == 'FINALIZADA' ||
        s == 'COMPLETADA';
  }

  String _statusLabel(String? status) {
    final s = _normalizeStatus(status);
    switch (s) {
      case 'ENTREGADA':
        return 'Entregada';
      case 'CONFIRMADA':
        return 'Confirmada';
      case 'FINALIZADA':
        return 'Finalizada';
      case 'COMPLETADA':
        return 'Completada';
      case 'EN_RUTA':
        return 'En ruta';
      case 'CANCELADA':
        return 'Cancelada';
      default:
        return 'Pendiente';
    }
  }

  Color _statusColor(String status) {
    final s = _normalizeStatus(status);
    switch (s) {
      case 'ENTREGADA':
      case 'CONFIRMADA':
      case 'FINALIZADA':
      case 'COMPLETADA':
        return _success;
      case 'EN_RUTA':
        return _warning;
      case 'CANCELADA':
        return Colors.redAccent;
      default:
        return Colors.white70;
    }
  }

  String _money(double n) => n.toStringAsFixed(2);

  String _formatDateTime(String? iso) {
    if (iso == null || iso.isEmpty) return '—';

    final dt = DateTime.tryParse(iso);
    if (dt == null) return '—';

    final local = dt.toLocal();
    final dd = local.day.toString().padLeft(2, '0');
    final mm = local.month.toString().padLeft(2, '0');
    final yy = local.year.toString();
    final hh = local.hour.toString().padLeft(2, '0');
    final min = local.minute.toString().padLeft(2, '0');

    return '$dd/$mm/$yy $hh:$min';
  }

  @override
  Widget build(BuildContext context) {
    final deliveredCount = _rows.where((e) => _isDeliveredStatus(e.status)).length;
    final pendingCount = _rows.where((e) => !_isDeliveredStatus(e.status)).length;

    return Scaffold(
      backgroundColor: _navy,
      appBar: AppBar(
        backgroundColor: _navy,
        foregroundColor: Colors.white,
        elevation: 0,
        title: const Text('Mis entregas'),
        actions: [
          IconButton(
            onPressed: (_loading || _refreshing) ? null : () => _load(silent: true),
            icon: _refreshing
                ? const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      color: Colors.white,
                    ),
                  )
                : const Icon(Icons.refresh),
          ),
        ],
      ),
      body: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [_navy, _royal],
          ),
        ),
        child: SafeArea(
          child: RefreshIndicator(
            onRefresh: () => _load(silent: true),
            child: CustomScrollView(
              physics: const AlwaysScrollableScrollPhysics(),
              slivers: [
                SliverToBoxAdapter(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(16, 12, 16, 10),
                    child: _GlassCard(
                      child: Column(
                        children: [
                          Row(
                            children: [
                              Expanded(
                                child: _TopStat(
                                  label: 'Fecha',
                                  value: _workDate,
                                ),
                              ),
                              const SizedBox(width: 10),
                              Expanded(
                                child: _TopStat(
                                  label: 'Entregas',
                                  value: '${_rows.length}',
                                ),
                              ),
                              const SizedBox(width: 10),
                              Expanded(
                                child: _TopStat(
                                  label: 'Confirmadas',
                                  value: '$deliveredCount',
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 10),
                          Row(
                            children: [
                              Expanded(
                                child: _TopStat(
                                  label: 'Pendientes',
                                  value: '$pendingCount',
                                ),
                              ),
                              const SizedBox(width: 10),
                              Expanded(
                                flex: 2,
                                child: Container(
                                  padding: const EdgeInsets.all(10),
                                  decoration: BoxDecoration(
                                    borderRadius: BorderRadius.circular(14),
                                    color: Colors.white.withOpacity(0.06),
                                    border: Border.all(
                                      color: Colors.white.withOpacity(0.10),
                                    ),
                                  ),
                                  child: Column(
                                    children: [
                                      Text(
                                        'Control de stock',
                                        style: TextStyle(
                                          color: Colors.white.withOpacity(0.60),
                                          fontSize: 11,
                                        ),
                                      ),
                                      const SizedBox(height: 4),
                                      const Text(
                                        'Validado al capturar',
                                        textAlign: TextAlign.center,
                                        style: TextStyle(
                                          color: Colors.white,
                                          fontWeight: FontWeight.w900,
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 10),
                          Container(
                            width: double.infinity,
                            padding: const EdgeInsets.all(10),
                            decoration: BoxDecoration(
                              borderRadius: BorderRadius.circular(14),
                              color: _accent.withOpacity(0.10),
                              border: Border.all(
                                color: _accent.withOpacity(0.25),
                              ),
                            ),
                            child: Row(
                              children: [
                                const Icon(
                                  Icons.verified_user_outlined,
                                  color: Colors.white,
                                  size: 18,
                                ),
                                const SizedBox(width: 8),
                                Expanded(
                                  child: Text(
                                    'Las cantidades se bloquean en el detalle: no negativos, no letras y no más de lo asignado.',
                                    style: TextStyle(
                                      color: Colors.white.withOpacity(0.82),
                                      fontSize: 12,
                                      fontWeight: FontWeight.w700,
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
                if (_loading)
                  const SliverFillRemaining(
                    hasScrollBody: false,
                    child: Center(
                      child: CircularProgressIndicator(color: _accent),
                    ),
                  )
                else if (_error != null)
                  SliverFillRemaining(
                    hasScrollBody: false,
                    child: Center(
                      child: Padding(
                        padding: const EdgeInsets.all(16),
                        child: _GlassCard(
                          child: Column(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              const Icon(Icons.error_outline, color: Colors.redAccent),
                              const SizedBox(height: 10),
                              Text(
                                _error!,
                                textAlign: TextAlign.center,
                                style: const TextStyle(color: Colors.white),
                              ),
                              const SizedBox(height: 12),
                              ElevatedButton(
                                onPressed: _load,
                                child: const Text('Reintentar'),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                  )
                else if (_rows.isEmpty)
                  const SliverFillRemaining(
                    hasScrollBody: false,
                    child: Center(
                      child: Padding(
                        padding: EdgeInsets.all(24),
                        child: Text(
                          'No hay entregas asignadas para hoy.',
                          style: TextStyle(color: Colors.white70),
                        ),
                      ),
                    ),
                  )
                else
                  SliverPadding(
                    padding: const EdgeInsets.fromLTRB(16, 0, 16, 20),
                    sliver: SliverList.separated(
                      itemCount: _rows.length,
                      separatorBuilder: (_, __) => const SizedBox(height: 10),
                      itemBuilder: (_, i) {
                        final row = _rows[i];
                        final isDelivered = _isDeliveredStatus(row.status);
                        final statusColor = _statusColor(row.status);

                        return InkWell(
                          borderRadius: BorderRadius.circular(20),
                          onTap: () => _openDetail(row),
                          child: _GlassCard(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Row(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Container(
                                      width: 34,
                                      height: 34,
                                      alignment: Alignment.center,
                                      decoration: BoxDecoration(
                                        shape: BoxShape.circle,
                                        color: isDelivered
                                            ? _success.withOpacity(0.18)
                                            : _accent.withOpacity(0.18),
                                        border: Border.all(
                                          color: isDelivered
                                              ? _success.withOpacity(0.35)
                                              : _accent.withOpacity(0.35),
                                        ),
                                      ),
                                      child: Text(
                                        '${i + 1}',
                                        style: const TextStyle(
                                          color: Colors.white,
                                          fontWeight: FontWeight.w900,
                                        ),
                                      ),
                                    ),
                                    const SizedBox(width: 10),
                                    Expanded(
                                      child: Column(
                                        crossAxisAlignment: CrossAxisAlignment.start,
                                        children: [
                                          Text(
                                            row.customerName,
                                            style: const TextStyle(
                                              color: Colors.white,
                                              fontSize: 16,
                                              fontWeight: FontWeight.w900,
                                            ),
                                          ),
                                          const SizedBox(height: 4),
                                          Text(
                                            'Folio: ${row.folio}',
                                            style: TextStyle(
                                              color: Colors.white.withOpacity(0.70),
                                              fontWeight: FontWeight.w700,
                                            ),
                                          ),
                                          if (row.dinerName.isNotEmpty) ...[
                                            const SizedBox(height: 4),
                                            Text(
                                              row.dinerName,
                                              style: TextStyle(
                                                color: Colors.white.withOpacity(0.58),
                                              ),
                                            ),
                                          ],
                                          const SizedBox(height: 6),
                                          Text(
                                            isDelivered
                                                ? 'Hora entrega: ${_formatDateTime(row.deliveredAt)}'
                                                : 'Pendiente de captura',
                                            style: TextStyle(
                                              color: isDelivered
                                                  ? Colors.white.withOpacity(0.62)
                                                  : _warning.withOpacity(0.95),
                                              fontSize: 12,
                                              fontWeight: FontWeight.w800,
                                            ),
                                          ),
                                        ],
                                      ),
                                    ),
                                    Container(
                                      padding: const EdgeInsets.symmetric(
                                        horizontal: 10,
                                        vertical: 6,
                                      ),
                                      decoration: BoxDecoration(
                                        borderRadius: BorderRadius.circular(999),
                                        color: statusColor.withOpacity(0.15),
                                        border: Border.all(
                                          color: statusColor.withOpacity(0.30),
                                        ),
                                      ),
                                      child: Text(
                                        _statusLabel(row.status),
                                        style: TextStyle(
                                          color: statusColor,
                                          fontWeight: FontWeight.w800,
                                          fontSize: 12,
                                        ),
                                      ),
                                    ),
                                  ],
                                ),
                                const SizedBox(height: 12),
                                Wrap(
                                  spacing: 8,
                                  runSpacing: 8,
                                  children: [
                                    _MiniPill(
                                      label: 'Esperado',
                                      value: '\$ ${_money(row.totalExpected)}',
                                    ),
                                    _MiniPill(
                                      label: isDelivered ? 'Real' : 'Preview',
                                      value:
                                          '\$ ${_money(isDelivered ? row.totalReal : row.totalExpected)}',
                                    ),
                                    _MiniPill(
                                      label: 'Pago',
                                      value: row.paymentMethod.trim().isEmpty
                                          ? 'EFECTIVO'
                                          : row.paymentMethod.toUpperCase(),
                                    ),
                                  ],
                                ),
                                const SizedBox(height: 12),
                                SizedBox(
                                  width: double.infinity,
                                  child: ElevatedButton.icon(
                                    onPressed: () => _openDetail(row),
                                    icon: Icon(
                                      isDelivered
                                          ? Icons.receipt_long_outlined
                                          : Icons.local_shipping_outlined,
                                    ),
                                    label: Text(
                                      isDelivered
                                          ? 'Ver comprobante / imprimir'
                                          : 'Capturar entrega',
                                    ),
                                    style: ElevatedButton.styleFrom(
                                      backgroundColor:
                                          isDelivered ? _success : _accent,
                                      foregroundColor: Colors.white,
                                      shape: RoundedRectangleBorder(
                                        borderRadius: BorderRadius.circular(14),
                                      ),
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          ),
                        );
                      },
                    ),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _DeliveryCardRow {
  final String id;
  final String folio;
  final String customerName;
  final String dinerName;
  final String status;
  final String paymentMethod;
  final String? deliveredAt;
  final double totalExpected;
  final double totalReal;

  _DeliveryCardRow({
    required this.id,
    required this.folio,
    required this.customerName,
    required this.dinerName,
    required this.status,
    required this.paymentMethod,
    required this.deliveredAt,
    required this.totalExpected,
    required this.totalReal,
  });
}

class _GlassCard extends StatelessWidget {
  final Widget child;

  const _GlassCard({required this.child});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(20),
        color: Colors.white.withOpacity(0.10),
        border: Border.all(color: Colors.white.withOpacity(0.16)),
      ),
      child: child,
    );
  }
}

class _TopStat extends StatelessWidget {
  final String label;
  final String value;

  const _TopStat({
    required this.label,
    required this.value,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(14),
        color: Colors.white.withOpacity(0.06),
        border: Border.all(color: Colors.white.withOpacity(0.10)),
      ),
      child: Column(
        children: [
          Text(
            label,
            style: TextStyle(
              color: Colors.white.withOpacity(0.60),
              fontSize: 11,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            value,
            textAlign: TextAlign.center,
            style: const TextStyle(
              color: Colors.white,
              fontWeight: FontWeight.w900,
            ),
          ),
        ],
      ),
    );
  }
}

class _MiniPill extends StatelessWidget {
  final String label;
  final String value;

  const _MiniPill({
    required this.label,
    required this.value,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(999),
        color: Colors.white.withOpacity(0.08),
        border: Border.all(color: Colors.white.withOpacity(0.12)),
      ),
      child: Text(
        '$label: $value',
        style: const TextStyle(
          color: Colors.white,
          fontSize: 11.5,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }
}