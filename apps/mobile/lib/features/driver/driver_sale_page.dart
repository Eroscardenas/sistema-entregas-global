import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:url_launcher/url_launcher.dart';

class DriverSalePage extends StatefulWidget {
  final String driverId;
  final String driverName;
  final String? assignmentId;
  final String? routeId;

  const DriverSalePage({
    super.key,
    required this.driverId,
    required this.driverName,
    required this.assignmentId,
    required this.routeId,
  });

  @override
  State<DriverSalePage> createState() => _DriverSalePageState();
}

class _DriverSalePageState extends State<DriverSalePage> {
  static const _navy = Color(0xFF0A1A2F);
  static const _royal = Color(0xFF1E4A7A);
  static const _accent = Color(0xFF4DADFF);
  static const _burgundy = Color(0xFF852838);
  static const _success = Color(0xFF10B981);
  static const _warning = Color(0xFFF59E0B);
  static const _danger = Color(0xFFEF4444);

static const String _apiBase =
    'https://sistema-entregas-global.vercel.app';

  final _searchCtrl = TextEditingController();

  bool _loadingCustomers = false;
  bool _loadingProducts = false;
  bool _saving = false;

  String? _error;
  Map<String, dynamic>? _selectedCustomer;

  List<Map<String, dynamic>> _customers = [];
  List<Map<String, dynamic>> _products = [];

  final Map<String, int> _qtyByProduct = {};
  String _paymentMethod = 'EFECTIVO';

  double get _total {
    double acc = 0;
    for (final p in _products) {
      final id = (p['product_id'] ?? '').toString();
      final qty = _qtyByProduct[id] ?? 0;
      final price = NumberParser.toDouble(p['precio']);
      acc += qty * price;
    }
    return acc;
  }

  int get _totalQty {
    return _qtyByProduct.values.fold(0, (acc, value) => acc + value);
  }

  bool get _canRegister {
    return !_saving && !_loadingProducts && _selectedCustomer != null && _totalQty > 0;
  }

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
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

  Future<void> _openCustomerMaps() async {
    final url = (_selectedCustomer?['maps_url'] ?? '').toString().trim();

    if (!_isValidMapsUrl(url)) {
      _showMsg('Este cliente no tiene link válido de Maps.');
      return;
    }

    try {
      final opened = await launchUrl(
        Uri.parse(url),
        mode: LaunchMode.externalApplication,
      );

      if (!opened) {
        _showMsg('No se pudo abrir Maps.');
      }
    } catch (e) {
      _showMsg('No se pudo abrir Maps: $e');
    }
  }

  String _locationLabel(Map<String, dynamic> row) {
    final url = (row['maps_url'] ?? '').toString().trim();
    return url.isEmpty ? 'Sin ubicación' : 'Ubicación disponible';
  }

  Color _availableColor(int available) {
    if (available <= 0) return _danger;
    if (available <= 5) return _warning;
    return _success;
  }

  String _availableLabel(int available) {
    if (available <= 0) return 'Sin stock';
    if (available <= 5) return 'Stock bajo';
    return 'Disponible';
  }

  Future<Map<String, dynamic>> _readJson(http.Response res) async {
    final decoded = jsonDecode(res.body);
    if (decoded is! Map<String, dynamic>) {
      throw Exception('Respuesta inválida del servidor');
    }
    return decoded;
  }

  Future<void> _searchCustomers() async {
    final q = _searchCtrl.text.trim();

    if (q.length < 2) {
      setState(() {
        _customers = [];
        _error = null;
      });
      return;
    }

    setState(() {
      _loadingCustomers = true;
      _error = null;
    });

    try {
      final uri = Uri.parse('$_apiBase/api/driver-sales/customers').replace(
        queryParameters: {'q': q},
      );

      final res = await http.get(uri);
      final json = await _readJson(res);

      if (res.statusCode >= 400 || json['ok'] != true) {
        throw Exception(json['error'] ?? 'Error buscando clientes');
      }

      if (!mounted) return;

      setState(() {
        _customers = List<Map<String, dynamic>>.from(json['data'] ?? []);
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString().replaceFirst('Exception: ', '');
      });
    } finally {
      if (mounted) {
        setState(() => _loadingCustomers = false);
      }
    }
  }

  Future<void> _selectCustomer(Map<String, dynamic> customer) async {
    setState(() {
      _selectedCustomer = customer;
      _customers = [];
      _products = [];
      _qtyByProduct.clear();
      _error = null;
      _loadingProducts = true;
    });

    try {
      final customerId = (customer['id'] ?? '').toString();

      final uri = Uri.parse('$_apiBase/api/driver-sales/costumer-products').replace(
        queryParameters: {
          'customer_id': customerId,
          'driver_id': widget.driverId,
        },
      );

      final res = await http.get(uri);
      final json = await _readJson(res);

      if (res.statusCode >= 400 || json['ok'] != true) {
        throw Exception(json['error'] ?? 'Error cargando productos');
      }

      final rows = List<Map<String, dynamic>>.from(json['data'] ?? []);

      rows.sort((a, b) {
        final avA = NumberParser.toInt(a['available_qty']);
        final avB = NumberParser.toInt(b['available_qty']);
        if (avA != avB) return avB.compareTo(avA);
        return (a['nombre'] ?? '').toString().compareTo((b['nombre'] ?? '').toString());
      });

      if (!mounted) return;

      setState(() {
        _products = rows;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString().replaceFirst('Exception: ', '');
      });
    } finally {
      if (mounted) {
        setState(() => _loadingProducts = false);
      }
    }
  }

  void _setQty(Map<String, dynamic> product, int qty) {
    final productId = (product['product_id'] ?? '').toString();
    final available = NumberParser.toInt(product['available_qty']);

    if (qty < 0) qty = 0;
    if (qty > available) qty = available;

    setState(() {
      if (qty <= 0) {
        _qtyByProduct.remove(productId);
      } else {
        _qtyByProduct[productId] = qty;
      }
    });
  }

  Future<void> _refreshSelectedCustomerProducts() async {
    final selected = _selectedCustomer;
    if (selected == null) return;
    await _selectCustomer(selected);
  }

  Future<void> _registerSale() async {
    if (_selectedCustomer == null) {
      _showMsg('Selecciona un cliente.');
      return;
    }

    final cleanDriverId = widget.driverId.trim();
    final cleanAssignmentId = (widget.assignmentId ?? '').trim();
    final cleanRouteId = (widget.routeId ?? '').trim();

    if (cleanDriverId.isEmpty) {
      _showMsg('No se pudo identificar el chofer.');
      return;
    }

    if (cleanAssignmentId.isEmpty) {
      _showMsg('No hay asignación activa para registrar la venta en ruta.');
      return;
    }

    final items = <Map<String, dynamic>>[];

    for (final entry in _qtyByProduct.entries) {
      if (entry.value <= 0) continue;

      final product = _products.firstWhere(
        (p) => (p['product_id'] ?? '').toString() == entry.key,
        orElse: () => <String, dynamic>{},
      );

      if (product.isEmpty) continue;

      final available = NumberParser.toInt(product['available_qty']);
      if (entry.value > available) {
        _showMsg('La cantidad supera el stock disponible.');
        return;
      }

      items.add({
        'product_id': entry.key,
        'quantity': entry.value,
      });
    }

    if (items.isEmpty) {
      _showMsg('Agrega al menos un producto.');
      return;
    }

    final payload = <String, dynamic>{
      'driver_id': cleanDriverId,
      'customer_id': _selectedCustomer!['id'],
      'assignment_id': cleanAssignmentId,
      'route_id': cleanRouteId.isEmpty ? null : cleanRouteId,
      'payment_method': _paymentMethod,
      'items': items,
    };

    debugPrint('VENTA DRIVER: $cleanDriverId');
    debugPrint('VENTA ASSIGNMENT: $cleanAssignmentId');
    debugPrint('VENTA ROUTE: ${cleanRouteId.isEmpty ? 'null' : cleanRouteId}');
    debugPrint('VENTA PAYLOAD: ${jsonEncode(payload)}');

    setState(() {
      _saving = true;
      _error = null;
    });

    try {
      final uri = Uri.parse('$_apiBase/api/driver-sales');

      final res = await http.post(
        uri,
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode(payload),
      );

      debugPrint('VENTA STATUS: ${res.statusCode}');
      debugPrint('VENTA BODY: ${res.body}');

      final json = await _readJson(res);

      if (res.statusCode >= 400 || json['ok'] != true) {
        throw Exception(json['error'] ?? 'Error registrando venta');
      }

      if (!mounted) return;

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Venta registrada correctamente.')),
      );

      Navigator.of(context).pop(true);
    } catch (e) {
      debugPrint('VENTA ERROR: $e');

      if (!mounted) return;

      setState(() {
        _error = e.toString().replaceFirst('Exception: ', '');
      });

      await _refreshSelectedCustomerProducts();
    } finally {
      if (mounted) {
        setState(() => _saving = false);
      }
    }
  }

  void _showMsg(String msg) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(msg)),
    );
  }

  String _money(num n) => n.toStringAsFixed(2);

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: _navy,
      appBar: AppBar(
        backgroundColor: _navy,
        foregroundColor: Colors.white,
        elevation: 0,
        title: const Text('Venta en ruta'),
        actions: [
          if (_selectedCustomer != null)
            IconButton(
              onPressed: _loadingProducts || _saving ? null : _refreshSelectedCustomerProducts,
              icon: const Icon(Icons.refresh),
              tooltip: 'Actualizar stock',
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
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              _GlassCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      widget.driverName,
                      style: const TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.w900,
                        fontSize: 16,
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      'Registra una venta extra durante tu ruta.',
                      style: TextStyle(
                        color: Colors.white.withOpacity(0.72),
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 14),
              _GlassCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Row(
                      children: [
                        Icon(Icons.info_outline, color: _accent),
                        SizedBox(width: 8),
                        Text(
                          '¿Cómo funciona?',
                          style: TextStyle(
                            color: Colors.white,
                            fontWeight: FontWeight.w900,
                            fontSize: 16,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 10),
                    Text(
                      '1. Busca y selecciona un cliente.\n'
                      '2. Elige los productos que desea comprar.\n'
                      '3. Indica la cantidad según tu stock disponible.\n'
                      '4. Selecciona el método de pago.\n'
                      '5. Presiona "Registrar venta".\n\n'
                      'La venta se agregará automáticamente a tu ruta y quedará visible para administración.',
                      style: TextStyle(
                        color: Colors.white.withOpacity(0.72),
                        height: 1.4,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 14),
              _GlassCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'Cliente',
                      style: TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                    const SizedBox(height: 10),
                    TextField(
                      controller: _searchCtrl,
                      style: const TextStyle(color: Colors.white),
                      decoration: InputDecoration(
                        hintText: 'Buscar cliente...',
                        hintStyle: TextStyle(color: Colors.white.withOpacity(0.45)),
                        prefixIcon: const Icon(Icons.search, color: Colors.white70),
                        filled: true,
                        fillColor: Colors.white.withOpacity(0.08),
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(14),
                          borderSide: BorderSide(color: Colors.white.withOpacity(0.16)),
                        ),
                        enabledBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(14),
                          borderSide: BorderSide(color: Colors.white.withOpacity(0.16)),
                        ),
                        focusedBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(14),
                          borderSide: const BorderSide(color: _accent),
                        ),
                      ),
                      onSubmitted: (_) => _searchCustomers(),
                    ),
                    const SizedBox(height: 10),
                    SizedBox(
                      width: double.infinity,
                      child: ElevatedButton.icon(
                        onPressed: _loadingCustomers ? null : _searchCustomers,
                        icon: _loadingCustomers
                            ? const SizedBox(
                                width: 16,
                                height: 16,
                                child: CircularProgressIndicator(strokeWidth: 2),
                              )
                            : const Icon(Icons.search),
                        label: const Text('Buscar'),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: _accent,
                          foregroundColor: Colors.white,
                          padding: const EdgeInsets.symmetric(vertical: 13),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                        ),
                      ),
                    ),
                    if (_selectedCustomer != null) ...[
                      const SizedBox(height: 12),
                      _SelectedBox(
                        title: (_selectedCustomer!['nombre'] ?? 'Cliente').toString(),
                        subtitle: _locationLabel(_selectedCustomer!),
                      ),
                      const SizedBox(height: 10),
                      SizedBox(
                        width: double.infinity,
                        child: ElevatedButton.icon(
                          onPressed: _isValidMapsUrl(_selectedCustomer?['maps_url'])
                              ? _openCustomerMaps
                              : null,
                          icon: const Icon(Icons.map_outlined),
                          label: Text(
                            _isValidMapsUrl(_selectedCustomer?['maps_url'])
                                ? 'Abrir ubicación en Maps'
                                : 'Cliente sin ubicación de Maps',
                          ),
                          style: ElevatedButton.styleFrom(
                            backgroundColor: _success,
                            foregroundColor: Colors.white,
                            disabledBackgroundColor: Colors.white.withOpacity(0.12),
                            disabledForegroundColor: Colors.white.withOpacity(0.45),
                            padding: const EdgeInsets.symmetric(vertical: 13),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(14),
                            ),
                          ),
                        ),
                      ),
                    ],
                    if (_customers.isNotEmpty) ...[
                      const SizedBox(height: 12),
                      ..._customers.map(
                        (c) => ListTile(
                          contentPadding: EdgeInsets.zero,
                          leading: Icon(
                            (c['maps_url'] ?? '').toString().trim().isEmpty
                                ? Icons.location_off_outlined
                                : Icons.location_on_outlined,
                            color: Colors.white70,
                          ),
                          title: Text(
                            (c['nombre'] ?? 'Cliente').toString(),
                            style: const TextStyle(
                              color: Colors.white,
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                          subtitle: Text(
                            _locationLabel(c),
                            style: TextStyle(color: Colors.white.withOpacity(0.65)),
                          ),
                          trailing: const Icon(Icons.chevron_right, color: Colors.white),
                          onTap: () => _selectCustomer(c),
                        ),
                      ),
                    ],
                  ],
                ),
              ),
              const SizedBox(height: 14),
              if (_loadingProducts)
                const Center(
                  child: Padding(
                    padding: EdgeInsets.all(20),
                    child: CircularProgressIndicator(color: _accent),
                  ),
                )
              else if (_selectedCustomer != null && _products.isEmpty)
                _GlassCard(
                  child: Text(
                    'Este cliente no tiene productos activos o no hay stock disponible.',
                    style: TextStyle(
                      color: Colors.white.withOpacity(0.75),
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                )
              else if (_products.isNotEmpty)
                _GlassCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          const Expanded(
                            child: Text(
                              'Productos',
                              style: TextStyle(
                                color: Colors.white,
                                fontWeight: FontWeight.w900,
                              ),
                            ),
                          ),
                          Text(
                            'Total: $_totalQty pzas',
                            style: TextStyle(
                              color: Colors.white.withOpacity(0.70),
                              fontWeight: FontWeight.w800,
                              fontSize: 12,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 8),
                      ..._products.map((p) {
                        final productId = (p['product_id'] ?? '').toString();
                        final qty = _qtyByProduct[productId] ?? 0;
                        final available = NumberParser.toInt(p['available_qty']);
                        final assigned = NumberParser.toInt(p['assigned_qty']);
                        final used = NumberParser.toInt(p['used_qty']);
                        final price = NumberParser.toDouble(p['precio']);
                        final availableColor = _availableColor(available);

                        return Container(
                          margin: const EdgeInsets.only(top: 10),
                          padding: const EdgeInsets.all(12),
                          decoration: BoxDecoration(
                            color: Colors.white.withOpacity(0.07),
                            borderRadius: BorderRadius.circular(16),
                            border: Border.all(color: Colors.white.withOpacity(0.12)),
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                children: [
                                  Expanded(
                                    child: Text(
                                      (p['nombre'] ?? 'Producto').toString(),
                                      style: const TextStyle(
                                        color: Colors.white,
                                        fontWeight: FontWeight.w900,
                                      ),
                                    ),
                                  ),
                                  Container(
                                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                                    decoration: BoxDecoration(
                                      color: availableColor.withOpacity(0.14),
                                      borderRadius: BorderRadius.circular(999),
                                      border: Border.all(color: availableColor.withOpacity(0.30)),
                                    ),
                                    child: Text(
                                      _availableLabel(available),
                                      style: TextStyle(
                                        color: availableColor,
                                        fontWeight: FontWeight.w900,
                                        fontSize: 11,
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 4),
                              Text(
                                'Precio: \$${_money(price)} • Disponible: $available',
                                style: TextStyle(
                                  color: Colors.white.withOpacity(0.70),
                                  fontWeight: FontWeight.w700,
                                  fontSize: 12,
                                ),
                              ),
                              if (assigned > 0 || used > 0) ...[
                                const SizedBox(height: 3),
                                Text(
                                  'Cargado: $assigned • Usado: $used',
                                  style: TextStyle(
                                    color: Colors.white.withOpacity(0.52),
                                    fontWeight: FontWeight.w600,
                                    fontSize: 11,
                                  ),
                                ),
                              ],
                              const SizedBox(height: 10),
                              Row(
                                children: [
                                  IconButton(
                                    onPressed: qty <= 0 || _saving ? null : () => _setQty(p, qty - 1),
                                    icon: const Icon(Icons.remove_circle_outline),
                                    color: Colors.white,
                                  ),
                                  Expanded(
                                    child: Center(
                                      child: Text(
                                        '$qty',
                                        style: const TextStyle(
                                          color: Colors.white,
                                          fontWeight: FontWeight.w900,
                                          fontSize: 20,
                                        ),
                                      ),
                                    ),
                                  ),
                                  IconButton(
                                    onPressed: qty >= available || available <= 0 || _saving
                                        ? null
                                        : () => _setQty(p, qty + 1),
                                    icon: const Icon(Icons.add_circle_outline),
                                    color: Colors.white,
                                  ),
                                ],
                              ),
                            ],
                          ),
                        );
                      }),
                    ],
                  ),
                ),
              const SizedBox(height: 14),
              if (_products.isNotEmpty)
                _GlassCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'Pago',
                        style: TextStyle(
                          color: Colors.white,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                      RadioListTile<String>(
                        value: 'EFECTIVO',
                        groupValue: _paymentMethod,
                        activeColor: _accent,
                        title: const Text('Efectivo', style: TextStyle(color: Colors.white)),
                        onChanged: _saving ? null : (v) => setState(() => _paymentMethod = v ?? 'EFECTIVO'),
                      ),
                      RadioListTile<String>(
                        value: 'CREDITO',
                        groupValue: _paymentMethod,
                        activeColor: _accent,
                        title: const Text('Crédito', style: TextStyle(color: Colors.white)),
                        onChanged: _saving ? null : (v) => setState(() => _paymentMethod = v ?? 'CREDITO'),
                      ),
                      const Divider(color: Colors.white24),
                      Row(
                        children: [
                          const Expanded(
                            child: Text(
                              'Total',
                              style: TextStyle(
                                color: Colors.white,
                                fontWeight: FontWeight.w900,
                                fontSize: 18,
                              ),
                            ),
                          ),
                          Text(
                            '\$${_money(_total)}',
                            style: const TextStyle(
                              color: Colors.white,
                              fontWeight: FontWeight.w900,
                              fontSize: 20,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 14),
                      SizedBox(
                        width: double.infinity,
                        child: ElevatedButton.icon(
                          onPressed: _canRegister ? _registerSale : null,
                          icon: _saving
                              ? const SizedBox(
                                  width: 16,
                                  height: 16,
                                  child: CircularProgressIndicator(strokeWidth: 2),
                                )
                              : const Icon(Icons.check_circle),
                          label: Text(_saving ? 'Registrando...' : 'Registrar venta'),
                          style: ElevatedButton.styleFrom(
                            backgroundColor: _burgundy,
                            foregroundColor: Colors.white,
                            disabledBackgroundColor: Colors.white.withOpacity(0.12),
                            disabledForegroundColor: Colors.white.withOpacity(0.40),
                            padding: const EdgeInsets.symmetric(vertical: 14),
                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              if (_error != null) ...[
                const SizedBox(height: 14),
                _GlassCard(
                  child: Text(
                    _error!,
                    style: const TextStyle(
                      color: Colors.redAccent,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class NumberParser {
  static double toDouble(dynamic v) {
    if (v == null) return 0;
    if (v is num) return v.toDouble();
    return double.tryParse(v.toString()) ?? 0;
  }

  static int toInt(dynamic v) {
    if (v == null) return 0;
    if (v is num) return v.toInt();
    return int.tryParse(v.toString()) ?? 0;
  }
}

class _SelectedBox extends StatelessWidget {
  final String title;
  final String subtitle;

  const _SelectedBox({
    required this.title,
    required this.subtitle,
  });

  @override
  Widget build(BuildContext context) {
    final hasLocation = subtitle == 'Ubicación disponible';

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.green.withOpacity(0.12),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: Colors.green.withOpacity(0.24)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(
            hasLocation ? Icons.location_on_outlined : Icons.location_off_outlined,
            color: Colors.white70,
            size: 20,
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: const TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.w900,
                  ),
                ),
                if (subtitle.trim().isNotEmpty) ...[
                  const SizedBox(height: 3),
                  Text(
                    subtitle,
                    style: TextStyle(color: Colors.white.withOpacity(0.70)),
                  ),
                ],
              ],
            ),
          ),
        ],
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