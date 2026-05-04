import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class DriverStockPage extends StatefulWidget {
  final String driverId;
  final String profileId;
  final String driverName;

  const DriverStockPage({
    super.key,
    required this.driverId,
    required this.profileId,
    required this.driverName,
  });

  @override
  State<DriverStockPage> createState() => _DriverStockPageState();
}

class _DriverStockPageState extends State<DriverStockPage> {
  static const _navy = Color(0xFF0A1A2F);
  static const _royal = Color(0xFF1E4A7A);
  static const _accent = Color(0xFF4DADFF);
  static const _success = Color(0xFF10B981);
  static const _warning = Color(0xFFF59E0B);
  static const _danger = Color(0xFFEF4444);

  final _sb = Supabase.instance.client;

  bool _loading = true;
  bool _refreshing = false;
  String? _error;

  String _workDate = _todayYmd();
  String? _assignmentId;

  List<_StockRow> _rows = [];
  int _deliveriesCount = 0;
  int _deliveredCount = 0;
  int _pendingCount = 0;

  static String _todayYmd() {
    final d = DateTime.now();
    final y = d.year.toString().padLeft(4, '0');
    final m = d.month.toString().padLeft(2, '0');
    final day = d.day.toString().padLeft(2, '0');
    return '$y-$m-$day';
  }

  static int _toInt(dynamic value) {
    if (value == null) return 0;
    if (value is int) return value;
    if (value is double) return value.round();
    if (value is num) return value.toInt();
    return int.tryParse(value.toString()) ?? 0;
  }

  static double _toDouble(dynamic value) {
    if (value == null) return 0;
    if (value is double) return value;
    if (value is int) return value.toDouble();
    if (value is num) return value.toDouble();
    return double.tryParse(value.toString()) ?? 0;
  }

  bool _isDeliveredStatus(String status) {
    final s = status.trim().toUpperCase();
    return s == 'ENTREGADA' ||
        s == 'CONFIRMADA' ||
        s == 'FINALIZADA' ||
        s == 'COMPLETADA';
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
      final assignment = await _sb
          .from('assignments')
          .select('id,driver_id,work_date,status')
          .eq('driver_id', widget.driverId)
          .eq('work_date', _workDate)
          .maybeSingle();

      if (assignment == null) {
        if (!mounted) return;
        setState(() {
          _assignmentId = null;
          _rows = [];
          _deliveriesCount = 0;
          _deliveredCount = 0;
          _pendingCount = 0;
          _loading = false;
          _refreshing = false;
        });
        return;
      }

      _assignmentId = (assignment['id'] ?? '').toString();

      if (_assignmentId == null || _assignmentId!.isEmpty) {
        if (!mounted) return;
        setState(() {
          _rows = [];
          _deliveriesCount = 0;
          _deliveredCount = 0;
          _pendingCount = 0;
          _loading = false;
          _refreshing = false;
        });
        return;
      }

      final deliveries = await _sb
          .from('deliveries')
          .select('id,status')
          .eq('assignment_id', _assignmentId!);

      final deliveriesList = (deliveries as List)
          .map((e) => Map<String, dynamic>.from(e as Map))
          .toList();

      final deliveryIds = deliveriesList
          .map((e) => (e['id'] ?? '').toString())
          .where((e) => e.isNotEmpty)
          .toList();

      final deliveryStatusById = <String, String>{};
      int deliveredCount = 0;

      for (final d in deliveriesList) {
        final id = (d['id'] ?? '').toString();
        final status = (d['status'] ?? 'PENDIENTE').toString();
        if (id.isEmpty) continue;

        deliveryStatusById[id] = status;

        if (_isDeliveredStatus(status)) {
          deliveredCount++;
        }
      }

      if (deliveryIds.isEmpty) {
        if (!mounted) return;
        setState(() {
          _rows = [];
          _deliveriesCount = 0;
          _deliveredCount = 0;
          _pendingCount = 0;
          _loading = false;
          _refreshing = false;
        });
        return;
      }

      final items = await _sb
          .from('delivery_items')
          .select('delivery_id,product_id,qty_assigned,qty_real')
          .inFilter('delivery_id', deliveryIds);

      final itemsList = (items as List)
          .map((e) => Map<String, dynamic>.from(e as Map))
          .toList();

      final productIds = itemsList
          .map((e) => (e['product_id'] ?? '').toString())
          .where((e) => e.isNotEmpty)
          .toSet()
          .toList();

      final productsById = <String, Map<String, dynamic>>{};

      if (productIds.isNotEmpty) {
        final products = await _sb
            .from('products')
            .select('id,nombre,kind,ice_type,kg_por_unidad')
            .inFilter('id', productIds);

        for (final raw in (products as List)) {
          final p = Map<String, dynamic>.from(raw as Map);
          final id = (p['id'] ?? '').toString();
          if (id.isNotEmpty) {
            productsById[id] = p;
          }
        }
      }

      final acc = <String, _StockAccumulator>{};

      for (final row in itemsList) {
        final productId = (row['product_id'] ?? '').toString();
        final deliveryId = (row['delivery_id'] ?? '').toString();

        if (productId.isEmpty || deliveryId.isEmpty) continue;

        final product = productsById[productId] ?? <String, dynamic>{};
        final status = deliveryStatusById[deliveryId] ?? 'PENDIENTE';

        final qtyAssigned = _toInt(row['qty_assigned']);
        final qtyReal = _toInt(row['qty_real']);

        acc.putIfAbsent(
          productId,
          () => _StockAccumulator(
            productId: productId,
            nombre: (product['nombre'] ?? 'Producto').toString(),
            kind: (product['kind'] ?? '').toString(),
            iceType: (product['ice_type'] ?? '').toString(),
            kgPorUnidad: _toDouble(product['kg_por_unidad']),
          ),
        );

        acc[productId]!.assignedQty += qtyAssigned;

        if (_isDeliveredStatus(status)) {
          acc[productId]!.deliveredQty += qtyReal;
        }
      }

      final mapped = acc.values
          .map(
            (a) => _StockRow(
              productId: a.productId,
              nombre: a.nombre,
              kind: a.kind,
              iceType: a.iceType,
              kgPorUnidad: a.kgPorUnidad,
              assignedQty: a.assignedQty,
              deliveredQty: a.deliveredQty,
            ),
          )
          .toList();

      mapped.sort((a, b) {
        final byAvailable = b.availableQty.compareTo(a.availableQty);
        if (byAvailable != 0) return byAvailable;
        return b.assignedQty.compareTo(a.assignedQty);
      });

      if (!mounted) return;

      setState(() {
        _rows = mapped;
        _deliveriesCount = deliveryIds.length;
        _deliveredCount = deliveredCount;
        _pendingCount = deliveryIds.length - deliveredCount;
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

  int get _totalAssigned => _rows.fold(0, (acc, r) => acc + r.assignedQty);
  int get _totalDelivered => _rows.fold(0, (acc, r) => acc + r.deliveredQty);
  int get _totalAvailable => _rows.fold(0, (acc, r) => acc + r.availableQty);

  double get _totalAssignedKg =>
      _rows.fold(0, (acc, r) => acc + r.assignedKg);

  double get _totalDeliveredKg =>
      _rows.fold(0, (acc, r) => acc + r.deliveredKg);

  double get _totalAvailableKg =>
      _rows.fold(0, (acc, r) => acc + r.availableKg);

  @override
  void initState() {
    super.initState();
    _load();
  }

  Color _availableColor(int available) {
    if (available <= 0) return _danger;
    if (available <= 5) return _warning;
    return _success;
  }

  String _stockStatusLabel(int available) {
    if (available <= 0) return 'Sin stock';
    if (available <= 5) return 'Bajo';
    return 'Disponible';
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: _navy,
      appBar: AppBar(
        backgroundColor: _navy,
        foregroundColor: Colors.white,
        elevation: 0,
        title: const Text('Stock / Carga'),
        actions: [
          IconButton(
            onPressed: (_loading || _refreshing)
                ? null
                : () => _load(silent: true),
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
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: CustomScrollView(
                physics: const AlwaysScrollableScrollPhysics(),
                slivers: [
                  SliverToBoxAdapter(
                    child: _GlassCard(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              const Icon(
                                Icons.inventory_2_outlined,
                                color: Colors.white,
                              ),
                              const SizedBox(width: 10),
                              Expanded(
                                child: Text(
                                  'Carga de ${widget.driverName}',
                                  style: const TextStyle(
                                    color: Colors.white,
                                    fontWeight: FontWeight.w900,
                                    fontSize: 16,
                                  ),
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 8),
                          Text(
                            'Fecha: $_workDate',
                            style: TextStyle(
                              color: Colors.white.withOpacity(0.72),
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                          const SizedBox(height: 12),
                          Row(
                            children: [
                              Expanded(
                                child: _StatChip(
                                  label: 'Entregas',
                                  value: '$_deliveriesCount',
                                ),
                              ),
                              const SizedBox(width: 10),
                              Expanded(
                                child: _StatChip(
                                  label: 'Confirmadas',
                                  value: '$_deliveredCount',
                                  valueColor: _success,
                                ),
                              ),
                              const SizedBox(width: 10),
                              Expanded(
                                child: _StatChip(
                                  label: 'Pendientes',
                                  value: '$_pendingCount',
                                  valueColor: _warning,
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 10),
                          Row(
                            children: [
                              Expanded(
                                child: _StatChip(
                                  label: 'Asignado',
                                  value: '$_totalAssigned pzas',
                                ),
                              ),
                              const SizedBox(width: 10),
                              Expanded(
                                child: _StatChip(
                                  label: 'Entregado',
                                  value: '$_totalDelivered pzas',
                                  valueColor: _success,
                                ),
                              ),
                              const SizedBox(width: 10),
                              Expanded(
                                child: _StatChip(
                                  label: 'Disponible',
                                  value: '$_totalAvailable pzas',
                                  valueColor: _availableColor(_totalAvailable),
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 10),
                          Row(
                            children: [
                              Expanded(
                                child: _StatChip(
                                  label: 'Kg asign.',
                                  value: _totalAssignedKg.toStringAsFixed(1),
                                ),
                              ),
                              const SizedBox(width: 10),
                              Expanded(
                                child: _StatChip(
                                  label: 'Kg entreg.',
                                  value: _totalDeliveredKg.toStringAsFixed(1),
                                  valueColor: _success,
                                ),
                              ),
                              const SizedBox(width: 10),
                              Expanded(
                                child: _StatChip(
                                  label: 'Kg disp.',
                                  value: _totalAvailableKg.toStringAsFixed(1),
                                  valueColor: _availableColor(_totalAvailable),
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
                                    'Disponible = carga asignada menos entregas confirmadas. Si llega a 0, la captura queda bloqueada por producto.',
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
                  const SliverToBoxAdapter(child: SizedBox(height: 14)),
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
                      child: _ErrorBox(message: _error!, onRetry: _load),
                    )
                  else if (_assignmentId == null)
                    const SliverFillRemaining(
                      hasScrollBody: false,
                      child: _EmptyBox(
                        title: 'Sin asignación',
                        subtitle:
                            'No hay asignación para este chofer en la fecha actual.',
                      ),
                    )
                  else if (_rows.isEmpty)
                    const SliverFillRemaining(
                      hasScrollBody: false,
                      child: _EmptyBox(
                        title: 'Sin productos consolidados',
                        subtitle:
                            'La asignación existe, pero no se encontraron productos en las entregas.',
                      ),
                    )
                  else
                    SliverList.separated(
                      itemCount: _rows.length,
                      separatorBuilder: (_, __) => const SizedBox(height: 10),
                      itemBuilder: (_, i) {
                        final r = _rows[i];
                        final availableColor = _availableColor(r.availableQty);
                        final statusLabel = _stockStatusLabel(r.availableQty);

                        return _GlassCard(
                          child: Column(
                            children: [
                              Row(
                                children: [
                                  Container(
                                    height: 46,
                                    width: 46,
                                    decoration: BoxDecoration(
                                      borderRadius: BorderRadius.circular(14),
                                      color: availableColor.withOpacity(0.16),
                                      border: Border.all(
                                        color: availableColor.withOpacity(0.30),
                                      ),
                                    ),
                                    child: Icon(
                                      r.availableQty <= 0
                                          ? Icons.block
                                          : Icons.ac_unit,
                                      color: Colors.white,
                                    ),
                                  ),
                                  const SizedBox(width: 12),
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment:
                                          CrossAxisAlignment.start,
                                      children: [
                                        Text(
                                          r.nombre,
                                          style: const TextStyle(
                                            color: Colors.white,
                                            fontWeight: FontWeight.w900,
                                          ),
                                        ),
                                        const SizedBox(height: 4),
                                        Text(
                                          '${r.kind.toUpperCase()} • ${r.iceType} • ${r.kgPorUnidad}kg',
                                          style: TextStyle(
                                            color:
                                                Colors.white.withOpacity(0.60),
                                            fontSize: 12,
                                            fontWeight: FontWeight.w600,
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
                                      color: availableColor.withOpacity(0.14),
                                      border: Border.all(
                                        color: availableColor.withOpacity(0.35),
                                      ),
                                    ),
                                    child: Text(
                                      statusLabel,
                                      style: TextStyle(
                                        color: availableColor,
                                        fontWeight: FontWeight.w900,
                                        fontSize: 12,
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 12),
                              Row(
                                children: [
                                  Expanded(
                                    child: _MiniMetric(
                                      label: 'Asignado',
                                      value: '${r.assignedQty} pzas',
                                      subValue:
                                          '${r.assignedKg.toStringAsFixed(1)} kg',
                                      color: Colors.white,
                                    ),
                                  ),
                                  const SizedBox(width: 8),
                                  Expanded(
                                    child: _MiniMetric(
                                      label: 'Entregado',
                                      value: '${r.deliveredQty} pzas',
                                      subValue:
                                          '${r.deliveredKg.toStringAsFixed(1)} kg',
                                      color: _success,
                                    ),
                                  ),
                                  const SizedBox(width: 8),
                                  Expanded(
                                    child: _MiniMetric(
                                      label: 'Disponible',
                                      value: '${r.availableQty} pzas',
                                      subValue:
                                          '${r.availableKg.toStringAsFixed(1)} kg',
                                      color: availableColor,
                                    ),
                                  ),
                                ],
                              ),
                              if (r.availableQty <= 0) ...[
                                const SizedBox(height: 10),
                                Container(
                                  width: double.infinity,
                                  padding: const EdgeInsets.all(10),
                                  decoration: BoxDecoration(
                                    borderRadius: BorderRadius.circular(14),
                                    color: _danger.withOpacity(0.10),
                                    border: Border.all(
                                      color: _danger.withOpacity(0.25),
                                    ),
                                  ),
                                  child: const Text(
                                    'Sin stock disponible para este producto. No debe permitir más entregas.',
                                    style: TextStyle(
                                      color: Colors.white,
                                      fontWeight: FontWeight.w800,
                                      fontSize: 12,
                                    ),
                                  ),
                                ),
                              ],
                            ],
                          ),
                        );
                      },
                    ),
                  if (!_loading && _rows.isNotEmpty)
                    SliverToBoxAdapter(
                      child: Padding(
                        padding: const EdgeInsets.only(top: 12, bottom: 4),
                        child: _GlassCard(
                          child: Row(
                            children: [
                              const Icon(Icons.info_outline,
                                  color: Colors.white70),
                              const SizedBox(width: 10),
                              Expanded(
                                child: Text(
                                  'Este resumen se calcula con delivery_items: asignado contra qty_real de entregas confirmadas.',
                                  style: TextStyle(
                                    color: Colors.white.withOpacity(0.80),
                                    fontSize: 12,
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _StockAccumulator {
  final String productId;
  final String nombre;
  final String kind;
  final String iceType;
  final double kgPorUnidad;

  int assignedQty;
  int deliveredQty;

  _StockAccumulator({
    required this.productId,
    required this.nombre,
    required this.kind,
    required this.iceType,
    required this.kgPorUnidad,
    this.assignedQty = 0,
    this.deliveredQty = 0,
  });
}

class _StockRow {
  final String productId;
  final String nombre;
  final String kind;
  final String iceType;
  final double kgPorUnidad;
  final int assignedQty;
  final int deliveredQty;

  _StockRow({
    required this.productId,
    required this.nombre,
    required this.kind,
    required this.iceType,
    required this.kgPorUnidad,
    required this.assignedQty,
    required this.deliveredQty,
  });

  int get availableQty {
    final value = assignedQty - deliveredQty;
    return value < 0 ? 0 : value;
  }

  double get assignedKg => assignedQty * kgPorUnidad;
  double get deliveredKg => deliveredQty * kgPorUnidad;
  double get availableKg => availableQty * kgPorUnidad;
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

class _StatChip extends StatelessWidget {
  final String label;
  final String value;
  final Color? valueColor;

  const _StatChip({
    required this.label,
    required this.value,
    this.valueColor,
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
            style: TextStyle(
              color: valueColor ?? Colors.white,
              fontWeight: FontWeight.w900,
            ),
          ),
        ],
      ),
    );
  }
}

class _MiniMetric extends StatelessWidget {
  final String label;
  final String value;
  final String subValue;
  final Color color;

  const _MiniMetric({
    required this.label,
    required this.value,
    required this.subValue,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(14),
        color: Colors.white.withOpacity(0.06),
        border: Border.all(color: Colors.white.withOpacity(0.08)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
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
            style: TextStyle(
              color: color,
              fontWeight: FontWeight.w900,
              fontSize: 14,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            subValue,
            style: TextStyle(
              color: Colors.white.withOpacity(0.70),
              fontSize: 11,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }
}

class _EmptyBox extends StatelessWidget {
  final String title;
  final String subtitle;

  const _EmptyBox({
    required this.title,
    required this.subtitle,
  });

  @override
  Widget build(BuildContext context) {
    return Center(
      child: _GlassCard(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(
              Icons.inventory_2_outlined,
              color: Colors.white70,
              size: 36,
            ),
            const SizedBox(height: 10),
            Text(
              title,
              style: const TextStyle(
                color: Colors.white,
                fontWeight: FontWeight.w900,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              subtitle,
              textAlign: TextAlign.center,
              style: TextStyle(color: Colors.white.withOpacity(0.70)),
            ),
          ],
        ),
      ),
    );
  }
}

class _ErrorBox extends StatelessWidget {
  final String message;
  final VoidCallback onRetry;

  const _ErrorBox({
    required this.message,
    required this.onRetry,
  });

  @override
  Widget build(BuildContext context) {
    return Center(
      child: _GlassCard(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.error_outline, color: Colors.redAccent),
            const SizedBox(height: 10),
            Text(
              message,
              style: const TextStyle(color: Colors.white),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 12),
            ElevatedButton(
              onPressed: onRetry,
              child: const Text('Reintentar'),
            ),
          ],
        ),
      ),
    );
  }
}