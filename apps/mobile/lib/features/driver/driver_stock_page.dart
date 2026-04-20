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
  static const _burgundy = Color(0xFF852838);
  static const _success = Color(0xFF10B981);
  static const _warning = Color(0xFFF59E0B);
  static const _danger = Color(0xFFEF4444);

  final _sb = Supabase.instance.client;

  bool _loading = true;
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
    return s == 'ENTREGADA' || s == 'FINALIZADA' || s == 'COMPLETADA';
  }

  Future<void> _load() async {
    if (!mounted) return;

    setState(() {
      _loading = true;
      _error = null;
    });

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

        acc[productId]!.expectedQty += qtyAssigned;

        if (_isDeliveredStatus(status)) {
          acc[productId]!.realQty += qtyReal;
        }

        if (!_isDeliveredStatus(status)) {
          acc[productId]!.pendingQty += qtyAssigned;
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
              expectedQty: a.expectedQty,
              realQty: a.realQty,
              pendingQty: a.pendingQty,
            ),
          )
          .toList();

      mapped.sort((a, b) => b.expectedQty.compareTo(a.expectedQty));

      if (!mounted) return;
      setState(() {
        _rows = mapped;
        _deliveriesCount = deliveryIds.length;
        _deliveredCount = deliveredCount;
        _pendingCount = deliveryIds.length - deliveredCount;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString().replaceFirst('Exception: ', '');
        _loading = false;
      });
    }
  }

  int get _totalExpected => _rows.fold(0, (acc, r) => acc + r.expectedQty);
  int get _totalReal => _rows.fold(0, (acc, r) => acc + r.realQty);
  int get _totalPending => _rows.fold(0, (acc, r) => acc + r.pendingQty);
  int get _totalDiff => _totalReal - _totalExpected;

  double get _totalExpectedKg =>
      _rows.fold(0, (acc, r) => acc + (r.expectedQty * r.kgPorUnidad));

  double get _totalRealKg =>
      _rows.fold(0, (acc, r) => acc + (r.realQty * r.kgPorUnidad));

  double get _totalPendingKg =>
      _rows.fold(0, (acc, r) => acc + (r.pendingQty * r.kgPorUnidad));

  @override
  void initState() {
    super.initState();
    _load();
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
            onPressed: _loading ? null : _load,
            icon: const Icon(Icons.refresh),
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
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              children: [
                _GlassCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          const Icon(Icons.inventory_2_outlined, color: Colors.white),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Text(
                              'Carga del chofer ${widget.driverName}',
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
                            ),
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: _StatChip(
                              label: 'Pendientes',
                              value: '$_pendingCount',
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 10),
                      Row(
                        children: [
                          Expanded(
                            child: _StatChip(
                              label: 'Productos',
                              value: '${_rows.length}',
                            ),
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: _StatChip(
                              label: 'Esperado',
                              value: '$_totalExpected pzas',
                            ),
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: _StatChip(
                              label: 'Real',
                              value: '$_totalReal pzas',
                              valueColor: _success,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 10),
                      Row(
                        children: [
                          Expanded(
                            child: _StatChip(
                              label: 'Pendiente',
                              value: '$_totalPending pzas',
                              valueColor: _warning,
                            ),
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: _StatChip(
                              label: 'Kg esp.',
                              value: _totalExpectedKg.toStringAsFixed(1),
                            ),
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: _StatChip(
                              label: 'Kg real',
                              value: _totalRealKg.toStringAsFixed(1),
                              valueColor: _success,
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 14),
                Expanded(
                  child: _loading
                      ? const Center(
                          child: CircularProgressIndicator(color: _accent),
                        )
                      : _error != null
                          ? _ErrorBox(message: _error!, onRetry: _load)
                          : _assignmentId == null
                              ? const _EmptyBox(
                                  title: 'Sin asignación',
                                  subtitle: 'No hay asignación para este chofer en la fecha actual.',
                                )
                              : _rows.isEmpty
                                  ? const _EmptyBox(
                                      title: 'Sin productos consolidados',
                                      subtitle:
                                          'La asignación existe, pero no se encontraron productos en las entregas.',
                                    )
                                  : ListView.separated(
                                      itemCount: _rows.length,
                                      separatorBuilder: (_, __) =>
                                          const SizedBox(height: 10),
                                      itemBuilder: (_, i) {
                                        final r = _rows[i];

                                        return _GlassCard(
                                          child: Column(
                                            children: [
                                              Row(
                                                children: [
                                                  Container(
                                                    height: 46,
                                                    width: 46,
                                                    decoration: BoxDecoration(
                                                      borderRadius:
                                                          BorderRadius.circular(14),
                                                      color: Colors.white.withOpacity(0.10),
                                                    ),
                                                    child: const Icon(
                                                      Icons.ice_skating,
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
                                                            fontWeight: FontWeight.w800,
                                                          ),
                                                        ),
                                                        const SizedBox(height: 4),
                                                        Text(
                                                          '${r.kind.toUpperCase()} • ${r.iceType} • ${r.kgPorUnidad}kg',
                                                          style: TextStyle(
                                                            color: Colors.white
                                                                .withOpacity(0.60),
                                                            fontSize: 12,
                                                            fontWeight: FontWeight.w600,
                                                          ),
                                                        ),
                                                      ],
                                                    ),
                                                  ),
                                                ],
                                              ),
                                              const SizedBox(height: 12),
                                              Row(
                                                children: [
                                                  Expanded(
                                                    child: _MiniMetric(
                                                      label: 'Debe cargar',
                                                      value: '${r.expectedQty} pzas',
                                                      subValue:
                                                          '${r.expectedKg.toStringAsFixed(1)} kg',
                                                      color: Colors.white,
                                                    ),
                                                  ),
                                                  const SizedBox(width: 8),
                                                  Expanded(
                                                    child: _MiniMetric(
                                                      label: 'Ya entregó',
                                                      value: '${r.realQty} pzas',
                                                      subValue:
                                                          '${r.realKg.toStringAsFixed(1)} kg',
                                                      color: _success,
                                                    ),
                                                  ),
                                                  const SizedBox(width: 8),
                                                  Expanded(
                                                    child: _MiniMetric(
                                                      label: 'Le falta',
                                                      value: '${r.pendingQty} pzas',
                                                      subValue:
                                                          '${r.pendingKg.toStringAsFixed(1)} kg',
                                                      color: _warning,
                                                    ),
                                                  ),
                                                ],
                                              ),
                                            ],
                                          ),
                                        );
                                      },
                                    ),
                ),
                if (!_loading && _rows.isNotEmpty) ...[
                  const SizedBox(height: 12),
                  _GlassCard(
                    child: Row(
                      children: [
                        const Icon(Icons.info_outline, color: Colors.white70),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Text(
                            'Debe cargar = suma de qty_assigned. Ya entregó = suma de qty_real en entregas confirmadas. Le falta = lo pendiente por entregar.',
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
                ],
              ],
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

  int expectedQty;
  int realQty;
  int pendingQty;

  _StockAccumulator({
    required this.productId,
    required this.nombre,
    required this.kind,
    required this.iceType,
    required this.kgPorUnidad,
    this.expectedQty = 0,
    this.realQty = 0,
    this.pendingQty = 0,
  });
}

class _StockRow {
  final String productId;
  final String nombre;
  final String kind;
  final String iceType;
  final double kgPorUnidad;
  final int expectedQty;
  final int realQty;
  final int pendingQty;

  _StockRow({
    required this.productId,
    required this.nombre,
    required this.kind,
    required this.iceType,
    required this.kgPorUnidad,
    required this.expectedQty,
    required this.realQty,
    required this.pendingQty,
  });

  double get expectedKg => expectedQty * kgPorUnidad;
  double get realKg => realQty * kgPorUnidad;
  double get pendingKg => pendingQty * kgPorUnidad;
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
            const Icon(Icons.inventory_2_outlined, color: Colors.white70, size: 36),
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