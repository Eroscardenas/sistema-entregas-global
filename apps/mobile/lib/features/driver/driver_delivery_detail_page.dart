import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart'
    show rootBundle, FilteringTextInputFormatter;
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:printing/printing.dart';
import 'package:http/http.dart' as http;
import 'package:url_launcher/url_launcher.dart';

import 'package:mobile/services/printer_service.dart';

class DriverDeliveryDetailPage extends StatefulWidget {
  final String deliveryId;
  final String folio;
  final String customerName;

  const DriverDeliveryDetailPage({
    super.key,
    required this.deliveryId,
    required this.folio,
    required this.customerName,
  });

  @override
  State<DriverDeliveryDetailPage> createState() =>
      _DriverDeliveryDetailPageState();
}

class _DriverDeliveryDetailPageState extends State<DriverDeliveryDetailPage> {
  static const _navy = Color(0xFF0A1A2F);
  static const _royal = Color(0xFF1E4A7A);
  static const _accent = Color(0xFF4DADFF);
  static const _burgundy = Color(0xFF852838);
  static const _success = Color(0xFF10B981);
  static const _warning = Color(0xFFF59E0B);
  static const _danger = Color(0xFFEF4444);

  static const String _adminBaseUrl =
      'https://sistema-entregas-global.vercel.app';

  final _sb = Supabase.instance.client;

  bool _loading = true;
  bool _busy = false;
  String? _error;

  String? _status;
  String? _deliveredAt;
  String? _createdAt;
  String? _deliveryType;
  bool _createdByDriver = false;
  String? _assignmentId;
  String? _driverId;
  String? _workDate;
  String? _driverCode;
  String? _customerId;
  String? _mapsUrl;

  String _driverName = 'Chofer';
  String _dinerName = '';
  double _totalExpected = 0;
  double _totalReal = 0;

  String _paymentMethod = 'EFECTIVO';

  List<_DeliveryItemRow> _items = [];
  final Map<String, TextEditingController> _qtyControllers = {};

  bool get _isDelivered {
    final normalized = _normalizeStatus(_status);

    if (normalized == 'ENTREGADA' ||
        normalized == 'CONFIRMADA' ||
        normalized == 'FINALIZADA' ||
        normalized == 'COMPLETADA') {
      return true;
    }

    // Las ventas creadas desde DriverSalePage ya nacen como entrega finalizada.
    // Esto asegura que también muestren PDF e impresión aunque delivered_at venga vacío.
    if (_createdByDriver == true ||
        (_deliveryType ?? '').trim().toLowerCase() == 'driver_sale') {
      return true;
    }

    return false;
  }

  bool get _canPrintTicket => _isDelivered;

  String? get _effectiveDeliveredAt {
    if (_deliveredAt != null && _deliveredAt!.trim().isNotEmpty) {
      return _deliveredAt;
    }

    if (_createdAt != null && _createdAt!.trim().isNotEmpty) {
      return _createdAt;
    }

    if (_isDelivered) {
      return DateTime.now().toIso8601String();
    }

    return null;
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

  String _normalizeStatus(String? status) {
    return (status ?? '').trim().toUpperCase();
  }

  String _normalizeText(String value) {
    return value.trim().toUpperCase();
  }

  String _buildProductKey({
    required String nombre,
    required String iceType,
    required double kg,
    required String kind,
  }) {
    final name = _normalizeText(nombre);
    final type = _normalizeText(iceType);
    final k = _normalizeText(kind);

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

  bool _isDeliveredStatus(String? status) {
    final s = _normalizeStatus(status);
    return s == 'ENTREGADA' ||
        s == 'CONFIRMADA' ||
        s == 'FINALIZADA' ||
        s == 'COMPLETADA';
  }

  bool _isFinishedDeliveryRow(Map<String, dynamic> delivery) {
    final status = (delivery['status'] ?? '').toString();
    final deliveryType = (delivery['delivery_type'] ?? '').toString().trim().toLowerCase();
    final createdByDriver = delivery['created_by_driver'] == true;

    return _isDeliveredStatus(status) ||
        createdByDriver ||
        deliveryType == 'driver_sale';
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
      case 'CANCELADA':
        return 'Cancelada';
      case 'EN_RUTA':
        return 'En ruta';
      default:
        return 'Pendiente';
    }
  }

  Color _statusColor(String? status) {
    final s = _normalizeStatus(status);
    switch (s) {
      case 'ENTREGADA':
      case 'CONFIRMADA':
      case 'FINALIZADA':
      case 'COMPLETADA':
        return _success;
      case 'CANCELADA':
        return Colors.redAccent;
      case 'EN_RUTA':
        return Colors.orangeAccent;
      default:
        return Colors.white70;
    }
  }

  bool _isValidMapsUrl(String? value) {
    final url = (value ?? '').trim();
    if (url.isEmpty) return false;

    final uri = Uri.tryParse(url);
    if (uri == null) return false;

    return uri.hasScheme &&
        (uri.scheme == 'http' || uri.scheme == 'https') &&
        uri.host.isNotEmpty;
  }

  Future<void> _openMaps() async {
    final url = (_mapsUrl ?? '').trim();

    if (!_isValidMapsUrl(url)) {
      _showError('Este cliente no tiene un link válido de Google Maps.');
      return;
    }

    final uri = Uri.parse(url);

    try {
      final opened = await launchUrl(
        uri,
        mode: LaunchMode.externalApplication,
      );

      if (!opened) {
        _showError('No se pudo abrir Google Maps.');
      }
    } catch (e) {
      _showError('No se pudo abrir Maps: $e');
    }
  }

  void _syncControllers() {
    final validIds = _items.map((e) => e.productId).toSet();
    final toRemove =
        _qtyControllers.keys.where((k) => !validIds.contains(k)).toList();

    for (final key in toRemove) {
      _qtyControllers[key]?.dispose();
      _qtyControllers.remove(key);
    }

    for (final item in _items) {
      final current = _qtyControllers[item.productId];
      final nextText = '${item.qtyReal}';

      if (current == null) {
        _qtyControllers[item.productId] = TextEditingController(text: nextText);
      } else if (current.text != nextText) {
        current.value = TextEditingValue(
          text: nextText,
          selection: TextSelection.collapsed(offset: nextText.length),
        );
      }
    }
  }

  Future<Map<String, int>> _loadOutputsByProductKey({
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

  Future<Map<String, int>> _loadDeliveredByProductKeyForAssignment({
    required String assignmentId,
    required String currentDeliveryId,
  }) async {
    final deliveries = await _sb
        .from('deliveries')
        .select('id,status')
        .eq('assignment_id', assignmentId);

    final deliveredDeliveryIds = <String>[];

    for (final raw in deliveries as List) {
      final d = Map<String, dynamic>.from(raw as Map);
      final id = (d['id'] ?? '').toString();
      final status = (d['status'] ?? '').toString();

      if (id.isEmpty) continue;
      if (id == currentDeliveryId) continue;
      if (!_isDeliveredStatus(status)) continue;

      deliveredDeliveryIds.add(id);
    }

    if (deliveredDeliveryIds.isEmpty) return <String, int>{};

    final items = await _sb
        .from('delivery_items')
        .select(
          'delivery_id,product_id,qty_real,products(id,nombre,kind,ice_type,kg_por_unidad)',
        )
        .inFilter('delivery_id', deliveredDeliveryIds);

    final map = <String, int>{};

    for (final raw in items as List) {
      final row = Map<String, dynamic>.from(raw as Map);
      final productRaw = row['products'];
      if (productRaw is! Map) continue;

      final product = Map<String, dynamic>.from(productRaw);
      final key = _buildProductKey(
        nombre: (product['nombre'] ?? '').toString(),
        iceType: (product['ice_type'] ?? '').toString(),
        kg: _toDouble(product['kg_por_unidad']),
        kind: (product['kind'] ?? '').toString(),
      );

      if (key.isEmpty) continue;
      map[key] = (map[key] ?? 0) + _toInt(row['qty_real']);
    }

    return map;
  }

  Future<String?> _loadCustomerMapsUrl(String customerId) async {
    if (customerId.trim().isEmpty) return null;

    try {
      final customer = await _sb
          .from('customers')
          .select('id,maps_url')
          .eq('id', customerId)
          .maybeSingle();

      final url = (customer?['maps_url'] ?? '').toString().trim();
      return url.isEmpty ? null : url;
    } catch (_) {
      return null;
    }
  }

  Future<void> _load() async {
    if (!mounted) return;

    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final delivery = await _sb
          .from('deliveries')
          .select(
            'id, customer_id, assignment_id, status, delivered_at, created_at, delivery_type, created_by_driver, total_expected, total_real, diner_nombre_snapshot, payment_method',
          )
          .eq('id', widget.deliveryId)
          .maybeSingle();

      if (delivery == null) {
        throw Exception('No se encontró la entrega.');
      }

      debugPrint('DETALLE DELIVERY ID: ${widget.deliveryId}');
      debugPrint('DETALLE DELIVERY: $delivery');

      final deliveryIsFinished = _isFinishedDeliveryRow(
        Map<String, dynamic>.from(delivery as Map),
      );

      final customerId = (delivery['customer_id'] ?? '').toString();
      final mapsUrl =
          customerId.isEmpty ? null : await _loadCustomerMapsUrl(customerId);

      final assignmentId = (delivery['assignment_id'] ?? '').toString();
      if (assignmentId.isEmpty) {
        throw Exception('La entrega no tiene asignación vinculada.');
      }

      final assignment = await _sb
          .from('assignments')
          .select('id, driver_id, work_date')
          .eq('id', assignmentId)
          .maybeSingle();

      if (assignment == null) {
        throw Exception('No se encontró la asignación de esta entrega.');
      }

      final driverId = (assignment['driver_id'] ?? '').toString();
      final workDate = (assignment['work_date'] ?? '').toString();

      if (driverId.isEmpty || workDate.isEmpty) {
        throw Exception('La asignación no tiene chofer o fecha de trabajo.');
      }

      String nextDriverName = 'Chofer';
      String? nextDriverCode;

      final driver = await _sb
          .from('drivers')
          .select('id, nombre')
          .eq('id', driverId)
          .maybeSingle();

      if (driver != null) {
        nextDriverName = (driver['nombre'] ?? 'Chofer').toString();
      }

      try {
        final driverMap = await _sb
            .from('driver_inventory_mapping')
            .select(
              'firebase_employee_code,firebase_employee_id,firebase_employee_name',
            )
            .eq('driver_id', driverId)
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

      Map<String, int> outputsByProductKey = <String, int>{};
      Map<String, int> deliveredOtherByProductKey = <String, int>{};

      // Para ventas en ruta / entregas ya finalizadas NO necesitamos validar salidas
      // para abrir comprobante o imprimir. Esto evita que falle el detalle por
      // global-outputs cuando lo único que queremos es ver/imprimir el ticket.
      if (!deliveryIsFinished) {
        outputsByProductKey = await _loadOutputsByProductKey(
          workDate: workDate,
          driverId: driverId,
          driverName: nextDriverName,
          driverCode: nextDriverCode,
        );

        deliveredOtherByProductKey = await _loadDeliveredByProductKeyForAssignment(
          assignmentId: assignmentId,
          currentDeliveryId: widget.deliveryId,
        );
      }

      final rows = await _sb
          .from('delivery_items')
          .select('id, product_id, qty_assigned, qty_real, precio_aplicado')
          .eq('delivery_id', widget.deliveryId);

      final rowsList = rows as List;

      debugPrint('DETALLE ITEMS RAW: $rowsList');

      final productIds = rowsList
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

      final mapped = rowsList.map<_DeliveryItemRow>((raw) {
        final pid = (raw['product_id'] ?? '').toString();
        final p = productsById[pid] ?? {};
        final qtyAssigned = _toInt(raw['qty_assigned']);
        final productKey = _buildProductKey(
          nombre: (p['nombre'] ?? 'Producto').toString(),
          iceType: (p['ice_type'] ?? '').toString(),
          kg: _toDouble(p['kg_por_unidad']),
          kind: (p['kind'] ?? '').toString(),
        );

        final qtyRealRaw = raw['qty_real'];
        int qtyReal = qtyRealRaw == null ? qtyAssigned : _toInt(qtyRealRaw);
        if (qtyReal < 0) qtyReal = 0;

final outputQty = deliveryIsFinished
    ? (qtyReal > qtyAssigned ? qtyReal : qtyAssigned)
    : (outputsByProductKey[productKey] ?? qtyAssigned);
        final deliveredOtherQty = deliveryIsFinished
            ? 0
            : (deliveredOtherByProductKey[productKey] ?? 0);
        final maxAllowed = outputQty - deliveredOtherQty;
        final cleanMaxAllowed = maxAllowed < 0 ? 0 : maxAllowed;

        if (!deliveryIsFinished && qtyReal > cleanMaxAllowed) {
          qtyReal = cleanMaxAllowed;
        }

        return _DeliveryItemRow(
          productId: pid,
          nombre: (p['nombre'] ?? 'Producto').toString(),
          kind: (p['kind'] ?? '').toString(),
          iceType: (p['ice_type'] ?? '').toString(),
          kgPorUnidad: _toDouble(p['kg_por_unidad']),
          qtyAssigned: qtyAssigned,
          qtyReal: qtyReal,
          precioAplicado: _toDouble(raw['precio_aplicado']),
          outputQty: outputQty,
          deliveredOtherQty: deliveredOtherQty,
          maxAllowedQty: cleanMaxAllowed,
        );
      }).toList();

      debugPrint('DETALLE MAPPED LENGTH: ${mapped.length}');
      debugPrint('DETALLE DELIVERY_IS_FINISHED: $deliveryIsFinished');

      if (!mounted) return;

      _driverName = nextDriverName;

      setState(() {
        _customerId = customerId.isEmpty ? null : customerId;
        _mapsUrl = mapsUrl;
        _driverCode = nextDriverCode;
        _assignmentId = assignmentId;
        _driverId = driverId;
        _workDate = workDate;
        _status = (delivery['status'] ?? 'PENDIENTE').toString();
        _deliveredAt = delivery['delivered_at']?.toString();
        _createdAt = delivery['created_at']?.toString();
        _deliveryType = delivery['delivery_type']?.toString();
        _createdByDriver = delivery['created_by_driver'] == true;
        _dinerName = (delivery['diner_nombre_snapshot'] ?? '').toString();
        _totalExpected = _toDouble(delivery['total_expected']);
        _totalReal = _toDouble(delivery['total_real']);
        _paymentMethod =
            ((delivery['payment_method'] ?? 'EFECTIVO').toString().toUpperCase() ==
                    'CREDITO')
                ? 'CREDITO'
                : 'EFECTIVO';
        _items = mapped;
        _syncControllers();
        _loading = false;
      });

      debugPrint('DETALLE STATE STATUS: $_status');
      debugPrint('DETALLE STATE TYPE: $_deliveryType');
      debugPrint('DETALLE STATE CREATED_BY_DRIVER: $_createdByDriver');
      debugPrint('DETALLE STATE IS_DELIVERED: $_isDelivered');
      debugPrint('DETALLE STATE CAN_PRINT: $_canPrintTicket');
    } catch (e) {
      debugPrint('DETALLE ERROR: $e');

      if (!mounted) return;

      setState(() {
        _error = e.toString().replaceFirst('Exception: ', '');
        _loading = false;
      });
    }
  }

  void _showError(String message) {
    if (!mounted) return;

    ScaffoldMessenger.of(context).hideCurrentSnackBar();
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(message)),
    );
  }

  void _setQty(int index, int qty) {
    final item = _items[index];
    int next = qty;

    if (next < 0) next = 0;

    if (item.maxAllowedQty <= 0 && next > 0) {
      next = 0;
      _showError('No hay salida disponible para ${item.nombre}.');
    }

    if (next > item.maxAllowedQty) {
      next = item.maxAllowedQty;
      _showError(
        'No puedes entregar más de ${item.maxAllowedQty} en ${item.nombre}. Disponible según salidas: ${item.maxAllowedQty}.',
      );
    }

    setState(() {
      _items[index] = item.copyWith(qtyReal: next);
      _syncControllers();
    });
  }

  void _setQtyFromText(int index, String value) {
    final parsed = int.tryParse(value.trim()) ?? 0;
    _setQty(index, parsed);
  }

void _validateBeforeConfirm() {
  if (_driverId == null || _driverId!.isEmpty) {
    throw Exception('No se pudo validar el chofer de la entrega.');
  }

  if (_workDate == null || _workDate!.isEmpty) {
    throw Exception('No se pudo validar la fecha de trabajo.');
  }

  final totalPreview = _items.fold<double>(
    0,
    (acc, it) => acc + (it.qtyReal * it.precioAplicado),
  );

  if (_items.isEmpty) {
    throw Exception('La entrega no tiene productos.');
  }

  if (_items.every((it) => it.qtyReal <= 0)) {
    throw Exception(
      'No se puede confirmar una entrega con todas las cantidades en 0.',
    );
  }

  if (totalPreview <= 0) {
    throw Exception('No se puede confirmar una entrega con total real en 0.');
  }

  for (final it in _items) {
    if (it.qtyReal < 0) {
      throw Exception('Cantidad inválida en ${it.nombre}.');
    }

    if (it.outputQty <= 0 && it.qtyReal > 0) {
      throw Exception(
        'No hay salida de inventario registrada para ${it.nombre}. No se puede entregar.',
      );
    }

    if (it.qtyReal > it.maxAllowedQty) {
      throw Exception(
        'No puedes entregar ${it.qtyReal} de ${it.nombre}. Disponible por salidas: ${it.maxAllowedQty}.',
      );
    }
  }
}

  double get _previewTotalReal {
    return _items.fold<double>(
      0,
      (acc, it) => acc + (it.qtyReal * it.precioAplicado),
    );
  }

  int get _previewTotalPieces {
    return _items.fold<int>(0, (acc, it) => acc + it.qtyReal);
  }

  String _money(double n) => n.toStringAsFixed(2);
  String _fmtMoney2(double n) => n.toStringAsFixed(2);

  String _formatDateTime(String? iso) {
    if (iso == null || iso.isEmpty) return '—';
    final d = DateTime.tryParse(iso);
    if (d == null) return '—';

    final local = d.toLocal();
    final dd = local.day.toString().padLeft(2, '0');
    final mm = local.month.toString().padLeft(2, '0');
    final yy = local.year.toString();
    final hh = local.hour.toString().padLeft(2, '0');
    final min = local.minute.toString().padLeft(2, '0');

    return '$dd/$mm/$yy $hh:$min';
  }

  String _safeDatePartDay(String? iso) {
    if (iso == null || iso.isEmpty) return '—';
    final d = DateTime.tryParse(iso);
    if (d == null) return '—';
    final local = d.toLocal();
    return local.day.toString().padLeft(2, '0');
  }

  String _safeDatePartMonth(String? iso) {
    if (iso == null || iso.isEmpty) return '—';
    final d = DateTime.tryParse(iso);
    if (d == null) return '—';
    final local = d.toLocal();
    return local.month.toString().padLeft(2, '0');
  }

  String _safeDatePartYear(String? iso) {
    if (iso == null || iso.isEmpty) return '—';
    final d = DateTime.tryParse(iso);
    if (d == null) return '—';
    final local = d.toLocal();
    return local.year.toString();
  }

  String _safeDatePartHour(String? iso) {
    if (iso == null || iso.isEmpty) return '—';
    final d = DateTime.tryParse(iso);
    if (d == null) return '—';
    final local = d.toLocal();
    final hh = local.hour.toString().padLeft(2, '0');
    final mm = local.minute.toString().padLeft(2, '0');
    return '$hh:$mm';
  }

  String _folioAsTicketNumber(String folio) {
    final cleaned = folio.replaceAll(RegExp(r'[^0-9]'), '');
    if (cleaned.isEmpty) return folio;
    if (cleaned.length <= 6) return cleaned;
    return cleaned.substring(cleaned.length - 6);
  }

  String _normalizeTicketDescription(_DeliveryItemRow it) {
    final name = it.nombre.toUpperCase();

    if (name.contains('GOURMET') && name.contains('5')) {
      return 'BOLSA 5 KG. GOURMET';
    }
    if (name.contains('15') && name.contains('BOLSA')) return 'BOLSA 15 KG.';
    if (name.contains('10') && name.contains('BOLSA')) return 'BOLSA 10 KG.';
    if (name.contains('5') && name.contains('BOLSA')) return 'BOLSA 5 KG.';
    if (name.contains('3') && name.contains('BOLSA')) return 'BOLSA 3 KG.';
    if (name.contains('BARRA')) return 'BARRA HIELO';
    if (name.contains('FRAPE')) return 'FRAPE';
    if (name.contains('GARRAFON') || name.contains('GARRAFÓN')) return 'GARRAFÓN';

    return name;
  }

  List<_TicketLine> _buildTicketLines() {
    return _items
        .where((it) => it.qtyReal > 0)
        .map(
          (it) => _TicketLine(
            qty: it.qtyReal,
            description: _normalizeTicketDescription(it),
            unitPrice: it.precioAplicado,
            amount: it.qtyReal * it.precioAplicado,
          ),
        )
        .toList();
  }

  List<PrinterTicketItem> _buildPrinterItems() {
    return _items
        .where((it) => it.qtyReal > 0)
        .map(
          (it) => PrinterTicketItem(
            qtyReal: it.qtyReal,
            description: _normalizeTicketDescription(it),
            unitPrice: it.precioAplicado,
            amount: it.qtyReal * it.precioAplicado,
          ),
        )
        .toList();
  }

  pw.Widget _ticketCell(
    String text, {
    pw.TextAlign align = pw.TextAlign.left,
    bool bold = false,
    double fontSize = 9,
    int maxLines = 2,
  }) {
    return pw.Padding(
      padding: const pw.EdgeInsets.symmetric(horizontal: 4, vertical: 3),
      child: pw.Text(
        text,
        textAlign: align,
        maxLines: maxLines,
        style: pw.TextStyle(
          fontSize: fontSize,
          fontWeight: bold ? pw.FontWeight.bold : pw.FontWeight.normal,
        ),
      ),
    );
  }

  pw.Widget _boxedField({
    required String label,
    required String value,
    double? width,
    pw.TextAlign align = pw.TextAlign.center,
  }) {
    return pw.Container(
      width: width,
      height: 38,
      decoration: pw.BoxDecoration(
        border: pw.Border.all(color: PdfColors.black, width: 0.7),
        borderRadius: pw.BorderRadius.circular(4),
      ),
      child: pw.Column(
        crossAxisAlignment: pw.CrossAxisAlignment.stretch,
        children: [
          pw.Container(
            padding: const pw.EdgeInsets.symmetric(horizontal: 4, vertical: 2),
            decoration: const pw.BoxDecoration(
              border: pw.Border(
                bottom: pw.BorderSide(color: PdfColors.black, width: 0.5),
              ),
            ),
            child: pw.Text(
              label,
              textAlign: pw.TextAlign.center,
              style: const pw.TextStyle(fontSize: 7),
            ),
          ),
          pw.Expanded(
            child: pw.Center(
              child: pw.Text(
                value,
                textAlign: align,
                style: pw.TextStyle(
                  fontSize: 10,
                  fontWeight: pw.FontWeight.bold,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Future<pw.MemoryImage?> _loadLogoForPdf() async {
    try {
      final data = await rootBundle.load('assets/images/global_ice.png');
      return pw.MemoryImage(data.buffer.asUint8List());
    } catch (_) {
      return null;
    }
  }

  pw.Widget _ticketCopyPage({
    required String copyLabel,
    required List<_TicketLine> lines,
    required pw.MemoryImage? logo,
  }) {
    final shownLines = [...lines];
    while (shownLines.length < 8) {
      shownLines.add(
        _TicketLine(qty: 0, description: '', unitPrice: 0, amount: 0),
      );
    }

    final total = shownLines.fold<double>(
      0,
      (acc, e) => acc + (e.qty > 0 ? e.amount : 0),
    );

    return pw.Container(
      padding: const pw.EdgeInsets.all(12),
      child: pw.Column(
        crossAxisAlignment: pw.CrossAxisAlignment.start,
        children: [
          pw.Row(
            crossAxisAlignment: pw.CrossAxisAlignment.start,
            children: [
              pw.Container(
                width: 110,
                height: 52,
                alignment: pw.Alignment.centerLeft,
                child: logo != null
                    ? pw.Image(
                        logo,
                        fit: pw.BoxFit.contain,
                        width: 100,
                        height: 50,
                      )
                    : pw.Column(
                        crossAxisAlignment: pw.CrossAxisAlignment.start,
                        mainAxisAlignment: pw.MainAxisAlignment.center,
                        children: [
                          pw.Text(
                            'Global',
                            style: pw.TextStyle(
                              fontSize: 24,
                              fontWeight: pw.FontWeight.bold,
                              color: PdfColor.fromHex('#222222'),
                            ),
                          ),
                          pw.Transform.translate(
                            offset: const PdfPoint(38, -6),
                            child: pw.Text(
                              'ice',
                              style: pw.TextStyle(
                                fontSize: 22,
                                fontStyle: pw.FontStyle.italic,
                                fontWeight: pw.FontWeight.bold,
                              ),
                            ),
                          ),
                        ],
                      ),
              ),
              pw.SizedBox(width: 8),
              pw.Expanded(
                child: pw.Column(
                  crossAxisAlignment: pw.CrossAxisAlignment.start,
                  children: [
                    pw.Text(
                      'GLOBAL ICE DE MEXICO S.A. DE C.V.',
                      style: pw.TextStyle(
                        fontSize: 10,
                        fontWeight: pw.FontWeight.bold,
                      ),
                    ),
                    pw.SizedBox(height: 2),
                    pw.Text(
                      'EMILIANO ZAPATA No. 32 COL. LOMAS DEL COLLI',
                      style: const pw.TextStyle(fontSize: 8),
                    ),
                    pw.Text(
                      'TEL. 33 36 66 01 60 / 61',
                      style: const pw.TextStyle(fontSize: 8),
                    ),
                    pw.Text(
                      'ZAPOPAN, JALISCO. C.P. 45010',
                      style: const pw.TextStyle(fontSize: 8),
                    ),
                    pw.Text(
                      'facturas@globalice.com.mx',
                      style: const pw.TextStyle(fontSize: 8),
                    ),
                  ],
                ),
              ),
            ],
          ),
          pw.SizedBox(height: 8),
          pw.Row(
            children: [
              pw.Expanded(
                flex: 3,
                child: _boxedField(
                  label: 'Requisición',
                  value: _folioAsTicketNumber(widget.folio),
                ),
              ),
              pw.SizedBox(width: 8),
              pw.Expanded(
                flex: 7,
                child: pw.Row(
                  children: [
                    pw.Expanded(
                      child: _boxedField(
                        label: 'Día',
                        value: _safeDatePartDay(_effectiveDeliveredAt),
                      ),
                    ),
                    pw.SizedBox(width: 4),
                    pw.Expanded(
                      child: _boxedField(
                        label: 'Mes',
                        value: _safeDatePartMonth(_effectiveDeliveredAt),
                      ),
                    ),
                    pw.SizedBox(width: 4),
                    pw.Expanded(
                      child: _boxedField(
                        label: 'Año',
                        value: _safeDatePartYear(_effectiveDeliveredAt),
                      ),
                    ),
                    pw.SizedBox(width: 4),
                    pw.Expanded(
                      child: _boxedField(
                        label: 'Hora',
                        value: _safeDatePartHour(_effectiveDeliveredAt),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          pw.SizedBox(height: 8),
          pw.Container(
            width: double.infinity,
            padding: const pw.EdgeInsets.symmetric(horizontal: 8, vertical: 6),
            decoration: pw.BoxDecoration(
              border: pw.Border.all(color: PdfColors.black, width: 0.7),
              borderRadius: pw.BorderRadius.circular(4),
            ),
            child: pw.Column(
              crossAxisAlignment: pw.CrossAxisAlignment.start,
              children: [
                pw.Row(
                  children: [
                    pw.SizedBox(
                      width: 65,
                      child: pw.Text(
                        'Nombre:',
                        style: pw.TextStyle(
                          fontSize: 8,
                          fontWeight: pw.FontWeight.bold,
                        ),
                      ),
                    ),
                    pw.Expanded(
                      child: pw.Text(
                        widget.customerName,
                        style: const pw.TextStyle(fontSize: 9),
                      ),
                    ),
                  ],
                ),
                pw.SizedBox(height: 5),
                pw.Row(
                  children: [
                    pw.SizedBox(
                      width: 65,
                      child: pw.Text(
                        'Dirección:',
                        style: pw.TextStyle(
                          fontSize: 8,
                          fontWeight: pw.FontWeight.bold,
                        ),
                      ),
                    ),
                    pw.Expanded(
                      child: pw.Text(
                        _dinerName.isEmpty ? '—' : _dinerName,
                        style: const pw.TextStyle(fontSize: 9),
                      ),
                    ),
                  ],
                ),
                pw.SizedBox(height: 5),
                pw.Row(
                  children: [
                    pw.SizedBox(
                      width: 65,
                      child: pw.Text(
                        'Pago:',
                        style: pw.TextStyle(
                          fontSize: 8,
                          fontWeight: pw.FontWeight.bold,
                        ),
                      ),
                    ),
                    pw.Expanded(
                      child: pw.Text(
                        _paymentMethod,
                        style: const pw.TextStyle(fontSize: 9),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
          pw.SizedBox(height: 8),
          pw.Table(
            border: pw.TableBorder.all(color: PdfColors.black, width: 0.6),
            columnWidths: {
              0: const pw.FlexColumnWidth(1.1),
              1: const pw.FlexColumnWidth(3.4),
              2: const pw.FlexColumnWidth(1.4),
              3: const pw.FlexColumnWidth(1.5),
            },
            children: [
              pw.TableRow(
                children: [
                  _ticketCell('Cant.', bold: true, align: pw.TextAlign.center),
                  _ticketCell(
                    'Descripción',
                    bold: true,
                    align: pw.TextAlign.center,
                  ),
                  _ticketCell(
                    'Precio U.',
                    bold: true,
                    align: pw.TextAlign.center,
                  ),
                  _ticketCell(
                    'Importe',
                    bold: true,
                    align: pw.TextAlign.center,
                  ),
                ],
              ),
              ...shownLines.map(
                (line) => pw.TableRow(
                  children: [
                    _ticketCell(
                      line.qty == 0 ? '' : '${line.qty}',
                      align: pw.TextAlign.center,
                    ),
                    _ticketCell(line.description),
                    _ticketCell(
                      line.qty == 0 ? '' : _fmtMoney2(line.unitPrice),
                      align: pw.TextAlign.center,
                    ),
                    _ticketCell(
                      line.qty == 0 ? '' : _fmtMoney2(line.amount),
                      align: pw.TextAlign.center,
                    ),
                  ],
                ),
              ),
            ],
          ),
          pw.SizedBox(height: 10),
          pw.Row(
            crossAxisAlignment: pw.CrossAxisAlignment.start,
            children: [
              pw.Expanded(
                flex: 7,
                child: pw.Container(
                  padding: const pw.EdgeInsets.all(8),
                  height: 88,
                  decoration: pw.BoxDecoration(
                    border: pw.Border.all(color: PdfColors.black, width: 0.7),
                    borderRadius: pw.BorderRadius.circular(4),
                  ),
                  child: pw.Text(
                    'DEBO Y PAGARE LA ORDEN DE GLOBAL ICE MEXICO S.A. DE C.V. '
                    'EN ESTA CIUDAD DE GUADALAJARA, JAL. '
                    'LA CANTIDAD EXPRESADA EN ESTA REMISIÓN VALOR DE LAS MERCANCÍAS '
                    'ARRIBA DESCRITAS, QUE HE RECIBIDO A MI ENTERA SATISFACCIÓN.',
                    style: const pw.TextStyle(fontSize: 6.7),
                  ),
                ),
              ),
              pw.SizedBox(width: 8),
              pw.Expanded(
                flex: 3,
                child: pw.Column(
                  children: [
                    pw.Container(
                      width: double.infinity,
                      height: 42,
                      decoration: pw.BoxDecoration(
                        border: pw.Border.all(
                          color: PdfColors.black,
                          width: 0.7,
                        ),
                        borderRadius: pw.BorderRadius.circular(4),
                      ),
                      alignment: pw.Alignment.center,
                      child: pw.Text(
                        _fmtMoney2(total),
                        style: pw.TextStyle(
                          fontSize: 16,
                          fontWeight: pw.FontWeight.bold,
                        ),
                      ),
                    ),
                    pw.SizedBox(height: 8),
                    pw.Container(
                      width: double.infinity,
                      padding: const pw.EdgeInsets.all(6),
                      decoration: pw.BoxDecoration(
                        border: pw.Border.all(
                          color: PdfColors.black,
                          width: 0.7,
                        ),
                        borderRadius: pw.BorderRadius.circular(4),
                      ),
                      child: pw.Column(
                        crossAxisAlignment: pw.CrossAxisAlignment.start,
                        children: [
                          pw.Text(
                            'Chofer:',
                            style: pw.TextStyle(
                              fontSize: 7,
                              fontWeight: pw.FontWeight.bold,
                            ),
                          ),
                          pw.SizedBox(height: 3),
                          pw.Text(
                            _driverName,
                            style: const pw.TextStyle(fontSize: 8),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          pw.SizedBox(height: 30),
          pw.Row(
            children: [
              pw.Expanded(
                child: pw.Column(
                  children: [
                    pw.Container(height: 1, color: PdfColors.black),
                    pw.SizedBox(height: 10),
                    pw.Text('Firma', style: const pw.TextStyle(fontSize: 8)),
                  ],
                ),
              ),
              pw.SizedBox(width: 20),
              pw.Text(
                copyLabel,
                style: pw.TextStyle(
                  fontSize: 16,
                  fontWeight: pw.FontWeight.bold,
                  color: PdfColor.fromHex('#555555'),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Future<Uint8List> _buildPdfBytes() async {
    final doc = pw.Document();
    final lines = _buildTicketLines();
    final logo = await _loadLogoForPdf();

    const copies = ['ORIGINAL'];

    for (final copy in copies) {
      doc.addPage(
        pw.Page(
          pageFormat: PdfPageFormat.a5,
          margin: const pw.EdgeInsets.all(14),
          build: (_) => _ticketCopyPage(
            copyLabel: copy,
            lines: lines,
            logo: logo,
          ),
        ),
      );
    }

    return doc.save();
  }

  Future<void> _openPdfPreview() async {
    if (_busy) return;

    try {
      if (mounted) setState(() => _busy = true);

      final bytes = await _buildPdfBytes();

      await Printing.layoutPdf(
        onLayout: (_) async => bytes,
        name: 'entrega_${widget.folio}.pdf',
      );
    } catch (e) {
      if (!mounted) return;
      _showError(
        'No se pudo generar PDF: ${e.toString().replaceFirst('Exception: ', '')}',
      );
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _printBluetoothTicket() async {
    if (_busy) return;

    try {
      if (mounted) setState(() => _busy = true);

      final items = _buildPrinterItems();

      await PrinterService.instance.printDeliveryTicket(
        folio: widget.folio,
        customerName: widget.customerName,
        dinerName: _dinerName,
        driverName: _driverName,
        deliveredAt: _effectiveDeliveredAt,
        totalReal: _isDelivered ? _totalReal : _previewTotalReal,
        paymentMethod: _paymentMethod,
        copies: 1,
        copyLabel: 'ORIGINAL',
        items: items,
      );

      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Original enviado a impresora Bluetooth.'),
        ),
      );
    } catch (e) {
      if (!mounted) return;
      _showError('No se pudo imprimir original: $e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _printBluetoothCopy() async {
    if (_busy) return;

    try {
      if (mounted) setState(() => _busy = true);

      final items = _buildPrinterItems();

      await PrinterService.instance.printDeliveryTicket(
        folio: widget.folio,
        customerName: widget.customerName,
        dinerName: _dinerName,
        driverName: _driverName,
        deliveredAt: _effectiveDeliveredAt,
        totalReal: _isDelivered ? _totalReal : _previewTotalReal,
        paymentMethod: _paymentMethod,
        copies: 1,
        copyLabel: 'COPIA',
        items: items,
      );

      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Copia enviada a impresora Bluetooth.')),
      );
    } catch (e) {
      if (!mounted) return;
      _showError('No se pudo imprimir copia: $e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _confirmDelivery() async {
    if (_isDelivered || _busy) return;

    FocusScope.of(context).unfocus();

    try {
      _validateBeforeConfirm();
    } catch (e) {
      _showError(e.toString().replaceFirst('Exception: ', ''));
      return;
    }

    if (mounted) {
      setState(() => _busy = true);
    }

    try {
      final payload = _items
          .map(
            (it) => {
              'product_id': it.productId,
              'qty_real': it.qtyReal,
            },
          )
          .toList();

      await _sb.rpc('fn_confirm_delivery', params: {
        'p_delivery_id': widget.deliveryId,
        'p_items': payload,
        'p_payment_method': _paymentMethod,
      });

      await _load();

      if (!mounted) return;
      Navigator.of(context).pop(true);
    } catch (e) {
      if (!mounted) return;
      _showError(e.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    for (final controller in _qtyControllers.values) {
      controller.dispose();
    }
    _qtyControllers.clear();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final isDelivered = _isDelivered;
    final canPrintTicket = _canPrintTicket;
    final statusColor = _statusColor(_status);
    final hasMaps = _isValidMapsUrl(_mapsUrl);

    return Scaffold(
      backgroundColor: _navy,
      appBar: AppBar(
        backgroundColor: _navy,
        foregroundColor: Colors.white,
        elevation: 0,
        title: const Text('Detalle de entrega'),
        actions: [
          IconButton(
            onPressed: (_loading || _busy) ? null : _load,
            icon: const Icon(Icons.refresh),
          ),
          if (canPrintTicket)
            IconButton(
              onPressed: _busy ? null : _openPdfPreview,
              icon: const Icon(Icons.picture_as_pdf),
              tooltip: 'Abrir PDF',
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
            child: _loading
                ? const Center(child: CircularProgressIndicator(color: _accent))
                : _error != null
                    ? _ErrorBox(message: _error!, onRetry: _load)
                    : ListView(
                        keyboardDismissBehavior:
                            ScrollViewKeyboardDismissBehavior.onDrag,
                        children: [
                          _GlassCard(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Row(
                                  children: [
                                    Expanded(
                                      child: Text(
                                        widget.customerName,
                                        style: const TextStyle(
                                          color: Colors.white,
                                          fontWeight: FontWeight.w900,
                                          fontSize: 18,
                                        ),
                                      ),
                                    ),
                                    Container(
                                      padding: const EdgeInsets.symmetric(
                                        horizontal: 10,
                                        vertical: 6,
                                      ),
                                      decoration: BoxDecoration(
                                        borderRadius:
                                            BorderRadius.circular(999),
                                        color: statusColor.withOpacity(0.15),
                                        border: Border.all(
                                          color: statusColor.withOpacity(0.30),
                                        ),
                                      ),
                                      child: Text(
                                        _statusLabel(_status),
                                        style: TextStyle(
                                          color: statusColor,
                                          fontWeight: FontWeight.w800,
                                          fontSize: 12,
                                        ),
                                      ),
                                    ),
                                  ],
                                ),
                                const SizedBox(height: 6),
                                Text(
                                  'Folio: ${widget.folio}',
                                  style: TextStyle(
                                    color: Colors.white.withOpacity(0.70),
                                    fontWeight: FontWeight.w700,
                                  ),
                                ),
                                const SizedBox(height: 6),
                                Text(
                                  'Chofer: $_driverName',
                                  style: TextStyle(
                                    color: Colors.white.withOpacity(0.70),
                                    fontWeight: FontWeight.w700,
                                  ),
                                ),
                                if (_workDate != null &&
                                    _workDate!.isNotEmpty) ...[
                                  const SizedBox(height: 4),
                                  Text(
                                    'Fecha salida: $_workDate',
                                    style: TextStyle(
                                      color: Colors.white.withOpacity(0.60),
                                      fontWeight: FontWeight.w600,
                                    ),
                                  ),
                                ],
                                if (_driverCode != null &&
                                    _driverCode!.trim().isNotEmpty) ...[
                                  const SizedBox(height: 4),
                                  Text(
                                    'Código inventario: $_driverCode',
                                    style: TextStyle(
                                      color: Colors.white.withOpacity(0.60),
                                      fontWeight: FontWeight.w600,
                                    ),
                                  ),
                                ],
                                if (_dinerName.isNotEmpty) ...[
                                  const SizedBox(height: 4),
                                  Text(
                                    'Comedor: $_dinerName',
                                    style: TextStyle(
                                      color: Colors.white.withOpacity(0.60),
                                      fontWeight: FontWeight.w600,
                                    ),
                                  ),
                                ],
                                if (isDelivered || _deliveredAt != null) ...[
                                  const SizedBox(height: 6),
                                  Text(
                                    'Hora entrega: ${_formatDateTime(_effectiveDeliveredAt)}',
                                    style: TextStyle(
                                      color: Colors.white.withOpacity(0.70),
                                      fontWeight: FontWeight.w700,
                                    ),
                                  ),
                                ],
                                const SizedBox(height: 12),
                                SizedBox(
                                  width: double.infinity,
                                  child: ElevatedButton.icon(
                                    onPressed:
                                        (_busy || !hasMaps) ? null : _openMaps,
                                    icon: const Icon(Icons.map_outlined),
                                    label: Text(
                                      hasMaps
                                          ? 'Abrir ubicación en Maps'
                                          : 'Sin link de Maps',
                                    ),
                                    style: ElevatedButton.styleFrom(
                                      backgroundColor:
                                          hasMaps ? _success : Colors.white24,
                                      foregroundColor: Colors.white,
                                      disabledBackgroundColor:
                                          Colors.white.withOpacity(0.10),
                                      disabledForegroundColor:
                                          Colors.white.withOpacity(0.45),
                                      padding: const EdgeInsets.symmetric(
                                        vertical: 13,
                                      ),
                                      shape: RoundedRectangleBorder(
                                        borderRadius: BorderRadius.circular(14),
                                      ),
                                    ),
                                  ),
                                ),
                                if (!hasMaps) ...[
                                  const SizedBox(height: 6),
                                  Text(
                                    'Este cliente no tiene maps_url guardado en clientes.',
                                    style: TextStyle(
                                      color: Colors.white.withOpacity(0.55),
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
                                        label: 'Esperado',
                                        value: _money(_totalExpected),
                                      ),
                                    ),
                                    const SizedBox(width: 10),
                                    Expanded(
                                      child: _StatChip(
                                        label:
                                            isDelivered ? 'Real' : 'Real preview',
                                        value: _money(
                                          isDelivered
                                              ? _totalReal
                                              : _previewTotalReal,
                                        ),
                                      ),
                                    ),
                                    const SizedBox(width: 10),
                                    Expanded(
                                      child: _StatChip(
                                        label: 'Piezas',
                                        value: '$_previewTotalPieces',
                                      ),
                                    ),
                                  ],
                                ),
                                const SizedBox(height: 12),
                                Container(
                                  width: double.infinity,
                                  padding: const EdgeInsets.all(10),
                                  decoration: BoxDecoration(
                                    borderRadius: BorderRadius.circular(14),
                                    color: _accent.withOpacity(0.10),
                                    border: Border.all(
                                      color: _accent.withOpacity(0.24),
                                    ),
                                  ),
                                ),
                                const SizedBox(height: 12),
                                _PaymentSelector(
                                  value: _paymentMethod,
                                  enabled: !isDelivered && !_busy,
                                  onChanged: (value) {
                                    setState(() {
                                      _paymentMethod = value;
                                    });
                                  },
                                ),
                                if (canPrintTicket) ...[
                                  const SizedBox(height: 10),
                                  Container(
                                    width: double.infinity,
                                    padding: const EdgeInsets.all(12),
                                    decoration: BoxDecoration(
                                      borderRadius: BorderRadius.circular(14),
                                      color: _success.withOpacity(0.12),
                                      border: Border.all(
                                        color: _success.withOpacity(0.25),
                                      ),
                                    ),
                                    child: Column(
                                      crossAxisAlignment:
                                          CrossAxisAlignment.start,
                                      children: [
                                        Text(
                                          'Confirmada: ${_formatDateTime(_effectiveDeliveredAt)}',
                                          style: const TextStyle(
                                            color: Colors.white,
                                            fontWeight: FontWeight.w800,
                                          ),
                                        ),
                                        const SizedBox(height: 6),
                                        Text(
                                          'Método de pago: $_paymentMethod',
                                          style: TextStyle(
                                            color:
                                                Colors.white.withOpacity(0.85),
                                            fontWeight: FontWeight.w700,
                                          ),
                                        ),
                                        const SizedBox(height: 10),
                                        SizedBox(
                                          width: double.infinity,
                                          child: ElevatedButton.icon(
                                            onPressed:
                                                _busy ? null : _openPdfPreview,
                                            icon: const Icon(
                                              Icons.picture_as_pdf,
                                            ),
                                            label: const Text(
                                              'Abrir PDF de entrega',
                                            ),
                                            style: ElevatedButton.styleFrom(
                                              backgroundColor: _burgundy,
                                              foregroundColor: Colors.white,
                                              shape: RoundedRectangleBorder(
                                                borderRadius:
                                                    BorderRadius.circular(14),
                                              ),
                                            ),
                                          ),
                                        ),
                                        const SizedBox(height: 10),
                                        SizedBox(
                                          width: double.infinity,
                                          child: ElevatedButton.icon(
                                            onPressed: _busy
                                                ? null
                                                : _printBluetoothTicket,
                                            icon: const Icon(Icons.print),
                                            label:
                                                const Text('Imprimir original'),
                                            style: ElevatedButton.styleFrom(
                                              backgroundColor: _royal,
                                              foregroundColor: Colors.white,
                                              shape: RoundedRectangleBorder(
                                                borderRadius:
                                                    BorderRadius.circular(14),
                                              ),
                                            ),
                                          ),
                                        ),
                                        const SizedBox(height: 10),
                                        SizedBox(
                                          width: double.infinity,
                                          child: OutlinedButton.icon(
                                            onPressed: _busy
                                                ? null
                                                : _printBluetoothCopy,
                                            icon: const Icon(Icons.copy),
                                            label:
                                                const Text('Imprimir copia'),
                                            style: OutlinedButton.styleFrom(
                                              foregroundColor: Colors.white,
                                              side: BorderSide(
                                                color: Colors.white
                                                    .withOpacity(0.35),
                                              ),
                                              shape: RoundedRectangleBorder(
                                                borderRadius:
                                                    BorderRadius.circular(14),
                                              ),
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
                          const SizedBox(height: 14),
                          ListView.separated(
                            shrinkWrap: true,
                            physics: const NeverScrollableScrollPhysics(),
                            itemCount: _items.length,
                            separatorBuilder: (_, __) =>
                                const SizedBox(height: 10),
                            itemBuilder: (_, i) {
                              final it = _items[i];
                              final subtotal = it.qtyReal * it.precioAplicado;
                              final controller = _qtyControllers[it.productId];

                              if (controller == null) {
                                return const SizedBox.shrink();
                              }

                              final canEdit = !isDelivered && !_busy;
                              final hasStock = it.maxAllowedQty > 0;
                              final canRemove = canEdit && it.qtyReal > 0;
                              final canAdd = canEdit &&
                                  hasStock &&
                                  it.qtyReal < it.maxAllowedQty;

                              final availableColor =
                                  hasStock ? _success : _danger;

                              return _GlassCard(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Row(
                                      children: [
                                        Expanded(
                                          child: Text(
                                            it.nombre,
                                            style: const TextStyle(
                                              color: Colors.white,
                                              fontWeight: FontWeight.w900,
                                            ),
                                          ),
                                        ),
                                        Container(
                                          padding: const EdgeInsets.symmetric(
                                            horizontal: 10,
                                            vertical: 6,
                                          ),
                                          decoration: BoxDecoration(
                                            borderRadius:
                                                BorderRadius.circular(999),
                                            color:
                                                availableColor.withOpacity(0.14),
                                            border: Border.all(
                                              color: availableColor
                                                  .withOpacity(0.35),
                                            ),
                                          ),
                                          child: Text(
                                            hasStock
                                                ? 'Disponible'
                                                : 'Sin salida',
                                            style: TextStyle(
                                              color: availableColor,
                                              fontWeight: FontWeight.w900,
                                              fontSize: 12,
                                            ),
                                          ),
                                        ),
                                      ],
                                    ),
                                    const SizedBox(height: 4),
                                    Text(
                                      '${it.kind.toUpperCase()} • ${it.iceType} • ${it.kgPorUnidad}kg',
                                      style: TextStyle(
                                        color: Colors.white.withOpacity(0.60),
                                        fontSize: 12,
                                      ),
                                    ),
                                    const SizedBox(height: 10),
                                    Wrap(
                                      spacing: 8,
                                      runSpacing: 8,
                                      children: [
                                        _MiniInfo(
                                          label: 'Asignado cliente',
                                          value: '${it.qtyAssigned}',
                                        ),
                                        _MiniInfo(
                                          label: 'Salida global',
                                          value: '${it.outputQty}',
                                        ),
                                        _MiniInfo(
                                          label: 'Entregado otros',
                                          value: '${it.deliveredOtherQty}',
                                        ),
                                        _MiniInfo(
                                          label: 'Disponible',
                                          value: '${it.maxAllowedQty}',
                                        ),
                                        _MiniInfo(
                                          label: 'Real',
                                          value: '${it.qtyReal}',
                                        ),
                                        _MiniInfo(
                                          label: 'Precio',
                                          value: _money(it.precioAplicado),
                                        ),
                                        _MiniInfo(
                                          label: 'Subtotal real',
                                          value: _money(subtotal),
                                        ),
                                      ],
                                    ),
                                    const SizedBox(height: 12),
                                    Row(
                                      children: [
                                        IconButton(
                                          onPressed: canRemove
                                              ? () =>
                                                  _setQty(i, it.qtyReal - 1)
                                              : null,
                                          icon: Icon(
                                            Icons.remove_circle_outline,
                                            color: canRemove
                                                ? Colors.white
                                                : Colors.white24,
                                          ),
                                        ),
                                        SizedBox(
                                          width: 84,
                                          child: TextField(
                                            controller: controller,
                                            enabled: canEdit,
                                            keyboardType: TextInputType.number,
                                            inputFormatters: [
                                              FilteringTextInputFormatter
                                                  .digitsOnly,
                                            ],
                                            textAlign: TextAlign.center,
                                            style: const TextStyle(
                                              color: Colors.white,
                                            ),
                                            decoration: InputDecoration(
                                              isDense: true,
                                              filled: true,
                                              fillColor: Colors.white
                                                  .withOpacity(0.08),
                                              border: OutlineInputBorder(
                                                borderRadius:
                                                    BorderRadius.circular(12),
                                                borderSide: BorderSide(
                                                  color: Colors.white
                                                      .withOpacity(0.10),
                                                ),
                                              ),
                                              enabledBorder: OutlineInputBorder(
                                                borderRadius:
                                                    BorderRadius.circular(12),
                                                borderSide: BorderSide(
                                                  color: Colors.white
                                                      .withOpacity(0.10),
                                                ),
                                              ),
                                              focusedBorder:
                                                  const OutlineInputBorder(
                                                borderRadius: BorderRadius.all(
                                                  Radius.circular(12),
                                                ),
                                                borderSide:
                                                    BorderSide(color: _accent),
                                              ),
                                            ),
                                            onChanged: (v) =>
                                                _setQtyFromText(i, v),
                                          ),
                                        ),
                                        IconButton(
                                          onPressed: canAdd
                                              ? () =>
                                                  _setQty(i, it.qtyReal + 1)
                                              : null,
                                          icon: Icon(
                                            Icons.add_circle_outline,
                                            color: canAdd
                                                ? Colors.white
                                                : Colors.white24,
                                          ),
                                        ),
                                        const Spacer(),
                                        TextButton(
                                          onPressed:
                                              canEdit ? () => _setQty(i, 0) : null,
                                          child: const Text('No dejó'),
                                        ),
                                        const SizedBox(width: 6),
                                        TextButton(
                                          onPressed: canEdit && hasStock
                                              ? () => _setQty(
                                                    i,
                                                    it.qtyAssigned >
                                                            it.maxAllowedQty
                                                        ? it.maxAllowedQty
                                                        : it.qtyAssigned,
                                                  )
                                              : null,
                                          child: const Text('Completo'),
                                        ),
                                      ],
                                    ),
                                    if (!isDelivered &&
                                        it.qtyAssigned != it.qtyReal) ...[
                                      const SizedBox(height: 8),
                                      Text(
                                        it.qtyReal > it.qtyAssigned
                                            ? 'Se está entregando más de lo asignado al cliente. Permitido porque hay salida disponible.'
                                            : 'Se está entregando menos de lo asignado al cliente.',
                                        style: TextStyle(
                                          color: _warning.withOpacity(0.95),
                                          fontWeight: FontWeight.w700,
                                          fontSize: 12,
                                        ),
                                      ),
                                    ],
                                    if (!isDelivered && !hasStock) ...[
                                      const SizedBox(height: 8),
                                      Text(
                                        'No hay salida global disponible para este producto. No permite capturar cantidad mayor a 0.',
                                        style: TextStyle(
                                          color: Colors.redAccent
                                              .withOpacity(0.95),
                                          fontWeight: FontWeight.w800,
                                          fontSize: 12,
                                        ),
                                      ),
                                    ],
                                  ],
                                ),
                              );
                            },
                          ),
                          const SizedBox(height: 12),
                          SizedBox(
                            width: double.infinity,
                            child: ElevatedButton.icon(
                              onPressed: (_busy || isDelivered)
                                  ? null
                                  : _confirmDelivery,
                              icon: const Icon(Icons.check_circle_outline),
                              label: Text(
                                _busy
                                    ? 'Confirmando...'
                                    : isDelivered
                                        ? 'Ya confirmada'
                                        : 'Confirmar entrega',
                              ),
                              style: ElevatedButton.styleFrom(
                                backgroundColor: _accent,
                                foregroundColor: Colors.white,
                                padding:
                                    const EdgeInsets.symmetric(vertical: 14),
                                shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(16),
                                ),
                              ),
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

class _PaymentSelector extends StatelessWidget {
  final String value;
  final bool enabled;
  final ValueChanged<String> onChanged;

  const _PaymentSelector({
    required this.value,
    required this.enabled,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    Widget chip(String label, IconData icon) {
      final selected = value == label;

      return Expanded(
        child: GestureDetector(
          onTap: enabled ? () => onChanged(label) : null,
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 180),
            padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 12),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(14),
              color: selected
                  ? const Color(0xFF4DADFF).withOpacity(0.22)
                  : Colors.white.withOpacity(0.06),
              border: Border.all(
                color: selected
                    ? const Color(0xFF4DADFF)
                    : Colors.white.withOpacity(0.10),
              ),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(icon, color: Colors.white, size: 18),
                const SizedBox(width: 8),
                Text(
                  label,
                  style: TextStyle(
                    color:
                        enabled ? Colors.white : Colors.white.withOpacity(0.50),
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ],
            ),
          ),
        ),
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Tipo de cobro',
          style: TextStyle(
            color: Colors.white.withOpacity(0.80),
            fontWeight: FontWeight.w800,
          ),
        ),
        const SizedBox(height: 10),
        Row(
          children: [
            chip('EFECTIVO', Icons.payments_outlined),
            const SizedBox(width: 10),
            chip('CREDITO', Icons.credit_card_outlined),
          ],
        ),
      ],
    );
  }
}

class _TicketLine {
  final int qty;
  final String description;
  final double unitPrice;
  final double amount;

  _TicketLine({
    required this.qty,
    required this.description,
    required this.unitPrice,
    required this.amount,
  });
}

class _DeliveryItemRow {
  final String productId;
  final String nombre;
  final String kind;
  final String iceType;
  final double kgPorUnidad;
  final int qtyAssigned;
  final int qtyReal;
  final double precioAplicado;

  final int outputQty;
  final int deliveredOtherQty;
  final int maxAllowedQty;

  _DeliveryItemRow({
    required this.productId,
    required this.nombre,
    required this.kind,
    required this.iceType,
    required this.kgPorUnidad,
    required this.qtyAssigned,
    required this.qtyReal,
    required this.precioAplicado,
    required this.outputQty,
    required this.deliveredOtherQty,
    required this.maxAllowedQty,
  });

  _DeliveryItemRow copyWith({
    int? qtyReal,
  }) {
    return _DeliveryItemRow(
      productId: productId,
      nombre: nombre,
      kind: kind,
      iceType: iceType,
      kgPorUnidad: kgPorUnidad,
      qtyAssigned: qtyAssigned,
      qtyReal: qtyReal ?? this.qtyReal,
      precioAplicado: precioAplicado,
      outputQty: outputQty,
      deliveredOtherQty: deliveredOtherQty,
      maxAllowedQty: maxAllowedQty,
    );
  }
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

  const _StatChip({
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

class _MiniInfo extends StatelessWidget {
  final String label;
  final String value;

  const _MiniInfo({
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