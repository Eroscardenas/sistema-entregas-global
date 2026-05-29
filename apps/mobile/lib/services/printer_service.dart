import 'dart:async';
import 'dart:io';
import 'dart:typed_data';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart' show rootBundle;
import 'package:blue_thermal_printer/blue_thermal_printer.dart' as thermal;
import 'package:esc_pos_utils_plus/esc_pos_utils_plus.dart';
import 'package:image/image.dart' as img;
import 'package:permission_handler/permission_handler.dart';

class PrinterService {
  PrinterService._();
  static final PrinterService instance = PrinterService._();

  final thermal.BlueThermalPrinter _bluetooth =
      thermal.BlueThermalPrinter.instance;

  final StreamController<List<thermal.BluetoothDevice>> _scanResultsController =
      StreamController<List<thermal.BluetoothDevice>>.broadcast();

  final StreamController<bool> _isScanningController =
      StreamController<bool>.broadcast();

  final StreamController<dynamic> _blueStateController =
      StreamController<dynamic>.broadcast();

  final StreamController<dynamic> _connectStateController =
      StreamController<dynamic>.broadcast();

  Stream<List<thermal.BluetoothDevice>> get scanResults =>
      _scanResultsController.stream;

  Stream<dynamic> get isScanning => _isScanningController.stream;
  Stream<dynamic> get blueState => _blueStateController.stream;
  Stream<dynamic> get connectState => _connectStateController.stream;

  String? lastError;

  void _setError(Object e) {
    lastError = e.toString();
    debugPrint('PrinterService error: $lastError');
  }

  Future<bool> requestBluetoothPermissions() async {
    try {
      if (!Platform.isAndroid) return true;

      final bluetoothScanOk = await Permission.bluetoothScan.isGranted;
      final bluetoothConnectOk = await Permission.bluetoothConnect.isGranted;
      final locationOk = await Permission.locationWhenInUse.isGranted;

      final ok = bluetoothScanOk && bluetoothConnectOk && locationOk;

      if (!ok) {
        _setError(
          'Faltan permisos. Activa manualmente Dispositivos cercanos y Ubicación en Ajustes > Apps > Global Ice > Permisos.',
        );
      }

      return ok;
    } catch (e) {
      _setError(e);
      return false;
    }
  }

  Future<bool> ensureBluetoothPermissions() async {
    final ok = await requestBluetoothPermissions();

    if (!ok) {
      _setError(
        'Faltan permisos. Activa manualmente Dispositivos cercanos y Ubicación en Ajustes > Apps > Global Ice > Permisos.',
      );
      return false;
    }

    return true;
  }

  Future<bool> startScan({
    Duration timeout = const Duration(seconds: 10),
  }) async {
    try {
      lastError = null;

      final hasPermissions = await ensureBluetoothPermissions();
      if (!hasPermissions) return false;

      _isScanningController.add(true);
      _blueStateController.add('BUSCANDO_DISPOSITIVOS_VINCULADOS');

      await Future.delayed(const Duration(milliseconds: 300));

      final devices = await _bluetooth.getBondedDevices();

      _scanResultsController.add(devices);
      _isScanningController.add(false);
      _blueStateController.add('LISTO');

      return true;
    } catch (e) {
      _isScanningController.add(false);
      _setError('No se pudieron obtener impresoras Bluetooth vinculadas: $e');
      return false;
    }
  }

  Future<bool> stopScan() async {
    try {
      _isScanningController.add(false);
      return true;
    } catch (e) {
      _setError(e);
      return false;
    }
  }

  Future<bool> connect(thermal.BluetoothDevice device) async {
    try {
      lastError = null;

      final hasPermissions = await ensureBluetoothPermissions();
      if (!hasPermissions) return false;

      final connectedNow = await isConnected;
      if (connectedNow) {
        await disconnect();
        await Future.delayed(const Duration(milliseconds: 300));
      }

      await _bluetooth.connect(device);
      await Future.delayed(const Duration(milliseconds: 500));

      final connected = await isConnected;
      _connectStateController.add(connected ? 'CONNECTED' : 'CONNECT_FAIL');

      if (!connected) {
        _setError('No se pudo confirmar la conexión con la impresora.');
        return false;
      }

      return true;
    } catch (e) {
      _connectStateController.add('CONNECT_ERROR');
      _setError('No se pudo conectar la impresora: $e');
      return false;
    }
  }

  Future<bool> disconnect() async {
    try {
      await _bluetooth.disconnect();
      _connectStateController.add('DISCONNECTED');
      return true;
    } catch (e) {
      _setError(e);
      return false;
    }
  }

  Future<bool> get isConnected async {
    try {
      final v = await _bluetooth.isConnected;
      return v ?? false;
    } catch (e) {
      _setError(e);
      return false;
    }
  }

  String normalizeAddress(String? value) {
    if (value == null) return '';
    return value.trim().toUpperCase();
  }

  String normalizeDeviceName(String? value) {
    final clean = (value ?? '').trim();
    return clean.isEmpty ? 'Sin nombre' : clean;
  }

  bool sameDeviceAddress(String? a, String? b) {
    return normalizeAddress(a) == normalizeAddress(b);
  }

  thermal.BluetoothDevice? findDeviceByAddress(
    List<thermal.BluetoothDevice> devices,
    String? address,
  ) {
    final normalized = normalizeAddress(address);
    if (normalized.isEmpty) return null;

    for (final device in devices) {
      if (normalizeAddress(device.address) == normalized) {
        return device;
      }
    }

    return null;
  }

  Future<img.Image?> _loadLogoImage() async {
    try {
      final bytes = await rootBundle.load('assets/images/global_ice.png');
      return img.decodeImage(bytes.buffer.asUint8List());
    } catch (_) {
      return null;
    }
  }

  String _fmtMoney(double v) => v.toStringAsFixed(2);

  DateTime _parseDate(String? iso) {
    if (iso == null || iso.trim().isEmpty) return DateTime.now();
    return DateTime.tryParse(iso)?.toLocal() ?? DateTime.now();
  }

  String _safeDate(String? iso) {
    final d = _parseDate(iso);
    final dd = d.day.toString().padLeft(2, '0');
    final mm = d.month.toString().padLeft(2, '0');
    final yy = d.year.toString();
    final hh = d.hour.toString().padLeft(2, '0');
    final mi = d.minute.toString().padLeft(2, '0');
    return '$dd/$mm/$yy $hh:$mi';
  }

  String _dayText(String? iso) => _parseDate(iso).day.toString();

  String _monthText(String? iso) {
    const months = <int, String>{
      1: 'ENERO',
      2: 'FEBRERO',
      3: 'MARZO',
      4: 'ABRIL',
      5: 'MAYO',
      6: 'JUNIO',
      7: 'JULIO',
      8: 'AGOSTO',
      9: 'SEPTIEMBRE',
      10: 'OCTUBRE',
      11: 'NOVIEMBRE',
      12: 'DICIEMBRE',
    };

    return months[_parseDate(iso).month] ?? '—';
  }

  String _yearText(String? iso) => _parseDate(iso).year.toString();

  String _normalizeText(String value, {int max = 32}) {
    final clean = value
        .trim()
        .replaceAll('\n', ' ')
        .replaceAll(RegExp(r'\s+'), ' ')
        .toUpperCase();

    if (clean.length <= max) return clean;
    return clean.substring(0, max);
  }

  String _normalizePaymentMethod(String? value) {
    final clean = (value ?? '').trim().toUpperCase();
    if (clean == 'CREDITO' || clean == 'CRÉDITO') return 'CREDITO';
    return 'EFECTIVO';
  }

  String _paymentLegend(String paymentMethod) {
    final method = _normalizePaymentMethod(paymentMethod);

    if (method == 'CREDITO') {
      return 'PAGO A CREDITO - SUJETO A FACTURACION';
    }

    return 'PAGADO EN EFECTIVO';
  }

  List<PrinterTicketItem> _mergeItems(List<PrinterTicketItem> items) {
    final map = <String, PrinterTicketItem>{};

    for (final item in items) {
      final key = item.description.trim().toUpperCase();

      if (map.containsKey(key)) {
        final prev = map[key]!;
        map[key] = PrinterTicketItem(
          qtyReal: prev.qtyReal + item.qtyReal,
          description: prev.description,
          unitPrice: item.unitPrice != 0 ? item.unitPrice : prev.unitPrice,
          amount: prev.amount + item.amount,
        );
      } else {
        map[key] = PrinterTicketItem(
          qtyReal: item.qtyReal,
          description: item.description,
          unitPrice: item.unitPrice,
          amount: item.amount,
        );
      }
    }

    return map.values.toList();
  }

  List<int> _buildLegalBlock({
    required Generator generator,
    required String? deliveredAt,
  }) {
    final bytes = <int>[];

    final day = _dayText(deliveredAt);
    final month = _monthText(deliveredAt);
    final year = _yearText(deliveredAt);

    bytes.addAll(generator.hr(ch: '-'));

    bytes.addAll(generator.text(
      'DEBO Y PAGARE LA ORDEN DE GLOBAL ICE MEXICO S.A. DE C.V.',
      styles: const PosStyles(align: PosAlign.left),
    ));
    bytes.addAll(generator.text(
      'EN ESTA CIUDAD DE GUADALAJARA, JAL. EL DIA $day DE $month DEL $year',
      styles: const PosStyles(align: PosAlign.left),
    ));
    bytes.addAll(generator.text(
      'LA CANTIDAD EXPRESADA EN ESTA REMISION DE VALOR DE LAS',
      styles: const PosStyles(align: PosAlign.left),
    ));
    bytes.addAll(generator.text(
      'MERCANCIAS ARRIBA DESCRITAS, QUE HE RECIBIDO A MI ENTERA',
      styles: const PosStyles(align: PosAlign.left),
    ));
    bytes.addAll(generator.text(
      'SATISFACCION, ESTE PAGARE MERCANTIL Y ESTA REGIDO POR LA LEY',
      styles: const PosStyles(align: PosAlign.left),
    ));
    bytes.addAll(generator.text(
      'GENERAL DE TITULOS Y OPERACIONES DE CREDITO EN SU ARTICULO 173',
      styles: const PosStyles(align: PosAlign.left),
    ));
    bytes.addAll(generator.text(
      'PARTE FINAL Y ARTICULOS CORRELATIVOS POR NO SER PAGARE',
      styles: const PosStyles(align: PosAlign.left),
    ));
    bytes.addAll(generator.text(
      'DOMICILIADO.',
      styles: const PosStyles(align: PosAlign.left),
    ));

    return bytes;
  }

  List<int> _buildCopyTicket({
    required Generator generator,
    required String copyLabel,
    required String folio,
    required String customerName,
    required String dinerName,
    required String driverName,
    required String? deliveredAt,
    required List<PrinterTicketItem> items,
    required double totalReal,
    required String paymentMethod,
    required img.Image? logo,
  }) {
    final bytes = <int>[];
    final mergedItems = _mergeItems(items);
    final normalizedCopyLabel = copyLabel.trim().toUpperCase();
    final normalizedPaymentMethod = _normalizePaymentMethod(paymentMethod);
    final paymentLegend = _paymentLegend(normalizedPaymentMethod);

    bytes.addAll(generator.reset());

    if (logo != null) {
      final resized = img.copyResize(logo, width: 145);
      bytes.addAll(generator.image(resized, align: PosAlign.center));
    } else {
      bytes.addAll(generator.text(
        'GLOBAL ICE',
        styles: const PosStyles(
          align: PosAlign.center,
          bold: true,
        ),
      ));
    }

    bytes.addAll(generator.text(
      'GLOBAL ICE DE MEXICO S.A. DE C.V.',
      styles: const PosStyles(
        align: PosAlign.center,
        bold: true,
      ),
    ));

    bytes.addAll(generator.text(
      'EMILIANO ZAPATA 32, LOMAS DEL COLLI',
      styles: const PosStyles(align: PosAlign.center),
    ));
    bytes.addAll(generator.text(
      'TEL. 33 36 66 01 60 / 61',
      styles: const PosStyles(align: PosAlign.center),
    ));
    bytes.addAll(generator.text(
      'ZAPOPAN, JAL. C.P. 45010',
      styles: const PosStyles(align: PosAlign.center),
    ));
    bytes.addAll(generator.text(
      'facturas@globalice.com.mx',
      styles: const PosStyles(align: PosAlign.center),
    ));

    bytes.addAll(generator.text(
      normalizedCopyLabel == 'COPIA' ? '*** COPIA ***' : 'ORIGINAL',
      styles: const PosStyles(
        align: PosAlign.center,
        bold: true,
      ),
    ));

    bytes.addAll(generator.hr(ch: '='));

    bytes.addAll(generator.row([
      PosColumn(
        text: 'REM:',
        width: 2,
        styles: const PosStyles(bold: true),
      ),
      PosColumn(
        text: folio,
        width: 5,
        styles: const PosStyles(
          bold: true,
          align: PosAlign.left,
        ),
      ),
      PosColumn(
        text: _safeDate(deliveredAt),
        width: 5,
        styles: const PosStyles(
          align: PosAlign.right,
        ),
      ),
    ]));

    bytes.addAll(generator.text(
      'CLIENTE: ${_normalizeText(customerName, max: 38)}',
    ));

    if (dinerName.trim().isNotEmpty) {
      bytes.addAll(generator.text(
        'COMEDOR: ${_normalizeText(dinerName, max: 38)}',
      ));
    }

    bytes.addAll(generator.text(
      'CHOFER: ${_normalizeText(driverName, max: 32)}',
    ));

    bytes.addAll(generator.text(
      'PAGO: $normalizedPaymentMethod',
      styles: const PosStyles(
        align: PosAlign.left,
        bold: true,
      ),
    ));

    bytes.addAll(generator.hr(ch: '-'));

    bytes.addAll(generator.row([
      PosColumn(
        text: 'CANT',
        width: 2,
        styles: const PosStyles(bold: true, align: PosAlign.center),
      ),
      PosColumn(
        text: 'DESCRIPCION',
        width: 5,
        styles: const PosStyles(bold: true, align: PosAlign.left),
      ),
      PosColumn(
        text: 'P.U.',
        width: 2,
        styles: const PosStyles(bold: true, align: PosAlign.right),
      ),
      PosColumn(
        text: 'IMPORTE',
        width: 3,
        styles: const PosStyles(bold: true, align: PosAlign.right),
      ),
    ]));

    bytes.addAll(generator.hr(ch: '-'));

    if (mergedItems.isEmpty) {
      bytes.addAll(generator.text(
        'SIN PRODUCTOS',
        styles: const PosStyles(align: PosAlign.center),
      ));
    } else {
      for (final item in mergedItems) {
        bytes.addAll(generator.row([
          PosColumn(
            text: '${item.qtyReal}',
            width: 2,
            styles: const PosStyles(align: PosAlign.center),
          ),
          PosColumn(
            text: _normalizeText(item.description, max: 30),
            width: 5,
            styles: const PosStyles(align: PosAlign.left),
          ),
          PosColumn(
            text: _fmtMoney(item.unitPrice),
            width: 2,
            styles: const PosStyles(align: PosAlign.right),
          ),
          PosColumn(
            text: _fmtMoney(item.amount),
            width: 3,
            styles: const PosStyles(align: PosAlign.right),
          ),
        ]));
      }
    }

    bytes.addAll(generator.hr(ch: '='));

    bytes.addAll(generator.row([
      PosColumn(
        text: 'TOTAL',
        width: 5,
        styles: const PosStyles(
          bold: true,
        ),
      ),
      PosColumn(
        text: '\$${_fmtMoney(totalReal)}',
        width: 7,
        styles: const PosStyles(
          bold: true,
          align: PosAlign.right,
        ),
      ),
    ]));

    bytes.addAll(generator.text(
      paymentLegend,
      styles: const PosStyles(
        align: PosAlign.center,
        bold: true,
      ),
    ));

    bytes.addAll(_buildLegalBlock(
      generator: generator,
      deliveredAt: deliveredAt,
    ));

    bytes.addAll(generator.text(
      '______________________________',
      styles: const PosStyles(align: PosAlign.center),
    ));
    bytes.addAll(generator.text(
      'FIRMA',
      styles: const PosStyles(align: PosAlign.center),
    ));

    bytes.addAll(generator.feed(1));
    bytes.addAll(generator.cut());

    return bytes;
  }

  Future<List<int>> buildDeliveryTicketBytes({
    required String folio,
    required String customerName,
    required String dinerName,
    required String driverName,
    required String? deliveredAt,
    required List<PrinterTicketItem> items,
    required double totalReal,
    String paymentMethod = 'EFECTIVO',
    int copies = 1,
    String copyLabel = 'ORIGINAL',
    PaperSize paper = PaperSize.mm80,
  }) async {
    final profile = await CapabilityProfile.load();
    final generator = Generator(paper, profile);
    final bytes = <int>[];

    final logo = await _loadLogoImage();
    final safeCopies = copies < 1 ? 1 : copies;

    for (int copy = 0; copy < safeCopies; copy++) {
      bytes.addAll(
        _buildCopyTicket(
          generator: generator,
          copyLabel: copyLabel,
          folio: folio,
          customerName: customerName,
          dinerName: dinerName,
          driverName: driverName,
          deliveredAt: deliveredAt,
          items: items,
          totalReal: totalReal,
          paymentMethod: paymentMethod,
          logo: logo,
        ),
      );
    }

    return bytes;
  }

  Future<bool> printDeliveryTicket({
    required String folio,
    required String customerName,
    required String dinerName,
    required String driverName,
    required String? deliveredAt,
    required List<PrinterTicketItem> items,
    required double totalReal,
    String paymentMethod = 'EFECTIVO',
    int copies = 1,
    String copyLabel = 'ORIGINAL',
  }) async {
    try {
      lastError = null;

      final hasPermissions = await ensureBluetoothPermissions();
      if (!hasPermissions) return false;

      final connected = await isConnected;
      if (!connected) {
        _setError('No hay impresora conectada.');
        return false;
      }

      final bytes = await buildDeliveryTicketBytes(
        folio: folio,
        customerName: customerName,
        dinerName: dinerName,
        driverName: driverName,
        deliveredAt: deliveredAt,
        items: items,
        totalReal: totalReal,
        paymentMethod: paymentMethod,
        copies: copies,
        copyLabel: copyLabel,
        paper: PaperSize.mm80,
      );

      await _bluetooth.writeBytes(Uint8List.fromList(bytes));
      return true;
    } catch (e) {
      _setError('No se pudo imprimir el ticket: $e');
      return false;
    }
  }
}

class PrinterTicketItem {
  final int qtyReal;
  final String description;
  final double unitPrice;
  final double amount;

  PrinterTicketItem({
    required this.qtyReal,
    required this.description,
    required this.unitPrice,
    required this.amount,
  });
}