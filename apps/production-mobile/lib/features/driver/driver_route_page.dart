import 'dart:async';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:printing/printing.dart';
import 'package:timezone/timezone.dart' as tz;

import 'package:mobile/features/driver/driver_delivery_detail_page.dart';
import 'package:mobile/features/driver/driver_sale_page.dart';

class DriverRoutePage extends StatefulWidget {
  final String driverId;
  final String profileId;
  final String driverName;
  final String phone;

  const DriverRoutePage({
    super.key,
    required this.driverId,
    required this.profileId,
    required this.driverName,
    required this.phone,
  });

  @override
  State<DriverRoutePage> createState() => _DriverRoutePageState();
}

class _DriverRoutePageState extends State<DriverRoutePage> {
  static const _navy = Color(0xFF0A1A2F);
  static const _royal = Color(0xFF1E4A7A);
  static const _accent = Color(0xFF4DADFF);
  static const _burgundy = Color(0xFF852838);
  static const _green = Color(0xFF10B981);

  final _sb = Supabase.instance.client;

  bool _loading = true;
  bool _busy = false;
  bool _syncingLoad = false;
  bool _kmDialogOpen = false;
  String? _error;

  late final String _workDate;

  _AssignmentToday? _assignment;
  List<_DeliveryRow> _deliveries = [];

  Timer? _poller;

  static tz.Location get _mxLocation => tz.getLocation('America/Mexico_City');

  static String _todayMxYmd() {
    final d = tz.TZDateTime.now(_mxLocation);
    final y = d.year.toString().padLeft(4, '0');
    final m = d.month.toString().padLeft(2, '0');
    final day = d.day.toString().padLeft(2, '0');
    return '$y-$m-$day';
  }

  tz.TZDateTime _nowMx() => tz.TZDateTime.now(_mxLocation);

  void _restartPoller() {
    _poller?.cancel();
    _poller = Timer.periodic(const Duration(seconds: 8), (_) {
      if (mounted && !_busy && !_syncingLoad && !_kmDialogOpen) {
        _load();
      }
    });
  }

  String _fmtDateTimeMx(String? iso) {
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

  String _fmtNowMx(tz.TZDateTime d) {
    final dd = d.day.toString().padLeft(2, '0');
    final mm = d.month.toString().padLeft(2, '0');
    final yy = d.year.toString();
    final hh = d.hour.toString().padLeft(2, '0');
    final min = d.minute.toString().padLeft(2, '0');

    return '$dd/$mm/$yy $hh:$min';
  }

  String _normalizeStatus(String? s) => (s ?? '').trim().toUpperCase();

  bool _isDeliveredStatus(String? s) {
    final status = _normalizeStatus(s);
    return status == 'ENTREGADA' ||
        status == 'CONFIRMADA' ||
        status == 'FINALIZADA' ||
        status == 'COMPLETADA' ||
        status == 'DELIVERED';
  }

  bool _isCancelledStatus(String? s) {
    return _normalizeStatus(s) == 'CANCELADA';
  }

  bool _affectsProgress(_DeliveryRow d) {
    if (d.deliveryType == 'driver_sale') return false;
    return d.affectsProgress;
  }

  bool get _routeStarted {
    if (_assignment == null) return false;
    final s = _normalizeStatus(_assignment!.routeStatus);
    return s == 'EN_RUTA' || s == 'FINALIZADA';
  }

  bool get _routeFinished {
    if (_assignment == null) return false;
    return _normalizeStatus(_assignment!.routeStatus) == 'FINALIZADA';
  }

  int get _deliveredCountReal {
    return _deliveries
        .where((e) => _affectsProgress(e) && _isDeliveredStatus(e.status))
        .length;
  }

  int get _activeCountReal {
    return _deliveries
        .where((e) => _affectsProgress(e) && !_isCancelledStatus(e.status))
        .length;
  }

  int get _pendingActiveCountReal {
    return _deliveries.where((e) {
      if (!_affectsProgress(e)) return false;
      final cancelled = _isCancelledStatus(e.status);
      final delivered = _isDeliveredStatus(e.status);
      return !cancelled && !delivered;
    }).length;
  }

  double get _progressReal {
    if (_activeCountReal == 0) return 0;
    return _deliveredCountReal / _activeCountReal;
  }

  int get _progressPercent {
    if (_activeCountReal == 0) return 0;
    return (_progressReal * 100).round();
  }

  bool get _canStartRoute {
    if (_assignment == null) return false;
    if (_busy) return false;
    if (_routeStarted) return false;
    return true;
  }

  bool get _canFinishRoute {
    if (_assignment == null) return false;
    if (_busy) return false;
    if (!_routeStarted) return false;
    if (_routeFinished) return false;
    if (_progressPercent < 100) return false;
    return true;
  }

  double? _toDoubleOrNull(dynamic value) {
    if (value == null) return null;
    if (value is num) return value.toDouble();
    return double.tryParse(value.toString().trim());
  }

  String _fmtKm(double? value) {
    if (value == null) return '—';
    if (value == value.roundToDouble()) return value.toInt().toString();
    return value.toStringAsFixed(1);
  }

  Future<void> _reopenRouteIfNeeded({
    required Map<String, dynamic>? route,
    required List<_DeliveryRow> mappedDeliveries,
  }) async {
    if (route == null) return;

    final routeId = (route['id'] ?? '').toString();
    if (routeId.isEmpty) return;

    final routeStatus = _normalizeStatus(route['status']?.toString());
    if (routeStatus != 'FINALIZADA') return;

    final hasActivePending = mappedDeliveries.any((d) {
      if (!_affectsProgress(d)) return false;
      return !_isCancelledStatus(d.status) && !_isDeliveredStatus(d.status);
    });

    if (!hasActivePending) return;

    await _sb.from('routes').update({
      'status': 'EN_RUTA',
      'ended_at': null,
      'km_end': null,
    }).eq('id', routeId);
  }

  Future<void> _load() async {
    if (_syncingLoad) return;
    _syncingLoad = true;

    try {
      final assignment = await _sb
          .from('assignments')
          .select('id, driver_id, work_date, status')
          .eq('driver_id', widget.driverId)
          .eq('work_date', _workDate)
          .maybeSingle();

      if (assignment == null) {
        if (!mounted) return;
        setState(() {
          _assignment = null;
          _deliveries = [];
          _loading = false;
          _error = null;
        });
        return;
      }

      final assignmentId = (assignment['id'] ?? '').toString();

      Map<String, dynamic>? route = await _sb
          .from('routes')
          .select(
            'id, assignment_id, started_at, ended_at, status, km_start, km_end',
          )
          .eq('assignment_id', assignmentId)
          .maybeSingle();

      final deliveries = await _sb
          .from('deliveries')
          .select(
            'id, folio, customer_nombre_snapshot, diner_nombre_snapshot, status, delivered_at, total_expected, total_real, priority, payment_method, delivery_type, affects_progress, affects_stock, created_by_driver',
          )
          .eq('assignment_id', assignmentId)
          .order('created_by_driver', ascending: true)
          .order('priority', ascending: true)
          .order('folio', ascending: true);

      final mappedDeliveries = (deliveries as List)
          .map(
            (d) => _DeliveryRow(
              id: (d['id'] ?? '').toString(),
              folio: (d['folio'] ?? '').toString(),
              customerName:
                  (d['customer_nombre_snapshot'] ?? 'Cliente').toString(),
              dinerName: (d['diner_nombre_snapshot'] ?? '').toString(),
              status: (d['status'] ?? 'PENDIENTE').toString(),
              deliveredAt: d['delivered_at']?.toString(),
              totalExpected: ((d['total_expected'] ?? 0) as num).toDouble(),
              totalReal: ((d['total_real'] ?? 0) as num).toDouble(),
              priority: d['priority'] == null
                  ? null
                  : ((d['priority'] ?? 0) as num).toInt(),
              paymentMethod: (d['payment_method'] ?? '').toString(),
              deliveryType:
                  (d['delivery_type'] ?? 'assigned_delivery').toString(),
              affectsProgress: d['affects_progress'] != false,
              affectsStock: d['affects_stock'] != false,
              createdByDriver: d['created_by_driver'] == true,
            ),
          )
          .toList();

      await _reopenRouteIfNeeded(
        route: route,
        mappedDeliveries: mappedDeliveries,
      );

      route = await _sb
          .from('routes')
          .select(
            'id, assignment_id, started_at, ended_at, status, km_start, km_end',
          )
          .eq('assignment_id', assignmentId)
          .maybeSingle();

      final progressDeliveries =
          mappedDeliveries.where((e) => _affectsProgress(e)).toList();

      final deliveredCount =
          progressDeliveries.where((e) => _isDeliveredStatus(e.status)).length;

      final activeCount =
          progressDeliveries.where((e) => !_isCancelledStatus(e.status)).length;

      final progress = activeCount == 0 ? 0.0 : deliveredCount / activeCount;

      final totalExpected = mappedDeliveries
          .where((e) => !_isCancelledStatus(e.status))
          .fold<double>(0, (acc, e) => acc + e.totalExpected);

      final totalReal = mappedDeliveries
          .where((e) => !_isCancelledStatus(e.status))
          .fold<double>(
            0,
            (acc, e) =>
                acc +
                (_isDeliveredStatus(e.status) ? e.totalReal : e.totalExpected),
          );

      final effectiveAssignmentStatus = route == null
          ? (assignment['status'] ?? 'ACTIVA').toString()
          : ((_normalizeStatus(route['status']?.toString()) == 'FINALIZADA')
              ? 'FINALIZADA'
              : (_normalizeStatus(route['status']?.toString()) == 'EN_RUTA')
                  ? 'EN_RUTA'
                  : (assignment['status'] ?? 'ACTIVA').toString());

      if (!mounted) return;

      setState(() {
        _assignment = _AssignmentToday(
          id: assignmentId,
          status: effectiveAssignmentStatus,
          routeId: route == null ? null : (route['id'] ?? '').toString(),
          routeStatus: route == null
              ? 'NO_INICIADA'
              : (route['status'] ?? 'NO_INICIADA').toString(),
          startedAt: route == null ? null : route['started_at']?.toString(),
          endedAt: route == null ? null : route['ended_at']?.toString(),
          kmStart: route == null ? null : _toDoubleOrNull(route['km_start']),
          kmEnd: route == null ? null : _toDoubleOrNull(route['km_end']),
          totalExpected: totalExpected,
          totalReal: totalReal,
          progress: progress,
          totalDeliveries: progressDeliveries.length,
          deliveredCount: deliveredCount,
          activeCount: activeCount,
        );
        _deliveries = mappedDeliveries;
        _loading = false;
        _error = null;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString().replaceFirst('Exception: ', '');
        _loading = false;
      });
    } finally {
      _syncingLoad = false;
    }
  }

  Future<void> _reloadHard() async {
    if (_syncingLoad) return;

    if (mounted) {
      setState(() {
        _loading = true;
        _error = null;
      });
    }

    await _load();
  }

  Future<void> _openDriverSale() async {
    if (_assignment == null || _busy) return;

    final result = await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        builder: (_) => DriverSalePage(
          driverId: widget.driverId,
          driverName: widget.driverName,
          assignmentId: _assignment!.id,
          routeId: _assignment!.routeId,
        ),
      ),
    );

    if (!mounted) return;

    if (result == true) {
      await _load();
    }
  }

  Future<double?> _askForKm({
    required String title,
    required String subtitle,
    double? initialValue,
    double? minValue,
  }) async {
    if (!mounted) return null;

    _kmDialogOpen = true;

    final result = await showDialog<double>(
      context: context,
      barrierDismissible: false,
      useRootNavigator: true,
      builder: (_) => _KmCaptureDialog(
        title: title,
        subtitle: subtitle,
        initialValue: initialValue,
        minValue: minValue,
        accentColor: _accent,
        formatKm: _fmtKm,
      ),
    );

    _kmDialogOpen = false;
    return result;
  }

  Future<void> _startRoute() async {
    if (_assignment == null || _busy) return;

    _poller?.cancel();

    final kmStart = await _askForKm(
      title: 'Iniciar ruta',
      subtitle: 'Captura el kilometraje inicial del vehículo.',
      initialValue: _assignment?.kmStart,
    );

    if (kmStart == null) {
      _restartPoller();
      return;
    }

    if (!mounted) {
      _restartPoller();
      return;
    }

    setState(() => _busy = true);

    try {
      final nowMx = _nowMx();
      final assignmentId = _assignment!.id;

      final existingRoute = await _sb
          .from('routes')
          .select(
            'id, assignment_id, status, started_at, ended_at, km_start, km_end',
          )
          .eq('assignment_id', assignmentId)
          .maybeSingle();

      if (existingRoute == null) {
        await _sb.from('routes').insert({
          'assignment_id': assignmentId,
          'status': 'EN_RUTA',
          'started_at': nowMx.toIso8601String(),
          'ended_at': null,
          'km_start': kmStart,
          'km_end': null,
        });
      } else {
        final routeId = (existingRoute['id'] ?? '').toString();
        final existingStartedAt = existingRoute['started_at']?.toString();
        final existingKmStart = _toDoubleOrNull(existingRoute['km_start']);

        if (routeId.isEmpty) {
          throw Exception('La ruta existente no tiene id válido.');
        }

        await _sb.from('routes').update({
          'status': 'EN_RUTA',
          'started_at': existingStartedAt ?? nowMx.toIso8601String(),
          'ended_at': null,
          'km_start': existingKmStart ?? kmStart,
          'km_end': null,
        }).eq('id', routeId);
      }

      await _load();

      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            'Ruta iniciada: ${_fmtNowMx(nowMx)} Guadalajara, Jalisco • KM ${_fmtKm(kmStart)}',
          ),
        ),
      );
    } on PostgrestException catch (e) {
      if (e.code == '23505') {
        try {
          final assignmentId = _assignment!.id;

          final existingRoute = await _sb
              .from('routes')
              .select('id, started_at, km_start')
              .eq('assignment_id', assignmentId)
              .maybeSingle();

          if (existingRoute != null) {
            final routeId = (existingRoute['id'] ?? '').toString();
            final existingStartedAt = existingRoute['started_at']?.toString();
            final existingKmStart = _toDoubleOrNull(existingRoute['km_start']);
            final nowMx = _nowMx();

            await _sb.from('routes').update({
              'status': 'EN_RUTA',
              'started_at': existingStartedAt ?? nowMx.toIso8601String(),
              'ended_at': null,
              'km_start': existingKmStart ?? kmStart,
              'km_end': null,
            }).eq('id', routeId);

            await _load();

            if (!mounted) return;
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(
                content: Text('La ruta ya existía y se reutilizó correctamente.'),
              ),
            );
            return;
          }
        } catch (_) {}
      }

      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.message)),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.toString().replaceFirst('Exception: ', ''))),
      );
    } finally {
      if (mounted) setState(() => _busy = false);
      _restartPoller();
    }
  }

  Future<void> _finishRoute() async {
    if (!_canFinishRoute ||
        _assignment == null ||
        _assignment!.routeId == null ||
        _busy) {
      return;
    }

    _poller?.cancel();

    final kmEnd = await _askForKm(
      title: 'Finalizar ruta',
      subtitle: 'Captura el kilometraje final del vehículo.',
      initialValue: _assignment?.kmEnd,
      minValue: _assignment?.kmStart,
    );

    if (kmEnd == null) {
      _restartPoller();
      return;
    }

    if (!mounted) {
      _restartPoller();
      return;
    }

    setState(() => _busy = true);

    try {
      final nowMx = _nowMx();

      await _sb.from('routes').update({
        'status': 'FINALIZADA',
        'ended_at': nowMx.toIso8601String(),
        'km_end': kmEnd,
      }).eq('id', _assignment!.routeId!);

      await _load();

      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            'Ruta finalizada: ${_fmtNowMx(nowMx)} Guadalajara, Jalisco • KM ${_fmtKm(kmEnd)}',
          ),
        ),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.toString().replaceFirst('Exception: ', ''))),
      );
    } finally {
      if (mounted) setState(() => _busy = false);
      _restartPoller();
    }
  }

  Future<void> _openDelivery(_DeliveryRow d) async {
    await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        builder: (_) => DriverDeliveryDetailPage(
          deliveryId: d.id,
          folio: d.folio,
          customerName: d.customerName,
        ),
      ),
    );

    if (!mounted) return;
    await _load();
  }

  Future<List<_DeliveryPdfItem>> _loadDeliveryItemsForPdf(
    String deliveryId,
  ) async {
    final rows = await _sb
        .from('delivery_items')
        .select('product_id, qty_assigned, qty_real, precio_aplicado')
        .eq('delivery_id', deliveryId);

    final list = rows as List;

    if (list.isEmpty) return [];

    final productIds = list
        .map((e) => (e['product_id'] ?? '').toString())
        .where((e) => e.isNotEmpty)
        .toSet()
        .toList();

    final Map<String, dynamic> productsById = {};

    if (productIds.isNotEmpty) {
      final products = await _sb
          .from('products')
          .select('id, nombre, kind, ice_type, kg_por_unidad')
          .inFilter('id', productIds);

      for (final p in products as List) {
        productsById[(p['id'] ?? '').toString()] = p;
      }
    }

    return list.map<_DeliveryPdfItem>((raw) {
      final pid = (raw['product_id'] ?? '').toString();
      final p = productsById[pid] ?? {};
      final qtyAssigned = ((raw['qty_assigned'] ?? 0) as num).toInt();
      final qtyRealRaw = raw['qty_real'];
      final qtyReal =
          qtyRealRaw == null ? qtyAssigned : (qtyRealRaw as num).toInt();
      final precio = ((raw['precio_aplicado'] ?? 0) as num).toDouble();

      return _DeliveryPdfItem(
        productName: (p['nombre'] ?? 'Producto').toString(),
        kind: (p['kind'] ?? '').toString(),
        iceType: (p['ice_type'] ?? '').toString(),
        kgPerUnit: ((p['kg_por_unidad'] ?? 0) as num).toDouble(),
        qtyAssigned: qtyAssigned,
        qtyReal: qtyReal,
        price: precio,
      );
    }).toList();
  }

  Future<Uint8List> _buildDeliveryPdf(_DeliveryRow delivery) async {
    final doc = pw.Document();
    final items = await _loadDeliveryItemsForPdf(delivery.id);

    final totalQtyReal = items.fold<int>(0, (acc, e) => acc + e.qtyReal);
    final totalQtyAssigned =
        items.fold<int>(0, (acc, e) => acc + e.qtyAssigned);

    doc.addPage(
      pw.MultiPage(
        pageTheme: const pw.PageTheme(
          margin: pw.EdgeInsets.all(28),
        ),
        build: (context) => [
          pw.Container(
            padding: const pw.EdgeInsets.all(16),
            decoration: pw.BoxDecoration(
              color: PdfColor.fromHex('#0A1A2F'),
              borderRadius: pw.BorderRadius.circular(12),
            ),
            child: pw.Row(
              crossAxisAlignment: pw.CrossAxisAlignment.center,
              children: [
                pw.Container(
                  width: 52,
                  height: 52,
                  decoration: pw.BoxDecoration(
                    color: PdfColor.fromHex('#1E4A7A'),
                    borderRadius: pw.BorderRadius.circular(10),
                  ),
                  alignment: pw.Alignment.center,
                  child: pw.Text(
                    'GI',
                    style: pw.TextStyle(
                      color: PdfColors.white,
                      fontWeight: pw.FontWeight.bold,
                      fontSize: 20,
                    ),
                  ),
                ),
                pw.SizedBox(width: 14),
                pw.Expanded(
                  child: pw.Column(
                    crossAxisAlignment: pw.CrossAxisAlignment.start,
                    children: [
                      pw.Text(
                        'GLOBAL ICE DE MÉXICO',
                        style: pw.TextStyle(
                          color: PdfColors.white,
                          fontWeight: pw.FontWeight.bold,
                          fontSize: 18,
                        ),
                      ),
                      pw.SizedBox(height: 4),
                      pw.Text(
                        delivery.isDriverSale
                            ? 'Comprobante de venta en ruta'
                            : 'Comprobante de entrega',
                        style: const pw.TextStyle(
                          color: PdfColors.white,
                          fontSize: 10,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          pw.SizedBox(height: 18),
          pw.Container(
            padding: const pw.EdgeInsets.all(14),
            decoration: pw.BoxDecoration(
              border: pw.Border.all(color: PdfColor.fromHex('#D7DFEA')),
              borderRadius: pw.BorderRadius.circular(10),
            ),
            child: pw.Column(
              children: [
                _pdfInfoRow(
                  'Tipo',
                  delivery.isDriverSale ? 'VENTA EN RUTA' : 'ENTREGA',
                ),
                _pdfInfoRow('Folio', delivery.folio.isEmpty ? '—' : delivery.folio),
                _pdfInfoRow('Chofer', widget.driverName),
                _pdfInfoRow('Cliente', delivery.customerName),
                _pdfInfoRow(
                  'Comedor',
                  delivery.dinerName.isEmpty ? 'Sin comedor' : delivery.dinerName,
                ),
                _pdfInfoRow('Estado', delivery.status),
                _pdfInfoRow(
                  'Fecha/Hora confirmación',
                  _fmtDateTimeMx(delivery.deliveredAt),
                ),
                _pdfInfoRow(
                  'Pago',
                  delivery.paymentMethod.trim().isEmpty
                      ? '—'
                      : delivery.paymentMethod.toUpperCase(),
                ),
              ],
            ),
          ),
          pw.SizedBox(height: 18),
          pw.Text(
            delivery.isDriverSale
                ? 'Detalle de productos vendidos'
                : 'Detalle de productos entregados',
            style: pw.TextStyle(
              fontSize: 13,
              fontWeight: pw.FontWeight.bold,
              color: PdfColor.fromHex('#0A1A2F'),
            ),
          ),
          pw.SizedBox(height: 10),
          pw.Table(
            border: pw.TableBorder.all(color: PdfColor.fromHex('#D7DFEA')),
            columnWidths: {
              0: const pw.FlexColumnWidth(3.5),
              1: const pw.FlexColumnWidth(1.2),
              2: const pw.FlexColumnWidth(1.2),
              3: const pw.FlexColumnWidth(1.5),
              4: const pw.FlexColumnWidth(1.6),
            },
            children: [
              pw.TableRow(
                decoration: pw.BoxDecoration(
                  color: PdfColor.fromHex('#EAF2FB'),
                ),
                children: [
                  _pdfCell('Producto', bold: true),
                  _pdfCell('Asig.', bold: true),
                  _pdfCell('Real', bold: true),
                  _pdfCell('Precio', bold: true),
                  _pdfCell('Subtotal', bold: true),
                ],
              ),
              ...items.map(
                (it) => pw.TableRow(
                  children: [
                    _pdfCell(
                      '${it.productName}\n${it.kind.toUpperCase()} • ${it.iceType} • ${it.kgPerUnit}kg',
                    ),
                    _pdfCell('${it.qtyAssigned}'),
                    _pdfCell('${it.qtyReal}'),
                    _pdfCell(_money(it.price)),
                    _pdfCell(_money(it.qtyReal * it.price)),
                  ],
                ),
              ),
            ],
          ),
          pw.SizedBox(height: 18),
          pw.Row(
            children: [
              pw.Expanded(
                child: _pdfSummaryBox(
                  title: 'Total piezas asignadas',
                  value: '$totalQtyAssigned',
                ),
              ),
              pw.SizedBox(width: 10),
              pw.Expanded(
                child: _pdfSummaryBox(
                  title: 'Total piezas reales',
                  value: '$totalQtyReal',
                ),
              ),
              pw.SizedBox(width: 10),
              pw.Expanded(
                child: _pdfSummaryBox(
                  title: 'Total real',
                  value: _money(delivery.totalReal),
                ),
              ),
            ],
          ),
          pw.SizedBox(height: 22),
          pw.Container(
            width: double.infinity,
            padding: const pw.EdgeInsets.all(12),
            decoration: pw.BoxDecoration(
              color: PdfColor.fromHex('#F6F8FB'),
              borderRadius: pw.BorderRadius.circular(8),
            ),
            child: pw.Text(
              delivery.isDriverSale
                  ? 'Documento generado desde la app móvil de chofer. Esta venta consume stock del chofer, pero no afecta el progreso de entregas.'
                  : 'Documento generado desde la app móvil de chofer. El total real refleja las cantidades efectivamente entregadas y confirmadas.',
              style: const pw.TextStyle(
                fontSize: 9,
                color: PdfColors.grey800,
              ),
            ),
          ),
        ],
      ),
    );

    return doc.save();
  }

  Future<void> _openDeliveryPdf(_DeliveryRow delivery) async {
    try {
      if (mounted) setState(() => _busy = true);

      final pdfBytes = await _buildDeliveryPdf(delivery);

      await Printing.layoutPdf(
        onLayout: (_) async => pdfBytes,
        name: delivery.isDriverSale
            ? 'venta_ruta_${delivery.id}.pdf'
            : 'entrega_${delivery.folio}.pdf',
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            'No se pudo generar PDF: ${e.toString().replaceFirst('Exception: ', '')}',
          ),
        ),
      );
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  String _statusLabel(String s) {
    switch (_normalizeStatus(s)) {
      case 'ENTREGADA':
      case 'CONFIRMADA':
      case 'FINALIZADA':
      case 'COMPLETADA':
      case 'DELIVERED':
        return 'Entregada';
      case 'PENDIENTE':
        return 'Pendiente';
      case 'CANCELADA':
        return 'Cancelada';
      case 'EN_RUTA':
        return 'En ruta';
      default:
        return s;
    }
  }

  Color _statusColor(String s) {
    switch (_normalizeStatus(s)) {
      case 'ENTREGADA':
      case 'CONFIRMADA':
      case 'FINALIZADA':
      case 'COMPLETADA':
      case 'DELIVERED':
        return _green;
      case 'PENDIENTE':
        return const Color(0xFFF59E0B);
      case 'CANCELADA':
        return const Color(0xFFEF4444);
      default:
        return _accent;
    }
  }

  String _priorityLabel(int? p) {
    if (p == null) return 'Sin prioridad';
    if (p <= 10) return 'Urgente';
    if (p <= 30) return 'Alta';
    if (p <= 60) return 'Media';
    return 'Baja';
  }

  String _money(double n) => n.toStringAsFixed(2);

  @override
  void initState() {
    super.initState();
    _workDate = _todayMxYmd();
    _reloadHard();
    _restartPoller();
  }

  @override
  void dispose() {
    _poller?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final nowMx = _nowMx();

    return Scaffold(
      backgroundColor: _navy,
      appBar: AppBar(
        backgroundColor: _navy,
        foregroundColor: Colors.white,
        elevation: 0,
        title: const Text('Ruta / Entregas'),
        actions: [
          IconButton(
            onPressed: (_loading || _busy) ? null : _reloadHard,
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
          child: RefreshIndicator(
            onRefresh: _reloadHard,
            child: _loading
                ? const Center(child: CircularProgressIndicator(color: _accent))
                : _error != null
                    ? ListView(
                        physics: const AlwaysScrollableScrollPhysics(),
                        padding: const EdgeInsets.all(16),
                        children: [
                          _ErrorBox(message: _error!, onRetry: _reloadHard),
                        ],
                      )
                    : _assignment == null
                        ? const _EmptyBoxScrollable(
                            title: 'Sin asignación hoy',
                            subtitle: 'Todavía no tienes asignación para hoy.',
                          )
                        : CustomScrollView(
                            physics: const AlwaysScrollableScrollPhysics(),
                            slivers: [
                              SliverToBoxAdapter(
                                child: Padding(
                                  padding:
                                      const EdgeInsets.fromLTRB(16, 16, 16, 14),
                                  child: _GlassCard(
                                    child: Column(
                                      crossAxisAlignment:
                                          CrossAxisAlignment.start,
                                      children: [
                                        Row(
                                          children: [
                                            const Icon(Icons.route,
                                                color: Colors.white),
                                            const SizedBox(width: 10),
                                            Expanded(
                                              child: Text(
                                                widget.driverName,
                                                style: const TextStyle(
                                                  color: Colors.white,
                                                  fontWeight: FontWeight.w900,
                                                  fontSize: 16,
                                                ),
                                              ),
                                            ),
                                            _Badge(text: _assignment!.routeStatus),
                                          ],
                                        ),
                                        const SizedBox(height: 8),
                                        Text(
                                          'Fecha operativa: $_workDate',
                                          style: TextStyle(
                                            color:
                                                Colors.white.withOpacity(0.75),
                                            fontWeight: FontWeight.w700,
                                          ),
                                        ),
                                        const SizedBox(height: 4),
                                        Text(
                                          'Hora Guadalajara: ${_fmtNowMx(nowMx)}',
                                          style: TextStyle(
                                            color:
                                                Colors.white.withOpacity(0.62),
                                            fontWeight: FontWeight.w600,
                                            fontSize: 12.5,
                                          ),
                                        ),
                                        const SizedBox(height: 12),
                                        Row(
                                          children: [
                                            Expanded(
                                              child: _StatChip(
                                                label: 'Entregas',
                                                value:
                                                    '${_assignment!.totalDeliveries}',
                                              ),
                                            ),
                                            const SizedBox(width: 10),
                                            Expanded(
                                              child: _StatChip(
                                                label: 'Entregadas',
                                                value:
                                                    '${_assignment!.deliveredCount}',
                                              ),
                                            ),
                                            const SizedBox(width: 10),
                                            Expanded(
                                              child: _StatChip(
                                                label: 'Activas',
                                                value:
                                                    '${_assignment!.activeCount}',
                                              ),
                                            ),
                                          ],
                                        ),
                                        const SizedBox(height: 12),
                                        Text(
                                          'Progreso $_progressPercent%',
                                          style: TextStyle(
                                            color:
                                                Colors.white.withOpacity(0.85),
                                            fontWeight: FontWeight.w800,
                                          ),
                                        ),
                                        const SizedBox(height: 6),
                                        ClipRRect(
                                          borderRadius:
                                              BorderRadius.circular(999),
                                          child: LinearProgressIndicator(
                                            value: _progressReal,
                                            minHeight: 10,
                                            backgroundColor:
                                                Colors.white.withOpacity(0.10),
                                            valueColor:
                                                const AlwaysStoppedAnimation<
                                                    Color>(_accent),
                                          ),
                                        ),
                                        const SizedBox(height: 12),
                                        Row(
                                          children: [
                                            Expanded(
                                              child: _StatChip(
                                                label: 'Esperado',
                                                value: _money(
                                                  _assignment!.totalExpected,
                                                ),
                                              ),
                                            ),
                                            const SizedBox(width: 10),
                                            Expanded(
                                              child: _StatChip(
                                                label: 'Real',
                                                value: _money(
                                                  _assignment!.totalReal,
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
                                              icon:
                                                  Icons.play_circle_outline,
                                              text:
                                                  'Inicio ${_fmtDateTimeMx(_assignment!.startedAt)}',
                                            ),
                                            _MiniPill(
                                              icon: Icons.flag_outlined,
                                              text:
                                                  'Final ${_fmtDateTimeMx(_assignment!.endedAt)}',
                                            ),
                                            _MiniPill(
                                              icon: Icons.speed_outlined,
                                              text:
                                                  'KM inicio ${_fmtKm(_assignment!.kmStart)}',
                                            ),
                                            _MiniPill(
                                              icon: Icons.pin_outlined,
                                              text:
                                                  'KM final ${_fmtKm(_assignment!.kmEnd)}',
                                            ),
                                            const _MiniPill(
                                              icon:
                                                  Icons.event_note_outlined,
                                              text:
                                                  'Fecha controlada por sistema',
                                            ),
                                          ],
                                        ),
                                        const SizedBox(height: 12),
                                        Row(
                                          children: [
                                            Expanded(
                                              child: ElevatedButton.icon(
                                                onPressed: _canStartRoute
                                                    ? _startRoute
                                                    : null,
                                                icon:
                                                    const Icon(Icons.play_arrow),
                                                label: Text(
                                                  _routeStarted
                                                      ? 'Ruta iniciada'
                                                      : 'Iniciar ruta',
                                                ),
                                                style:
                                                    ElevatedButton.styleFrom(
                                                  backgroundColor: _accent,
                                                  foregroundColor:
                                                      Colors.white,
                                                  disabledBackgroundColor:
                                                      Colors.white.withOpacity(
                                                          0.10),
                                                  disabledForegroundColor:
                                                      Colors.white.withOpacity(
                                                          0.40),
                                                  padding: const EdgeInsets
                                                      .symmetric(vertical: 14),
                                                  shape:
                                                      RoundedRectangleBorder(
                                                    borderRadius:
                                                        BorderRadius.circular(
                                                            16),
                                                  ),
                                                ),
                                              ),
                                            ),
                                            const SizedBox(width: 10),
                                            Expanded(
                                              child: ElevatedButton.icon(
                                                onPressed: _canFinishRoute
                                                    ? _finishRoute
                                                    : null,
                                                icon: const Icon(Icons.flag),
                                                label: Text(
                                                  _routeFinished
                                                      ? 'Ruta finalizada'
                                                      : 'Finalizar ruta',
                                                ),
                                                style:
                                                    ElevatedButton.styleFrom(
                                                  backgroundColor: _burgundy,
                                                  foregroundColor:
                                                      Colors.white,
                                                  disabledBackgroundColor:
                                                      Colors.white.withOpacity(
                                                          0.10),
                                                  disabledForegroundColor:
                                                      Colors.white.withOpacity(
                                                          0.40),
                                                  padding: const EdgeInsets
                                                      .symmetric(vertical: 14),
                                                  shape:
                                                      RoundedRectangleBorder(
                                                    borderRadius:
                                                        BorderRadius.circular(
                                                            16),
                                                  ),
                                                ),
                                              ),
                                            ),
                                          ],
                                        ),
                                        const SizedBox(height: 10),
                                        SizedBox(
                                          width: double.infinity,
                                          child: ElevatedButton.icon(
                                            onPressed:
                                                (_busy || _assignment == null)
                                                    ? null
                                                    : _openDriverSale,
                                            icon:
                                                const Icon(Icons.point_of_sale),
                                            label: const Text('Hacer venta'),
                                            style: ElevatedButton.styleFrom(
                                              backgroundColor: _green,
                                              foregroundColor: Colors.white,
                                              disabledBackgroundColor:
                                                  Colors.white.withOpacity(0.10),
                                              disabledForegroundColor:
                                                  Colors.white.withOpacity(0.40),
                                              padding:
                                                  const EdgeInsets.symmetric(
                                                vertical: 14,
                                              ),
                                              shape: RoundedRectangleBorder(
                                                borderRadius:
                                                    BorderRadius.circular(16),
                                              ),
                                            ),
                                          ),
                                        ),
                                        const SizedBox(height: 10),
                                        if (_routeFinished &&
                                            _pendingActiveCountReal > 0)
                                          Container(
                                            width: double.infinity,
                                            padding: const EdgeInsets.all(12),
                                            decoration: BoxDecoration(
                                              borderRadius:
                                                  BorderRadius.circular(14),
                                              color:
                                                  Colors.orange.withOpacity(0.12),
                                              border: Border.all(
                                                color: Colors.orange
                                                    .withOpacity(0.22),
                                              ),
                                            ),
                                            child: Text(
                                              'Se detectaron nuevas entregas activas después de cerrar la ruta. La app reabrirá la ruta automáticamente.',
                                              style: TextStyle(
                                                color: Colors.white
                                                    .withOpacity(0.88),
                                                fontWeight: FontWeight.w700,
                                                fontSize: 12.5,
                                              ),
                                            ),
                                          )
                                        else if (!_canFinishRoute &&
                                            !_routeFinished)
                                          Container(
                                            width: double.infinity,
                                            padding: const EdgeInsets.all(12),
                                            decoration: BoxDecoration(
                                              borderRadius:
                                                  BorderRadius.circular(14),
                                              color: Colors.white
                                                  .withOpacity(0.06),
                                              border: Border.all(
                                                color: Colors.white
                                                    .withOpacity(0.10),
                                              ),
                                            ),
                                            child: Text(
                                              _routeStarted
                                                  ? 'Para finalizar, necesitas completar el 100% de las entregas activas. Las ventas en ruta no afectan este progreso.'
                                                  : 'Primero inicia la ruta para poder finalizarla después.',
                                              style: TextStyle(
                                                color: Colors.white
                                                    .withOpacity(0.75),
                                                fontWeight: FontWeight.w700,
                                                fontSize: 12.5,
                                              ),
                                            ),
                                          ),
                                      ],
                                    ),
                                  ),
                                ),
                              ),
                              if (_deliveries.isEmpty)
                                const SliverFillRemaining(
                                  hasScrollBody: false,
                                  child: _EmptyBox(
                                    title: 'Sin entregas',
                                    subtitle:
                                        'La asignación existe, pero aún no tiene entregas.',
                                  ),
                                )
                              else
                                SliverPadding(
                                  padding:
                                      const EdgeInsets.fromLTRB(16, 0, 16, 20),
                                  sliver: SliverList.separated(
                                    itemCount: _deliveries.length,
                                    separatorBuilder: (_, __) =>
                                        const SizedBox(height: 10),
                                    itemBuilder: (_, i) {
                                      final d = _deliveries[i];
                                      final statusColor = d.isDriverSale
                                          ? _green
                                          : _statusColor(d.status);
                                      final delivered =
                                          _isDeliveredStatus(d.status);
                                      final cancelled =
                                          _isCancelledStatus(d.status);

                                      return Material(
                                        color: Colors.transparent,
                                        child: InkWell(
                                          borderRadius:
                                              BorderRadius.circular(20),
                                          onTap: cancelled
                                              ? null
                                              : () => _openDelivery(d),
                                          child: _GlassCard(
                                            child: Column(
                                              crossAxisAlignment:
                                                  CrossAxisAlignment.start,
                                              children: [
                                                Row(
                                                  children: [
                                                    Expanded(
                                                      child: Text(
                                                        d.isDriverSale
                                                            ? '${i + 1}. [VENTA EN RUTA] ${d.customerName}'
                                                            : '${i + 1}. ${d.customerName}',
                                                        style:
                                                            const TextStyle(
                                                          color: Colors.white,
                                                          fontWeight:
                                                              FontWeight.w900,
                                                        ),
                                                      ),
                                                    ),
                                                    _Badge(
                                                      text: d.isDriverSale
                                                          ? 'Venta en ruta'
                                                          : _statusLabel(
                                                              d.status,
                                                            ),
                                                      color: statusColor,
                                                    ),
                                                  ],
                                                ),
                                                const SizedBox(height: 4),
                                                Text(
                                                  d.dinerName.isEmpty
                                                      ? 'Sin comedor'
                                                      : d.dinerName,
                                                  style: TextStyle(
                                                    color: Colors.white
                                                        .withOpacity(0.65),
                                                    fontSize: 12,
                                                  ),
                                                ),
                                                const SizedBox(height: 8),
                                                Wrap(
                                                  spacing: 8,
                                                  runSpacing: 8,
                                                  children: [
                                                    _MiniPill(
                                                      icon: d.isDriverSale
                                                          ? Icons.point_of_sale
                                                          : Icons
                                                              .confirmation_number_outlined,
                                                      text: d.isDriverSale
                                                          ? 'Venta extra'
                                                          : d.folio,
                                                    ),
                                                    if (!d.isDriverSale)
                                                      _MiniPill(
                                                        icon: Icons.flag_outlined,
                                                        text: d.priority == null
                                                            ? 'Sin prioridad'
                                                            : 'Prio ${d.priority} • ${_priorityLabel(d.priority)}',
                                                      ),
                                                    _MiniPill(
                                                      icon:
                                                          Icons.attach_money,
                                                      text:
                                                          'Esperado ${_money(d.totalExpected)}',
                                                    ),
                                                    _MiniPill(
                                                      icon: Icons
                                                          .payments_outlined,
                                                      text:
                                                          'Real ${_money(delivered ? d.totalReal : d.totalExpected)}',
                                                    ),
                                                    _MiniPill(
                                                      icon: Icons
                                                          .credit_card_outlined,
                                                      text: d.paymentMethod
                                                              .trim()
                                                              .isEmpty
                                                          ? 'EFECTIVO'
                                                          : d.paymentMethod
                                                              .toUpperCase(),
                                                    ),
                                                    if (d.isDriverSale)
                                                      const _MiniPill(
                                                        icon: Icons
                                                            .trending_down,
                                                        text:
                                                            'Consume stock',
                                                      ),
                                                    if (d.isDriverSale)
                                                      const _MiniPill(
                                                        icon: Icons
                                                            .speed_outlined,
                                                        text:
                                                            'No afecta progreso',
                                                      ),
                                                  ],
                                                ),
                                                const SizedBox(height: 8),
                                                Text(
                                                  d.isDriverSale
                                                      ? 'Hora venta: ${_fmtDateTimeMx(d.deliveredAt)}'
                                                      : 'Hora entrega: ${_fmtDateTimeMx(d.deliveredAt)}',
                                                  style: TextStyle(
                                                    color: Colors.white
                                                        .withOpacity(0.60),
                                                    fontSize: 12,
                                                    fontWeight:
                                                        FontWeight.w700,
                                                  ),
                                                ),
                                                if (d.deliveredAt != null ||
                                                    d.isDriverSale) ...[
                                                  const SizedBox(height: 10),
                                                  Row(
                                                    children: [
                                                      Icon(
                                                        Icons.touch_app_outlined,
                                                        color: Colors.white70,
                                                        size: 16,
                                                      ),
                                                      const SizedBox(width: 6),
                                                      Text(
                                                        d.isDriverSale
                                                            ? 'Toca la tarjeta para ver/imprimir ticket'
                                                            : 'Toca la tarjeta para ver detalle',
                                                        style: TextStyle(
                                                          color: Colors.white
                                                              .withOpacity(0.70),
                                                          fontSize: 12,
                                                          fontWeight:
                                                              FontWeight.w700,
                                                        ),
                                                      ),
                                                    ],
                                                  ),
                                                ] else ...[
                                                  const SizedBox(height: 10),
                                                  Row(
                                                    children: [
                                                      Icon(
                                                        _routeFinished
                                                            ? Icons
                                                                .lock_outline
                                                            : Icons.edit_note,
                                                        color: Colors.white70,
                                                        size: 16,
                                                      ),
                                                      const SizedBox(width: 6),
                                                      Text(
                                                        _routeFinished
                                                            ? 'Ruta cerrada'
                                                            : 'Toca para ajustar cantidades y confirmar',
                                                        style: TextStyle(
                                                          color: Colors.white
                                                              .withOpacity(
                                                                  0.70),
                                                          fontSize: 12,
                                                          fontWeight:
                                                              FontWeight.w700,
                                                        ),
                                                      ),
                                                    ],
                                                  ),
                                                ],
                                              ],
                                            ),
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

class _KmCaptureDialog extends StatefulWidget {
  final String title;
  final String subtitle;
  final double? initialValue;
  final double? minValue;
  final Color accentColor;
  final String Function(double?) formatKm;

  const _KmCaptureDialog({
    required this.title,
    required this.subtitle,
    required this.initialValue,
    required this.minValue,
    required this.accentColor,
    required this.formatKm,
  });

  @override
  State<_KmCaptureDialog> createState() => _KmCaptureDialogState();
}

class _KmCaptureDialogState extends State<_KmCaptureDialog> {
  late final TextEditingController _controller;
  String? _errorText;
  bool _submitting = false;

  @override
  void initState() {
    super.initState();
    _controller = TextEditingController(
      text:
          widget.initialValue == null ? '' : widget.formatKm(widget.initialValue),
    );
  }

  void _submit() {
    if (_submitting) return;

    final raw = _controller.text.trim().replaceAll(',', '.');

    if (raw.isEmpty) {
      setState(() => _errorText = 'Captura el kilometraje.');
      return;
    }

    final value = double.tryParse(raw);
    if (value == null) {
      setState(() => _errorText = 'Ingresa un número válido.');
      return;
    }

    if (value < 0) {
      setState(() => _errorText = 'El kilometraje no puede ser negativo.');
      return;
    }

    if (widget.minValue != null && value < widget.minValue!) {
      setState(
        () => _errorText =
            'El kilometraje final no puede ser menor al inicial (${widget.formatKm(widget.minValue)}).',
      );
      return;
    }

    setState(() => _submitting = true);
    FocusScope.of(context).unfocus();

    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      Navigator.of(context).pop(value);
    });
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      backgroundColor: const Color(0xFF10233D),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(22),
      ),
      title: Text(
        widget.title,
        style: const TextStyle(
          color: Colors.white,
          fontWeight: FontWeight.w900,
          fontSize: 18,
        ),
      ),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              widget.subtitle,
              style: TextStyle(
                color: Colors.white.withOpacity(0.75),
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(height: 14),
            TextField(
              controller: _controller,
              keyboardType:
                  const TextInputType.numberWithOptions(decimal: true),
              autofocus: true,
              style: const TextStyle(color: Colors.white),
              decoration: InputDecoration(
                labelText: 'Kilometraje',
                labelStyle: TextStyle(color: Colors.white.withOpacity(0.75)),
                hintText: 'Ej. 125430',
                hintStyle: TextStyle(color: Colors.white.withOpacity(0.35)),
                errorText: _errorText,
                filled: true,
                fillColor: Colors.white.withOpacity(0.08),
                enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(14),
                  borderSide:
                      BorderSide(color: Colors.white.withOpacity(0.14)),
                ),
                focusedBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(14),
                  borderSide: BorderSide(color: widget.accentColor),
                ),
                errorBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(14),
                  borderSide: const BorderSide(color: Colors.redAccent),
                ),
                focusedErrorBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(14),
                  borderSide: const BorderSide(color: Colors.redAccent),
                ),
              ),
              onSubmitted: (_) => _submit(),
            ),
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: _submitting
              ? null
              : () {
                  FocusScope.of(context).unfocus();
                  Navigator.of(context).pop();
                },
          child: const Text(
            'Cancelar',
            style: TextStyle(color: Colors.white70),
          ),
        ),
        ElevatedButton(
          onPressed: _submitting ? null : _submit,
          style: ElevatedButton.styleFrom(
            backgroundColor: widget.accentColor,
            foregroundColor: Colors.white,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(12),
            ),
          ),
          child: const Text('Guardar'),
        ),
      ],
    );
  }
}

pw.Widget _pdfInfoRow(String label, String value) {
  return pw.Padding(
    padding: const pw.EdgeInsets.symmetric(vertical: 3),
    child: pw.Row(
      crossAxisAlignment: pw.CrossAxisAlignment.start,
      children: [
        pw.SizedBox(
          width: 120,
          child: pw.Text(
            label,
            style: pw.TextStyle(
              fontWeight: pw.FontWeight.bold,
              fontSize: 10,
              color: PdfColor.fromHex('#0A1A2F'),
            ),
          ),
        ),
        pw.Expanded(
          child: pw.Text(
            value,
            style: const pw.TextStyle(fontSize: 10),
          ),
        ),
      ],
    ),
  );
}

pw.Widget _pdfCell(String text, {bool bold = false}) {
  return pw.Padding(
    padding: const pw.EdgeInsets.all(6),
    child: pw.Text(
      text,
      style: pw.TextStyle(
        fontSize: 9,
        fontWeight: bold ? pw.FontWeight.bold : pw.FontWeight.normal,
      ),
    ),
  );
}

pw.Widget _pdfSummaryBox({
  required String title,
  required String value,
}) {
  return pw.Container(
    padding: const pw.EdgeInsets.all(10),
    decoration: pw.BoxDecoration(
      color: PdfColor.fromHex('#F6F8FB'),
      borderRadius: pw.BorderRadius.circular(8),
      border: pw.Border.all(color: PdfColor.fromHex('#D7DFEA')),
    ),
    child: pw.Column(
      children: [
        pw.Text(
          title,
          textAlign: pw.TextAlign.center,
          style: const pw.TextStyle(
            fontSize: 9,
            color: PdfColors.grey700,
          ),
        ),
        pw.SizedBox(height: 4),
        pw.Text(
          value,
          textAlign: pw.TextAlign.center,
          style: pw.TextStyle(
            fontSize: 11,
            fontWeight: pw.FontWeight.bold,
            color: PdfColor.fromHex('#0A1A2F'),
          ),
        ),
      ],
    ),
  );
}

class _DeliveryPdfItem {
  final String productName;
  final String kind;
  final String iceType;
  final double kgPerUnit;
  final int qtyAssigned;
  final int qtyReal;
  final double price;

  _DeliveryPdfItem({
    required this.productName,
    required this.kind,
    required this.iceType,
    required this.kgPerUnit,
    required this.qtyAssigned,
    required this.qtyReal,
    required this.price,
  });
}

class _AssignmentToday {
  final String id;
  final String status;
  final String? routeId;
  final String routeStatus;
  final String? startedAt;
  final String? endedAt;
  final double? kmStart;
  final double? kmEnd;
  final double totalExpected;
  final double totalReal;
  final double progress;
  final int totalDeliveries;
  final int deliveredCount;
  final int activeCount;

  _AssignmentToday({
    required this.id,
    required this.status,
    required this.routeId,
    required this.routeStatus,
    required this.startedAt,
    required this.endedAt,
    required this.kmStart,
    required this.kmEnd,
    required this.totalExpected,
    required this.totalReal,
    required this.progress,
    required this.totalDeliveries,
    required this.deliveredCount,
    required this.activeCount,
  });
}

class _DeliveryRow {
  final String id;
  final String folio;
  final String customerName;
  final String dinerName;
  final String status;
  final String? deliveredAt;
  final double totalExpected;
  final double totalReal;
  final int? priority;
  final String paymentMethod;
  final String deliveryType;
  final bool affectsProgress;
  final bool affectsStock;
  final bool createdByDriver;

  bool get isDriverSale => deliveryType == 'driver_sale';

  _DeliveryRow({
    required this.id,
    required this.folio,
    required this.customerName,
    required this.dinerName,
    required this.status,
    required this.deliveredAt,
    required this.totalExpected,
    required this.totalReal,
    required this.priority,
    required this.paymentMethod,
    required this.deliveryType,
    required this.affectsProgress,
    required this.affectsStock,
    required this.createdByDriver,
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

class _StatChip extends StatelessWidget {
  final String label;
  final String value;

  const _StatChip({required this.label, required this.value});

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

class _Badge extends StatelessWidget {
  final String text;
  final Color? color;

  const _Badge({required this.text, this.color});

  @override
  Widget build(BuildContext context) {
    final c = color ?? Colors.white70;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: c.withOpacity(0.15),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: c.withOpacity(0.30)),
      ),
      child: Text(
        text,
        style: TextStyle(
          color: c == Colors.white70 ? Colors.white : c,
          fontSize: 11,
          fontWeight: FontWeight.w800,
        ),
      ),
    );
  }
}

class _MiniPill extends StatelessWidget {
  final IconData icon;
  final String text;

  const _MiniPill({required this.icon, required this.text});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(999),
        color: Colors.white.withOpacity(0.08),
        border: Border.all(color: Colors.white.withOpacity(0.12)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 14, color: Colors.white70),
          const SizedBox(width: 6),
          Flexible(
            child: Text(
              text,
              style: const TextStyle(
                color: Colors.white,
                fontSize: 11.5,
                fontWeight: FontWeight.w700,
              ),
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

  const _EmptyBox({required this.title, required this.subtitle});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: _GlassCard(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.route, color: Colors.white70, size: 36),
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

class _EmptyBoxScrollable extends StatelessWidget {
  final String title;
  final String subtitle;

  const _EmptyBoxScrollable({
    required this.title,
    required this.subtitle,
  });

  @override
  Widget build(BuildContext context) {
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.all(16),
      children: [
        const SizedBox(height: 120),
        _EmptyBox(title: title, subtitle: subtitle),
      ],
    );
  }
}

class _ErrorBox extends StatelessWidget {
  final String message;
  final VoidCallback onRetry;

  const _ErrorBox({required this.message, required this.onRetry});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: _GlassCard(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.error_outline, color: Colors.redAccent),
            const SizedBox(height: 10),
            Text(message, style: const TextStyle(color: Colors.white)),
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