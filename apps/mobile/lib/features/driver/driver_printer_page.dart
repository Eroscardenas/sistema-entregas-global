import 'dart:async';

import 'package:flutter/material.dart';
import 'package:bluetooth_print_plus/bluetooth_print_plus.dart' hide Alignment;
import 'package:shared_preferences/shared_preferences.dart';

import 'package:mobile/services/printer_service.dart';

class DriverPrinterPage extends StatefulWidget {
  final String driverName;

  const DriverPrinterPage({
    super.key,
    required this.driverName,
  });

  @override
  State<DriverPrinterPage> createState() => _DriverPrinterPageState();
}

class _DriverPrinterPageState extends State<DriverPrinterPage> {
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

  List<BluetoothDevice> _devices = <BluetoothDevice>[];
  bool _scanning = false;
  bool _busy = false;
  bool _connected = false;
  bool _autoReconnectTried = false;

  String? _statusText;
  String? _errorText;
  BluetoothDevice? _selected;
  String? _savedAddress;
  String? _savedName;

  StreamSubscription<List<BluetoothDevice>>? _scanSub;
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

  void _initStreams() {
    _scanSub = _printer.scanResults.listen(
      (List<BluetoothDevice> event) async {
        if (!mounted) return;

        final devices = List<BluetoothDevice>.from(event);

        setState(() {
          _devices = devices;
        });

        await _tryAutoReconnectIfPossible();
      },
      onError: (Object e) {
        if (!mounted) return;
        setState(() {
          _errorText = 'Error leyendo dispositivos: $e';
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
            _statusText = 'Buscando dispositivos Bluetooth cercanos...';
            _errorText = null;
            _autoReconnectTried = false;
          } else {
            _statusText = _devices.isEmpty
                ? 'No se encontraron dispositivos Bluetooth.'
                : 'Búsqueda finalizada. Puedes conectarte a cualquier dispositivo detectado.';
          }
        });
      },
      onError: (Object e) {
        if (!mounted) return;
        setState(() {
          _scanning = false;
          _errorText = 'Error de escaneo Bluetooth: $e';
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
          _statusText = 'Estado de conexión: $event';

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
          _errorText = 'Error de conexión Bluetooth: $e';
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

  Future<void> _saveSelectedDevice(BluetoothDevice device) async {
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
        _selected = BluetoothDevice(
          _savedName ?? 'Dispositivo guardado',
          _savedAddress!,
        );
        _statusText = 'Dispositivo guardado: ${_selected?.name ?? 'Bluetooth'}';
      });
    }
  }

  Future<void> _tryAutoReconnectIfPossible() async {
    if (_autoReconnectTried) return;
    if (_busy) return;
    if (_connected) return;
    if (_savedAddress == null || _savedAddress!.isEmpty) return;
    if (_devices.isEmpty) return;

    BluetoothDevice? matched;

    for (final d in _devices) {
      if ((d.address ?? '') == _savedAddress) {
        matched = d;
        break;
      }
    }

    if (matched == null) return;

    _autoReconnectTried = true;
    await _connect(matched, silent: true, autoReconnect: true);
  }

  Future<void> _startScan() async {
    if (_busy) return;

    setState(() {
      _busy = true;
      _devices = <BluetoothDevice>[];
      _statusText = 'Iniciando búsqueda de dispositivos...';
      _errorText = null;
      _autoReconnectTried = false;
    });

    final ok = await _printer.startScan(timeout: const Duration(seconds: 10));

    if (!mounted) return;

    setState(() {
      _busy = false;

      if (!ok) {
        _errorText =
            _printer.lastError ?? 'No se pudo iniciar la búsqueda Bluetooth.';
        _statusText = 'Error al buscar dispositivos.';
      }
    });

    if (!ok) {
      _show(_printer.lastError ?? 'No se pudo buscar dispositivos Bluetooth.');
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
        _errorText = _printer.lastError ?? 'No se pudo detener el escaneo.';
      }
    });

    if (!ok) {
      _show(_printer.lastError ?? 'No se pudo detener el escaneo.');
    }
  }

  Future<void> _connect(
    BluetoothDevice device, {
    bool silent = false,
    bool autoReconnect = false,
  }) async {
    if (_busy) return;

    setState(() {
      _busy = true;
      _errorText = null;
      _statusText = autoReconnect
          ? 'Reconectando a ${device.name ?? 'dispositivo Bluetooth'}...'
          : 'Conectando a ${device.name ?? 'dispositivo Bluetooth'}...';
    });

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
        _errorText = _printer.lastError ?? 'No se pudo conectar la impresora.';
      }
    });

    if (connected) {
      await _saveSelectedDevice(device);
      if (!silent) {
        _show('Dispositivo Bluetooth conectado correctamente.');
      }
    } else if (!silent) {
      _show(_printer.lastError ?? 'No se pudo conectar la impresora.');
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
        _errorText = _printer.lastError ?? 'No se pudo desconectar.';
        _statusText = 'No se pudo desconectar.';
      }
    });

    _show(
      ok
          ? 'Dispositivo desconectado.'
          : (_printer.lastError ?? 'No se pudo desconectar.'),
    );
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
      driverName: widget.driverName,
      deliveredAt: DateTime.now().toIso8601String(),
      totalReal: 1050,
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
        _errorText = _printer.lastError ??
            'No se pudo imprimir. Este dispositivo puede no ser compatible.';
        _statusText = 'No se pudo imprimir.';
      }
    });

    _show(
      ok
          ? 'Prueba de impresión enviada.'
          : (_printer.lastError ?? 'No se pudo imprimir.'),
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
            'Busca dispositivos cercanos, conéctate al que necesites, guarda el último usado y realiza una prueba de impresión si es compatible.',
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
                ? 'Buscando dispositivos Bluetooth cercanos...'
                : 'No hay dispositivos detectados todavía. Pulsa "Buscar" para iniciar una búsqueda.',
            textAlign: TextAlign.center,
            style: const TextStyle(
              color: Colors.white70,
              fontWeight: FontWeight.w600,
            ),
          ),
        ),
      );
    }

    return ListView.separated(
      itemCount: _devices.length,
      separatorBuilder: (_, __) => const SizedBox(height: 10),
      itemBuilder: (_, i) {
        final BluetoothDevice d = _devices[i];
        final bool isSelected = (_selected?.address ?? '') == (d.address ?? '');
        final bool isSaved = (_savedAddress ?? '').isNotEmpty &&
            (_savedAddress ?? '') == (d.address ?? '');

        return _GlassCard(
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
                  backgroundColor: isSelected ? _success : _accent,
                  foregroundColor: Colors.white,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                ),
                child: Text(isSelected ? 'Conectado' : 'Conectar'),
              ),
            ],
          ),
        );
      },
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
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              children: [
                _buildTopPanel(),
                const SizedBox(height: 14),
                Expanded(child: _buildDeviceList()),
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