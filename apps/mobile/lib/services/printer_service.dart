import 'dart:io';
import 'dart:typed_data';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart' show rootBundle;
import 'package:bluetooth_print_plus/bluetooth_print_plus.dart';
import 'package:esc_pos_utils_plus/esc_pos_utils_plus.dart';
import 'package:image/image.dart' as img;
import 'package:permission_handler/permission_handler.dart';

class PrinterService {
  PrinterService._();
  static final PrinterService instance = PrinterService._();

  Stream<List<BluetoothDevice>> get scanResults => BluetoothPrintPlus.scanResults;
  Stream<dynamic> get isScanning => BluetoothPrintPlus.isScanning;
  Stream<dynamic> get blueState => BluetoothPrintPlus.blueState;
  Stream<dynamic> get connectState => BluetoothPrintPlus.connectState;

  String? lastError;

  void _setError(Object e) {
    lastError = e.toString();
    debugPrint('PrinterService error: $lastError');
  }

  Future<bool> requestBluetoothPermissions() async {
    try {
      if (!Platform.isAndroid) return true;

      final statuses = await [
        Permission.bluetoothScan,
        Permission.bluetoothConnect,
      ].request();

      final bluetoothScanOk =
          statuses[Permission.bluetoothScan]?.isGranted ?? false;
      final bluetoothConnectOk =
          statuses[Permission.bluetoothConnect]?.isGranted ?? false;

      return bluetoothScanOk && bluetoothConnectOk;
    } catch (e) {
      _setError(e);
      return false;
    }
  }

  Future<bool> ensureBluetoothPermissions() async {
    final ok = await requestBluetoothPermissions();

    if (!ok) {
      _setError(
        'Faltan permisos de Bluetooth. Activa Dispositivos cercanos/Bluetooth en permisos de la app.',
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

      try {
        await BluetoothPrintPlus.stopScan();
      } catch (e) {
        debugPrint('stopScan ignorado: $e');
      }

      await Future.delayed(const Duration(milliseconds: 400));

      await BluetoothPrintPlus.startScan(timeout: timeout);
      return true;
    } catch (e) {
      _setError('No se pudo buscar impresoras Bluetooth: $e');
      return false;
    }
  }

  Future<bool> stopScan() async {
    try {
      await BluetoothPrintPlus.stopScan();
      return true;
    } catch (e) {
      _setError(e);
      return false;
    }
  }

  Future<bool> connect(BluetoothDevice device) async {
    try {
      lastError = null;

      final hasPermissions = await ensureBluetoothPermissions();
      if (!hasPermissions) return false;

      await BluetoothPrintPlus.connect(device);
      return true;
    } catch (e) {
      _setError('No se pudo conectar la impresora: $e');
      return false;
    }
  }

  Future<bool> disconnect() async {
    try {
      await BluetoothPrintPlus.disconnect();
      return true;
    } catch (e) {
      _setError(e);
      return false;
    }
  }

  Future<bool> get isConnected async {
    try {
      final v = await BluetoothPrintPlus.isConnected;
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

  BluetoothDevice? findDeviceByAddress(
    List<BluetoothDevice> devices,
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
    final clean = value.trim().replaceAll('\n', ' ');
    if (clean.length <= max) return clean;
    return clean.substring(0, max);
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

    bytes.addAll(generator.feed(1));
    bytes.addAll(generator.hr());

    bytes.addAll(generator.text(
      'DEBO Y PAGARE LA ORDEN DE GLOBAL ICE MEXICO S.A. DE C.V. EN ESTA',
      styles: const PosStyles(align: PosAlign.left),
    ));
    bytes.addAll(generator.text(
      'CIUDAD DE GUADALAJARA, JAL. EL DIA $day DE $month DEL $year',
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
    required String driverName,
    required String? deliveredAt,
    required List<PrinterTicketItem> items,
    required double totalReal,
    required img.Image? logo,
  }) {
    final bytes = <int>[];
    final mergedItems = _mergeItems(items);
    final normalizedCopyLabel = copyLabel.trim().toUpperCase();

    bytes.addAll(generator.reset());

    if (logo != null) {
      final resized = img.copyResize(logo, width: 260);
      bytes.addAll(generator.image(resized, align: PosAlign.center));
    } else {
      bytes.addAll(generator.text(
        'GLOBAL ICE',
        styles: const PosStyles(
          align: PosAlign.center,
          bold: true,
          height: PosTextSize.size2,
          width: PosTextSize.size2,
        ),
      ));
    }

    bytes.addAll(generator.text(
      'GLOBAL ICE DE MEXICO S.A. DE C.V.',
      styles: const PosStyles(
        align: PosAlign.center,
        bold: true,
        height: PosTextSize.size2,
        width: PosTextSize.size2,
      ),
    ));

    bytes.addAll(generator.text(
      'EMILIANO ZAPATA No. 32 COL. LOMAS DEL COLLI',
      styles: const PosStyles(align: PosAlign.center),
    ));
    bytes.addAll(generator.text(
      'TEL. 33 36 66 01 60 / 61',
      styles: const PosStyles(align: PosAlign.center),
    ));
    bytes.addAll(generator.text(
      'ZAPOPAN, JALISCO. C.P. 45010',
      styles: const PosStyles(align: PosAlign.center),
    ));
    bytes.addAll(generator.text(
      'facturasglobalice@gmail.com',
      styles: const PosStyles(align: PosAlign.center),
    ));

    bytes.addAll(generator.feed(1));

    bytes.addAll(generator.text(
      normalizedCopyLabel == 'COPIA' ? '*** COPIA ***' : 'ORIGINAL',
      styles: const PosStyles(
        align: PosAlign.center,
        bold: true,
        height: PosTextSize.size2,
        width: PosTextSize.size2,
      ),
    ));

    bytes.addAll(generator.hr(ch: '='));

    bytes.addAll(generator.row([
      PosColumn(
        text: 'REMISION:',
        width: 4,
        styles: const PosStyles(bold: true),
      ),
      PosColumn(
        text: folio,
        width: 8,
        styles: const PosStyles(
          bold: true,
          align: PosAlign.right,
          width: PosTextSize.size2,
          height: PosTextSize.size2,
        ),
      ),
    ]));

    bytes.addAll(generator.text('FECHA: ${_safeDate(deliveredAt)}'));
    bytes.addAll(generator.text('NOMBRE: ${_normalizeText(customerName, max: 64)}'));
    bytes.addAll(generator.text('CHOFER: ${_normalizeText(driverName, max: 48)}'));

    bytes.addAll(generator.hr());

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

    bytes.addAll(generator.hr());

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
            text: _normalizeText(item.description, max: 28),
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

    bytes.addAll(generator.hr());

    bytes.addAll(generator.row([
      PosColumn(
        text: 'TOTAL',
        width: 4,
        styles: const PosStyles(
          bold: true,
          width: PosTextSize.size2,
        ),
      ),
      PosColumn(
        text: _fmtMoney(totalReal),
        width: 8,
        styles: const PosStyles(
          bold: true,
          align: PosAlign.right,
          width: PosTextSize.size2,
          height: PosTextSize.size2,
        ),
      ),
    ]));

    bytes.addAll(_buildLegalBlock(
      generator: generator,
      deliveredAt: deliveredAt,
    ));

    bytes.addAll(generator.feed(2));

    bytes.addAll(generator.text(
      '_______________________________________________',
      styles: const PosStyles(align: PosAlign.center),
    ));
    bytes.addAll(generator.text(
      'Firma',
      styles: const PosStyles(align: PosAlign.center),
    ));

    bytes.addAll(generator.feed(3));
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
          driverName: driverName,
          deliveredAt: deliveredAt,
          items: items,
          totalReal: totalReal,
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
        copies: copies,
        copyLabel: copyLabel,
        paper: PaperSize.mm80,
      );

      await BluetoothPrintPlus.write(Uint8List.fromList(bytes));
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