import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
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

  static const String _adminBaseUrl =
      'https://sistema-entregas-global.vercel.app';

  final _sb = Supabase.instance.client;

  bool _loading = true;
  bool _refreshing = false;
  String? _error;

  String? _workDate;
  String? _assignmentId;
  String? _driverCode;

  List<_StockRow> _rows = [];
  int _deliveriesCount = 0;
  int _deliveredCount = 0;
  int _pendingCount = 0;

  static String _todayYmd() {
    final d = DateTime.now();
    return '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
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

  String _normalize(String value) {
    return value.trim().toUpperCase();
  }

  bool _isDeliveredStatus(String status) {
    final s = _normalize(status);
    return s == 'ENTREGADA' ||
        s == 'CONFIRMADA' ||
        s == 'FINALIZADA' ||
        s == 'COMPLETADA' ||
        s == 'CERRADA' ||
        s == 'LIQUIDADA';
  }

  String _buildProductKey({
    required String nombre,
    required String iceType,
    required double kg,
    required String kind,
  }) {
    final name = _normalize(nombre);
    final type = _normalize(iceType);
    final k = _normalize(kind);

    if (type.contains('BARRA') ||
        name.contains('BARRA') ||
        k.contains('BARRA')) {
      return 'BARRA';
    }

    String finalType = type;

    if (finalType.isEmpty || finalType == 'NORMAL') {
      if (name.contains('GOURMET')) {
        finalType = 'GOURMET';
      } else if (name.contains('FRAP')) {
        finalType = 'FRAP';
      } else if (name.contains('ENFRIAR')) {
        finalType = 'ENFRIAR';
      } else {
        finalType = 'ROLITO';
      }
    }

    if (finalType == 'FRAPPE') finalType = 'FRAP';
    if (finalType == 'NORMAL') finalType = 'ROLITO';

    final kgText = kg > 0
        ? (kg % 1 == 0 ? kg.toInt().toString() : kg.toString())
        : '';

    if (finalType.isNotEmpty && kgText.isNotEmpty) {
      return '${finalType}_$kgText';
    }

    return finalType.isNotEmpty ? finalType : name;
  }

  String _labelFromKey(String key) {
    final clean = key.trim().toUpperCase();
    if (clean == 'BARRA') return 'BARRA';

    final parts = clean.split('_');
    if (parts.length >= 2) {
      return '${parts[0]} ${parts[1]}KG';
    }

    return clean;
  }

  double _kgFromKey(String key) {
    final clean = key.trim().toUpperCase();
    if (clean == 'BARRA') return 0;

    final parts = clean.split('_');
    if (parts.length >= 2) {
      return double.tryParse(parts[1]) ?? 0;
    }

    return 0;
  }

  Future<Map<String, int>> _loadInventoryOutputsFromApi({
    required String workDate,
    required String driverId,
    required String driverName,
    String? driverCode,
  }) async {
    final params = <String, String>{
      'date': workDate,
      'driverCode': (driverCode == null || driverCode.trim().isEmpty)
          ? driverId
          : driverCode.trim(),
      'driverName': driverName,
    };

    final uri = Uri.parse('$_adminBaseUrl/api/inventory/global-outputs')
        .replace(queryParameters: params);

    final response = await http.get(uri);

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw Exception(
        'No se pudieron leer salidas de inventario. Código ${response.statusCode}.',
      );
    }

    final decoded = jsonDecode(response.body);

    if (decoded is! Map || decoded['ok'] != true) {
      throw Exception('La API de salidas no respondió correctamente.');
    }

    final rawQtyByKey = decoded['qtyByKey'];
    if (rawQtyByKey is! Map) return <String, int>{};

    final out = <String, int>{};

    rawQtyByKey.forEach((key, value) {
      final cleanKey = key.toString().trim().toUpperCase();
      final qty = _toInt(value).abs();

      if (cleanKey.isNotEmpty && qty > 0) {
        out[cleanKey] = (out[cleanKey] ?? 0) + qty;
      }
    });

    return out;
  }

  Future<Map<String, dynamic>?> _loadTodayAssignment() async {
    final today = _todayYmd();

    final todayAssignment = await _sb
        .from('assignments')
        .select('id,driver_id,work_date,status')
        .eq('driver_id', widget.driverId)
        .eq('work_date', today)
        .maybeSingle();

    if (todayAssignment == null) return null;

    return Map<String, dynamic>.from(todayAssignment);
  }

  Future<void> _load({bool silent = false}) async {
    if (!mounted) return;

    setState(() {
      if (silent) {
        _refreshing = true;
      } else {
        _loading = true;
      }
      _error = null;
    });

    try {
      final assignment = await _loadTodayAssignment();

      if (assignment == null) {
        if (!mounted) return;

        setState(() {
          _assignmentId = null;
          _workDate = _todayYmd();
          _driverCode = null;
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

      final effectiveWorkDate =
          (assignment['work_date'] ?? _todayYmd()).toString();

      _workDate = effectiveWorkDate;

      String? nextDriverCode;

      try {
        final driverMap = await _sb
            .from('driver_inventory_mapping')
            .select(
              'firebase_employee_code,firebase_employee_id,firebase_employee_name',
            )
            .eq('driver_id', widget.driverId)
            .eq('is_active', true)
            .maybeSingle();

        if (driverMap != null) {
          nextDriverCode =
              (driverMap['firebase_employee_code'] ??
                      driverMap['firebase_employee_id'] ??
                      '')
                  .toString()
                  .trim();
        }
      } catch (_) {
        nextDriverCode = null;
      }

      _driverCode = nextDriverCode;

      final outputsByKey = await _loadInventoryOutputsFromApi(
        workDate: effectiveWorkDate,
        driverId: widget.driverId,
        driverName: widget.driverName,
        driverCode: _driverCode,
      );

      List<Map<String, dynamic>> deliveriesList = [];
      List<String> deliveryIds = [];

      final deliveries = await _sb
          .from('deliveries')
          .select('id,status')
          .eq('assignment_id', _assignmentId!);

      deliveriesList = (deliveries as List)
          .map((e) => Map<String, dynamic>.from(e as Map))
          .toList();

      deliveryIds = deliveriesList
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

      final assignedTodayByKey = <String, int>{};
      final deliveredByKey = <String, int>{};

      if (deliveryIds.isNotEmpty) {
        final items = await _sb
            .from('delivery_items')
            .select(
              'delivery_id,product_id,qty_assigned,qty_real,products(id,nombre,kind,ice_type,kg_por_unidad)',
            )
            .inFilter('delivery_id', deliveryIds);

        for (final raw in items as List) {
          final item = Map<String, dynamic>.from(raw as Map);

          final deliveryId = (item['delivery_id'] ?? '').toString();
          if (deliveryId.isEmpty) continue;

          final productRaw = item['products'];
          if (productRaw is! Map) continue;

          final product = Map<String, dynamic>.from(productRaw);

          final key = _buildProductKey(
            nombre: (product['nombre'] ?? '').toString(),
            iceType: (product['ice_type'] ?? '').toString(),
            kg: _toDouble(product['kg_por_unidad']),
            kind: (product['kind'] ?? '').toString(),
          );

          if (key.isEmpty) continue;

          assignedTodayByKey[key] =
              (assignedTodayByKey[key] ?? 0) + _toInt(item['qty_assigned']);

          if (_isDeliveredStatus(deliveryStatusById[deliveryId] ?? '')) {
            deliveredByKey[key] =
                (deliveredByKey[key] ?? 0) + _toInt(item['qty_real']);
          }
        }
      }

      final allKeys = assignedTodayByKey.keys.toList();

      final mapped = allKeys.map((key) {
        final outputQty = outputsByKey[key] ?? 0;
        final deliveredQty = deliveredByKey[key] ?? 0;
        final assignedQty = assignedTodayByKey[key] ?? 0;

        return _StockRow(
          productKey: key,
          nombre: _labelFromKey(key),
          kind: key == 'BARRA' ? 'BARRA' : 'BOLSA',
          iceType: key == 'BARRA' ? 'BARRA' : key.split('_').first,
          kgPorUnidad: _kgFromKey(key),
          outputQty: outputQty,
          deliveredQty: deliveredQty,
          assignedQty: assignedQty,
        );
      }).toList();

      mapped.sort((a, b) {
        final byAvailable = b.availableQty.compareTo(a.availableQty);
        if (byAvailable != 0) return byAvailable;
        return b.outputQty.compareTo(a.outputQty);
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

  int get _totalOutput => _rows.fold(0, (acc, r) => acc + r.outputQty);
  int get _totalDelivered => _rows.fold(0, (acc, r) => acc + r.deliveredQty);
  int get _totalAvailable => _rows.fold(0, (acc, r) => acc + r.availableQty);

  double get _totalOutputKg => _rows.fold(0, (acc, r) => acc + r.outputKg);
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
    final shownDate = _workDate ?? _todayYmd();

    return Scaffold(
      backgroundColor: _navy,
      appBar: AppBar(
        backgroundColor: _navy,
        foregroundColor: Colors.white,
        elevation: 0,
        title: const Text('Stock / Salidas'),
        actions: [
          IconButton(
            onPressed:
                (_loading || _refreshing) ? null : () => _load(silent: true),
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
                                Icons.local_shipping_outlined,
                                color: Colors.white,
                              ),
                              const SizedBox(width: 10),
                              Expanded(
                                child: Text(
                                  'Salidas de ${widget.driverName}',
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
                            'Fecha de hoy: $shownDate',
                            style: TextStyle(
                              color: Colors.white.withOpacity(0.72),
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                          if (_driverCode != null &&
                              _driverCode!.trim().isNotEmpty) ...[
                            const SizedBox(height: 4),
                            Text(
                              'Código inventario: $_driverCode',
                              style: TextStyle(
                                color: Colors.white.withOpacity(0.58),
                                fontWeight: FontWeight.w600,
                                fontSize: 12,
                              ),
                            ),
                          ],
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
                                  label: 'Salidas',
                                  value: '$_totalOutput pzas',
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
                                  label: 'Kg salida',
                                  value: _totalOutputKg.toStringAsFixed(1),
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
                                    'Disponible = salidas reales de inventario de hoy menos entregas confirmadas de hoy.',
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
                  else if (_rows.isEmpty)
                    const SliverFillRemaining(
                      hasScrollBody: false,
                      child: _EmptyBox(
                        title: 'Sin salidas registradas hoy',
                        subtitle:
                            'No hay asignación, entregas o productos asignados para este chofer el día de hoy.',
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
                            crossAxisAlignment: CrossAxisAlignment.start,
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
                                            fontSize: 15,
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
                              const SizedBox(height: 14),
                              _StockProgressBar(
                                outputQty: r.outputQty,
                                deliveredQty: r.deliveredQty,
                                availableQty: r.availableQty,
                                availableColor: availableColor,
                              ),
                              const SizedBox(height: 12),
                              Row(
                                children: [
                                  Expanded(
                                    child: _MiniMetric(
                                      label: 'Salida',
                                      value: '${r.outputQty} pzas',
                                      subValue:
                                          '${r.outputKg.toStringAsFixed(1)} kg',
                                      color: Colors.white,
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
                              const SizedBox(height: 8),
                              _MiniMetric(
                                label: 'Entregado confirmado',
                                value: '${r.deliveredQty} pzas',
                                subValue:
                                    '${r.deliveredKg.toStringAsFixed(1)} kg',
                                color: _success,
                              ),
                            ],
                          ),
                        );
                      },
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

class _StockRow {
  final String productKey;
  final String nombre;
  final String kind;
  final String iceType;
  final double kgPorUnidad;
  final int outputQty;
  final int deliveredQty;
  final int assignedQty;

  _StockRow({
    required this.productKey,
    required this.nombre,
    required this.kind,
    required this.iceType,
    required this.kgPorUnidad,
    required this.outputQty,
    required this.deliveredQty,
    required this.assignedQty,
  });

  int get availableQty {
    final value = outputQty - deliveredQty;
    return value < 0 ? 0 : value;
  }

  double get outputKg => outputQty * kgPorUnidad;
  double get deliveredKg => deliveredQty * kgPorUnidad;
  double get availableKg => availableQty * kgPorUnidad;
  double get assignedKg => assignedQty * kgPorUnidad;
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

class _StockProgressBar extends StatelessWidget {
  final int outputQty;
  final int deliveredQty;
  final int availableQty;
  final Color availableColor;

  const _StockProgressBar({
    required this.outputQty,
    required this.deliveredQty,
    required this.availableQty,
    required this.availableColor,
  });

  @override
  Widget build(BuildContext context) {
    final safeOutput = outputQty <= 0 ? 1 : outputQty;
    final deliveredRatio = (deliveredQty / safeOutput).clamp(0.0, 1.0);
    final availableRatio = (availableQty / safeOutput).clamp(0.0, 1.0);

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(16),
        color: Colors.white.withOpacity(0.06),
        border: Border.all(color: Colors.white.withOpacity(0.10)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(
                Icons.route_outlined,
                color: Colors.white,
                size: 18,
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  'Flujo de stock',
                  style: TextStyle(
                    color: Colors.white.withOpacity(0.82),
                    fontWeight: FontWeight.w900,
                    fontSize: 12,
                  ),
                ),
              ),
              Text(
                '$availableQty disponibles',
                style: TextStyle(
                  color: availableColor,
                  fontWeight: FontWeight.w900,
                  fontSize: 12,
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          ClipRRect(
            borderRadius: BorderRadius.circular(999),
            child: Container(
              height: 12,
              width: double.infinity,
              color: Colors.white.withOpacity(0.12),
              child: Row(
                children: [
                  if (deliveredRatio > 0)
                    Expanded(
                      flex: (deliveredRatio * 1000).round().clamp(1, 1000).toInt(),
                      child: Container(color: Colors.white.withOpacity(0.35)),
                    ),
                  if (availableRatio > 0)
                    Expanded(
                      flex: (availableRatio * 1000).round().clamp(1, 1000).toInt(),
                      child: Container(color: availableColor.withOpacity(0.95)),
                    ),
                  finalSpacer(deliveredRatio, availableRatio),
                ],
              ),
            ),
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              _LegendDot(
                label: 'Entregado: $deliveredQty',
                color: Colors.white.withOpacity(0.45),
              ),
              const SizedBox(width: 10),
              _LegendDot(
                label: 'Disponible: $availableQty',
                color: availableColor,
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget finalSpacer(double deliveredRatio, double availableRatio) {
    final used = (deliveredRatio + availableRatio).clamp(0.0, 1.0);
    final remaining = 1.0 - used;

    if (remaining <= 0) return const SizedBox.shrink();

    return Expanded(
      flex: (remaining * 1000).round().clamp(1, 1000).toInt(),
      child: const SizedBox.shrink(),
    );
  }
}

class _LegendDot extends StatelessWidget {
  final String label;
  final Color color;

  const _LegendDot({
    required this.label,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 8,
          height: 8,
          decoration: BoxDecoration(
            color: color,
            shape: BoxShape.circle,
          ),
        ),
        const SizedBox(width: 5),
        Text(
          label,
          style: TextStyle(
            color: Colors.white.withOpacity(0.72),
            fontWeight: FontWeight.w700,
            fontSize: 11,
          ),
        ),
      ],
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
      width: double.infinity,
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