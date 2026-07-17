import 'dart:async';

import 'package:flutter/material.dart';
import 'package:blue_thermal_printer/blue_thermal_printer.dart' as thermal;
import 'package:shared_preferences/shared_preferences.dart';

import 'package:mobile/services/printer_service.dart';

class ProductionPrinterPage extends StatefulWidget {
  final String employeeName;

  const ProductionPrinterPage({
    super.key,
    required this.employeeName,
  });

  @override
  State<ProductionPrinterPage> createState() => _ProductionPrinterPageState();
}

class _ProductionPrinterPageState extends State<ProductionPrinterPage> {
  static const _navy = Color(0xFF0A1A2F);
  static const _royal = Color(0xFF1E4A7A);
  static const _accent = Color(0xFF4DADFF);
  static const _burgundy = Color(0xFF852838);
  static const _success = Color(0xFF10B981);
  static const _warning = Color(0xFFF59E0B);
  static const _danger = Color(0xFFEF4444);

  static const String _prefDeviceAddress = 'bt_device_address';
  static const String _prefDeviceName = 'bt_device_name';

  final PrinterService _printer = PrinterService.instance;

  List<thermal.BluetoothDevice> _devices = <thermal.BluetoothDevice>[];
  bool _scanning = false;
  bool _busy = false;
  bool _connected = false;
  bool _autoReconnectTried = false;

  String? _statusText;
  String? _errorText;
  thermal.BluetoothDevice? _selected;
  String? _savedAddress;
  String? _savedName;

  StreamSubscription<List<thermal.BluetoothDevice>>? _scanSub;
  StreamSubscription<dynamic>? _scanStateSub;
  StreamSubscription<dynamic>? _connectStateSub;

  @override
  void initState() {
    super.initState();
    _initStreams();
    _bootstrap();
  }

  @override
  void dispose() {
    _scanSub?.cancel();
    _scanStateSub?.cancel();
    _connectStateSub?.cancel();
    super.dispose();
  }

  Future<void> _bootstrap() async {
    await _restoreSavedDevice();
    await _syncInitialState();
  }


  String _shortError(Object? error) {
    final raw = (error ?? '').toString().trim();
    if (raw.isEmpty) return 'No se pudo completar la operación Bluetooth.';

    final lower = raw.toLowerCase();

    if (lower.contains('read failed') ||
        lower.contains('socket might closed') ||
        lower.contains('connect_error') ||
        lower.contains('timeout')) {
      return 'No se pudo conectar. Apaga y prende la impresora, revisa que esté vinculada en Ajustes Bluetooth y vuelve a presionar Cambiar impresora / Buscar.';
    }

    if (lower.contains('permission') || lower.contains('permiso')) {
      return 'Faltan permisos de Bluetooth. Revisa permisos de la app y Bluetooth del teléfono.';
    }

    if (lower.contains('bluetooth') && lower.contains('off')) {
      return 'Bluetooth está apagado. Actívalo e intenta de nuevo.';
    }

    final firstLine = raw.split('\n').first.trim();
    if (firstLine.length > 180) {
      return '${firstLine.substring(0, 180)}...';
    }

    return firstLine;
  }

  void _initStreams() {
    _scanSub = _printer.scanResults.listen(
      (List<thermal.BluetoothDevice> event) async {
        if (!mounted) return;

        final devices = List<thermal.BluetoothDevice>.from(event);

        setState(() {
          _devices = devices;
        });

        await _tryAutoReconnectIfPossible();
      },
      onError: (Object e) {
        if (!mounted) return;
        setState(() {
          _errorText = _shortError(e);
          _statusText = 'No se pudieron leer dispositivos Bluetooth.';
        });
      },
    );

    _scanStateSub = _printer.isScanning.listen(
      (event) {
        if (!mounted) return;

        final scanning = event == true;

        setState(() {
          _scanning = scanning;

          if (_scanning) {
            _statusText = 'Buscando dispositivos Bluetooth vinculados...';
            _errorText = null;
            _autoReconnectTried = false;
          } else {
            _statusText = _devices.isEmpty
                ? 'No se encontraron dispositivos vinculados. Primero vincula la impresora desde Ajustes Bluetooth del celular.'
                : 'Búsqueda finalizada. Puedes conectarte a cualquier dispositivo detectado.';
          }
        });
      },
      onError: (Object e) {
        if (!mounted) return;
        setState(() {
          _scanning = false;
          _errorText = _shortError(e);
          _statusText = 'Error al buscar dispositivos.';
        });
      },
    );

    _connectStateSub = _printer.connectState.listen(
      (event) {
        if (!mounted) return;

        final stateText = '$event'.toUpperCase();
        final isConnected = stateText.contains('CONNECTED') ||
            stateText.contains('CONNECT_SUCCESS') ||
            stateText.contains('TRUE');

        setState(() {
          _connected = isConnected;
          _statusText = isConnected ? 'Estado de conexión: conectado' : 'Estado de conexión: sin conexión';

          if (!isConnected &&
              (stateText.contains('DISCONNECT') ||
                  stateText.contains('FAIL') ||
                  stateText.contains('ERROR'))) {
            _selected = null;
          }
        });
      },
      onError: (Object e) {
        if (!mounted) return;
        setState(() {
          _connected = false;
          _selected = null;
          _errorText = _shortError(e);
          _statusText = 'Error de conexión.';
        });
      },
    );
  }

  Future<void> _syncInitialState() async {
    final connected = await _printer.isConnected;
    if (!mounted) return;

    setState(() {
      _connected = connected;
      _statusText = connected
          ? 'Ya hay un dispositivo Bluetooth conectado.'
          : _savedAddress != null && _savedAddress!.isNotEmpty
              ? 'Hay un dispositivo guardado. Puedes buscarlo para reconectar.'
              : 'Sin dispositivo Bluetooth conectado.';
      _errorText = null;
    });
  }

  Future<void> _saveSelectedDevice(thermal.BluetoothDevice device) async {
    final prefs = await SharedPreferences.getInstance();
    final address = device.address ?? '';
    final name = device.name ?? '';

    await prefs.setString(_prefDeviceAddress, address);
    await prefs.setString(_prefDeviceName, name);

    _savedAddress = address.isEmpty ? null : address;
    _savedName = name.isEmpty ? null : name;
  }

  Future<void> _clearSavedDevice() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_prefDeviceAddress);
    await prefs.remove(_prefDeviceName);

    _savedAddress = null;
    _savedName = null;
  }

  Future<void> _restoreSavedDevice() async {
    final prefs = await SharedPreferences.getInstance();
    final savedAddress = prefs.getString(_prefDeviceAddress);
    final savedName = prefs.getString(_prefDeviceName);

    _savedAddress =
        (savedAddress != null && savedAddress.isNotEmpty) ? savedAddress : null;
    _savedName = (savedName != null && savedName.isNotEmpty) ? savedName : null;

    if (!mounted) return;

    if (_savedAddress != null) {
      setState(() {
        _selected = thermal.BluetoothDevice(
          _savedName ?? 'Dispositivo guardado',
          _savedAddress!,
        );
        _statusText = 'Dispositivo guardado: ${_selected?.name ?? 'Bluetooth'}';
      });
    }
  }

  Future<void> _tryAutoReconnectIfPossible() async {
    // No reconectar automáticamente.
    // Antes intentaba conectarse sola a la última impresora guardada y eso
    // provocaba CONNECT_ERROR cuando esa impresora estaba apagada, lejos o
    // conectada a otro celular. Ahora el chofer decide presionando "Conectar".
    return;
  }

  Future<void> _startScan() async {
    if (_busy) return;

    setState(() {
      _busy = true;
      _devices = <thermal.BluetoothDevice>[];
      _statusText = 'Buscando dispositivos vinculados...';
      _errorText = null;
      _autoReconnectTried = false;
    });

    final ok = await _printer.startScan(timeout: const Duration(seconds: 10));

    if (!mounted) return;

    setState(() {
      _busy = false;

      if (!ok) {
        _errorText =
            _shortError(_printer.lastError ?? 'No se pudo iniciar la búsqueda Bluetooth.');
        _statusText = 'Error al buscar dispositivos.';
      }
    });

    if (!ok) {
      _show(_shortError(_printer.lastError ?? 'No se pudo buscar dispositivos Bluetooth.'));
    }
  }

  Future<void> _stopScan() async {
    if (_busy) return;

    setState(() {
      _busy = true;
      _errorText = null;
    });

    final ok = await _printer.stopScan();

    if (!mounted) return;

    setState(() {
      _busy = false;
      _statusText =
          ok ? 'Búsqueda detenida.' : 'No se pudo detener la búsqueda.';

      if (!ok) {
        _errorText = _shortError(_printer.lastError ?? 'No se pudo detener el escaneo.');
      }
    });

    if (!ok) {
      _show(_shortError(_printer.lastError ?? 'No se pudo detener el escaneo.'));
    }
  }

  Future<void> _connect(
    thermal.BluetoothDevice device, {
    bool silent = false,
    bool autoReconnect = false,
  }) async {
    if (_busy) return;

    setState(() {
      _busy = true;
      _errorText = null;
      _autoReconnectTried = true;
      _statusText = autoReconnect
          ? 'Reconectando a ${device.name ?? 'dispositivo Bluetooth'}...'
          : 'Conectando a ${device.name ?? 'dispositivo Bluetooth'}...';
    });

    if (_scanning) {
      await _printer.stopScan();
      if (mounted) {
        setState(() {
          _scanning = false;
        });
      }
    }

    final alreadyConnected = await _printer.isConnected;
    if (alreadyConnected) {
      await _printer.disconnect();
      await Future.delayed(const Duration(milliseconds: 500));
    }

    final ok = await _printer.connect(device);
    final connected = ok ? await _printer.isConnected : false;

    if (!mounted) return;

    setState(() {
      _busy = false;
      _selected = connected ? device : null;
      _connected = connected;
      _statusText = connected
          ? 'Conectado: ${device.name ?? device.address ?? 'dispositivo Bluetooth'}'
          : 'No se pudo conectar.';

      if (!connected) {
        _errorText = _shortError(_printer.lastError ?? 'No se pudo conectar la impresora.');
      }
    });

    if (connected) {
      await _saveSelectedDevice(device);
      if (!silent) {
        _show('Dispositivo Bluetooth conectado correctamente.');
      }
    } else if (!silent) {
      _show(_shortError(_printer.lastError ?? 'No se pudo conectar la impresora.'));
    }
  }

  Future<void> _disconnect() async {
    if (_busy) return;

    setState(() {
      _busy = true;
      _errorText = null;
      _statusText = 'Desconectando dispositivo...';
    });

    final ok = await _printer.disconnect();

    if (ok) {
      await _clearSavedDevice();
    }

    if (!mounted) return;

    setState(() {
      _busy = false;

      if (ok) {
        _selected = null;
        _connected = false;
        _statusText = 'Dispositivo desconectado.';
      } else {
        _errorText = _shortError(_printer.lastError ?? 'No se pudo desconectar.');
        _statusText = 'No se pudo desconectar.';
      }
    });

    _show(
      ok
          ? 'Dispositivo desconectado.'
          : (_shortError(_printer.lastError ?? 'No se pudo desconectar.')),
    );
  }

  Future<void> _forgetSavedPrinter() async {
    if (_busy) return;

    setState(() {
      _busy = true;
      _errorText = null;
      _statusText = 'Olvidando impresora guardada...';
      _autoReconnectTried = true;
    });

    await _clearSavedDevice();

    if (!mounted) return;

    setState(() {
      _busy = false;
      _savedAddress = null;
      _savedName = null;

      if (!_connected) {
        _selected = null;
      }

      _statusText = _connected
          ? 'Impresora guardada olvidada. La conexión actual sigue activa.'
          : 'Impresora guardada olvidada.';
    });

    _show('Impresora guardada olvidada.');
  }

  Future<void> _changePrinter() async {
    if (_busy) return;

    setState(() {
      _busy = true;
      _errorText = null;
      _statusText = 'Cambiando impresora...';
      _autoReconnectTried = true;
    });

    final connectedNow = await _printer.isConnected;

    if (connectedNow) {
      await _printer.disconnect();
      await Future.delayed(const Duration(milliseconds: 400));
    }

    await _clearSavedDevice();

    if (!mounted) return;

    setState(() {
      _busy = false;
      _connected = false;
      _selected = null;
      _savedAddress = null;
      _savedName = null;
      _devices = <thermal.BluetoothDevice>[];
      _statusText = 'Selecciona una nueva impresora.';
    });

    await _startScan();
  }

  Future<void> _testPrint() async {
    if (_busy) return;

    setState(() {
      _busy = true;
      _errorText = null;
      _statusText = 'Enviando impresión de prueba...';
    });

    final ok = await _printer.printDeliveryTicket(
      folio: 'PRUEBA-001',
      customerName: 'Cliente de prueba',
      dinerName: '',
      driverName: widget.employeeName,
      deliveredAt: DateTime.now().toIso8601String(),
      totalReal: 1050,
      paymentMethod: 'EFECTIVO',
      copies: 1,
      items: [
        PrinterTicketItem(
          qtyReal: 30,
          description: 'BOLSA 5 KG. GOURMET',
          unitPrice: 35,
          amount: 1050,
        ),
      ],
    );

    if (!mounted) return;

    setState(() {
      _busy = false;

      if (ok) {
        _statusText = 'Impresión de prueba enviada correctamente.';
      } else {
        _errorText = _shortError(_printer.lastError ??
            'No se pudo imprimir. Este dispositivo puede no ser compatible.');
        _statusText = 'No se pudo imprimir.';
      }
    });

    _show(
      ok
          ? 'Prueba de impresión enviada.'
          : (_shortError(_printer.lastError ?? 'No se pudo imprimir.')),
    );
  }

  Future<void> _refreshState() async {
    await _restoreSavedDevice();
    await _syncInitialState();
  }

  void _show(String msg) {
    if (!mounted) return;

    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(msg)),
    );
  }

  Color _statusColor() {
    final s = (_statusText ?? '').toLowerCase();

    if (s.contains('conectado') ||
        s.contains('conectada') ||
        s.contains('correctamente')) {
      return _success;
    }

    if (s.contains('buscando') ||
        s.contains('escaneando') ||
        s.contains('búsqueda') ||
        s.contains('reconectando')) {
      return _warning;
    }

    if (s.contains('desconectado') ||
        s.contains('desconectada') ||
        s.contains('sin dispositivo')) {
      return Colors.white70;
    }

    if (s.contains('error') || s.contains('no se pudo')) {
      return _danger;
    }

    return _accent;
  }

  Widget _buildSavedDeviceCard() {
    if (_savedAddress == null || _savedAddress!.isEmpty) {
      return const SizedBox.shrink();
    }

    final isCurrentSelected =
        _selected != null && (_selected!.address ?? '') == (_savedAddress ?? '');

    return Container(
      width: double.infinity,
      margin: const EdgeInsets.only(top: 10),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(14),
        color: _accent.withOpacity(0.10),
        border: Border.all(color: _accent.withOpacity(0.22)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Último dispositivo guardado',
            style: TextStyle(
              color: Colors.white,
              fontWeight: FontWeight.w900,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            _savedName ?? 'Dispositivo Bluetooth',
            style: const TextStyle(
              color: Colors.white,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            _savedAddress!,
            style: TextStyle(
              color: Colors.white.withOpacity(0.68),
              fontSize: 12,
            ),
          ),
          if (isCurrentSelected) ...[
            const SizedBox(height: 8),
            Text(
              'Actualmente seleccionado.',
              style: TextStyle(
                color: Colors.white.withOpacity(0.78),
                fontSize: 12,
                fontWeight: FontWeight.w700,
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildTopPanel() {
    return _GlassCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Dispositivos Bluetooth',
            style: TextStyle(
              color: Colors.white,
              fontSize: 18,
              fontWeight: FontWeight.w900,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            'Primero vincula la impresora desde los Ajustes Bluetooth del celular. Después presiona Buscar para verla aquí y conectarte.',
            style: TextStyle(
              color: Colors.white.withOpacity(0.72),
              fontSize: 12.5,
              fontWeight: FontWeight.w600,
              height: 1.25,
            ),
          ),
          const SizedBox(height: 12),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              _StatusChip(
                label: _connected ? 'Conectado' : 'Sin conexión',
                color: _connected ? _success : Colors.white54,
              ),
              _StatusChip(
                label: _scanning ? 'Buscando...' : 'Bluetooth',
                color: _scanning ? _warning : _accent,
              ),
              _StatusChip(
                label: _busy ? 'Procesando...' : 'Listo',
                color: _busy ? _warning : Colors.white54,
              ),
            ],
          ),
          const SizedBox(height: 12),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(14),
              color: _statusColor().withOpacity(0.12),
              border: Border.all(
                color: _statusColor().withOpacity(0.28),
              ),
            ),
            child: Row(
              children: [
                Container(
                  height: 10,
                  width: 10,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: _connected ? _success : _statusColor(),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    _statusText ?? 'Sin estado',
                    style: const TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ),
              ],
            ),
          ),
          if (_errorText != null) ...[
            const SizedBox(height: 10),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(14),
                color: _danger.withOpacity(0.12),
                border: Border.all(color: _danger.withOpacity(0.25)),
              ),
              child: Text(
                _errorText!,
                style: const TextStyle(
                  color: Colors.white,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          ],
          if (_selected != null) ...[
            const SizedBox(height: 12),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(14),
                color: _success.withOpacity(0.10),
                border: Border.all(color: _success.withOpacity(0.22)),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Dispositivo conectado',
                    style: TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    _selected?.name ?? 'Sin nombre',
                    style: const TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    _selected?.address ?? 'Sin dirección',
                    style: TextStyle(
                      color: Colors.white.withOpacity(0.68),
                      fontSize: 12,
                    ),
                  ),
                ],
              ),
            ),
          ],
          _buildSavedDeviceCard(),
          const SizedBox(height: 14),
          Row(
            children: [
              Expanded(
                child: ElevatedButton.icon(
                  onPressed: (_busy || _scanning) ? null : _startScan,
                  icon: const Icon(Icons.bluetooth_searching),
                  label: Text(_scanning ? 'Buscando...' : 'Buscar'),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: _accent,
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 13),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(14),
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: ElevatedButton.icon(
                  onPressed: (_busy || !_scanning) ? null : _stopScan,
                  icon: const Icon(Icons.stop_circle_outlined),
                  label: const Text('Detener'),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Colors.white.withOpacity(0.12),
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 13),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(14),
                    ),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: ElevatedButton.icon(
                  onPressed: (_busy || !_connected) ? null : _disconnect,
                  icon: const Icon(Icons.link_off),
                  label: const Text('Desconectar'),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Colors.white.withOpacity(0.12),
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 13),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(14),
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: ElevatedButton.icon(
                  onPressed: (_busy || !_connected) ? null : _testPrint,
                  icon: const Icon(Icons.print),
                  label: const Text('Prueba impresión'),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: _burgundy,
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 13),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(14),
                    ),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          SizedBox(
            width: double.infinity,
            child: OutlinedButton.icon(
              onPressed: _busy ? null : _refreshState,
              icon: const Icon(Icons.refresh),
              label: const Text('Actualizar estado'),
              style: OutlinedButton.styleFrom(
                foregroundColor: Colors.white,
                side: BorderSide(color: Colors.white.withOpacity(0.18)),
                padding: const EdgeInsets.symmetric(vertical: 13),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(14),
                ),
              ),
            ),
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: ElevatedButton.icon(
                  onPressed: _busy ? null : _changePrinter,
                  icon: const Icon(Icons.swap_horiz),
                  label: const Text('Cambiar impresora'),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: _warning,
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 13),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(14),
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: (_busy ||
                          (_savedAddress == null || _savedAddress!.isEmpty))
                      ? null
                      : _forgetSavedPrinter,
                  icon: const Icon(Icons.delete_outline),
                  label: const Text('Olvidar guardada'),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: Colors.white,
                    side: BorderSide(color: _danger.withOpacity(0.45)),
                    padding: const EdgeInsets.symmetric(vertical: 13),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(14),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildDeviceList() {
    if (_devices.isEmpty) {
      return _GlassCard(
        child: Center(
          child: Text(
            _scanning
                ? 'Buscando dispositivos Bluetooth vinculados...'
                : 'No hay dispositivos detectados todavía. Primero vincula la impresora desde Ajustes Bluetooth y luego pulsa "Buscar".',
            textAlign: TextAlign.center,
            style: const TextStyle(
              color: Colors.white70,
              fontWeight: FontWeight.w600,
            ),
          ),
        ),
      );
    }

    final cards = <Widget>[];

    for (int i = 0; i < _devices.length; i++) {
      final thermal.BluetoothDevice d = _devices[i];
      final bool isSelected = (_selected?.address ?? '') == (d.address ?? '');
      final bool isSaved = (_savedAddress ?? '').isNotEmpty &&
          (_savedAddress ?? '') == (d.address ?? '');

      if (i > 0) {
        cards.add(const SizedBox(height: 10));
      }

      cards.add(
        _GlassCard(
          child: Row(
            children: [
              Container(
                height: 46,
                width: 46,
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(14),
                  color: Colors.white.withOpacity(0.08),
                  border: Border.all(
                    color: Colors.white.withOpacity(0.10),
                  ),
                ),
                child: Icon(
                  isSelected
                      ? Icons.bluetooth_connected
                      : isSaved
                          ? Icons.bookmark
                          : Icons.bluetooth,
                  color: Colors.white,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      d.name ?? 'Sin nombre',
                      style: const TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      d.address ?? 'Sin dirección',
                      style: TextStyle(
                        color: Colors.white.withOpacity(0.70),
                        fontSize: 12,
                      ),
                    ),
                    if (isSaved) ...[
                      const SizedBox(height: 4),
                      Text(
                        'Guardado anteriormente',
                        style: TextStyle(
                          color: Colors.white.withOpacity(0.78),
                          fontSize: 11.5,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
              ElevatedButton(
                onPressed: _busy ? null : () => _connect(d),
                style: ElevatedButton.styleFrom(
                  backgroundColor: isSelected && _connected ? _success : _accent,
                  foregroundColor: Colors.white,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                ),
                child: Text(isSelected && _connected ? 'Conectado' : 'Conectar'),
              ),
            ],
          ),
        ),
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: cards,
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: _navy,
      appBar: AppBar(
        backgroundColor: _navy,
        foregroundColor: Colors.white,
        elevation: 0,
        title: const Text('Bluetooth'),
        actions: [
          IconButton(
            onPressed: (_busy || _scanning) ? null : _startScan,
            tooltip: 'Buscar dispositivos',
            icon: const Icon(Icons.search),
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
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(16),
            physics: const BouncingScrollPhysics(),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                _buildTopPanel(),
                const SizedBox(height: 14),
                _buildDeviceList(),
                const SizedBox(height: 24),
              ],
            ),
          ),
        ),
      ),
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

class _StatusChip extends StatelessWidget {
  final String label;
  final Color color;

  const _StatusChip({
    required this.label,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
      decoration: BoxDecoration(
        color: color.withOpacity(0.15),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: color.withOpacity(0.30)),
      ),
      child: Text(
        label,
        style: const TextStyle(
          color: Colors.white,
          fontSize: 11.5,
          fontWeight: FontWeight.w800,
        ),
      ),
    );
  }
}