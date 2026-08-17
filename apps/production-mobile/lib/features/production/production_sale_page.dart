import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:http/http.dart' as http;
import 'package:mobile/services/printer_service.dart';

enum ProductionSaleMode {
  customer,
  public,
}

class ProductionSalePage extends StatefulWidget {
  final String employeeId;
  final String employeeName;
  final ProductionSaleMode initialMode;

  const ProductionSalePage({
super.key,
    required this.employeeId,
    required this.employeeName,
this.initialMode = ProductionSaleMode.customer,
  });

  @override
State<ProductionSalePage> createState() => _ProductionSalePageState();
}

class _ProductionSalePageState extends State<ProductionSalePage> {
  static const Color _navy = Color(0xFF0A1A2F);
  static const Color _royal = Color(0xFF1E4A7A);
  static const Color _accent = Color(0xFF4DADFF);
  static const Color _green = Color(0xFF10B981);
  static const Color _wine = Color(0xFF852838);
  static const Color _danger = Color(0xFFEF4444);
  static const Color _warning = Color(0xFFF59E0B);

  static const String _apiBase = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'https://sistema-entregas-global.vercel.app',
  );

  static const Duration _requestTimeout = Duration(seconds: 25);

  final TextEditingController _customerSearchCtrl =
TextEditingController();

  final TextEditingController _publicCustomerNameCtrl =
TextEditingController();

bool _loadingCustomers = false;
bool _loadingProducts = false;
bool _saving = false;

String? _error;

  late ProductionSaleMode _mode;

Map<String, dynamic>? _selectedCustomer;

List<Map<String, dynamic>> _customers = [];
List<Map<String, dynamic>> _products = [];

  final Map<String, int> _quantityByProduct = {};
  final Map<String, TextEditingController> _quantityControllers = {};

String _paymentMethod = 'EFECTIVO';

  @override
  void initState() {
super.initState();
    _mode = widget.initialMode;

    if (_mode == ProductionSaleMode.public) {
      _loadPublicProducts();
    }
  }

  @override
  void dispose() {
    _customerSearchCtrl.dispose();
    _publicCustomerNameCtrl.dispose();

    for (final controller in _quantityControllers.values) {
      controller.dispose();
    }

super.dispose();
  }

double get _total {
double result = 0;

    for (final product in _products) {
      final productId = _productId(product);
      final quantity = _quantityByProduct[productId] ?? 0;
      final price = NumberParser.toDouble(product['precio']);

      result += quantity * price;
    }

    return result;
  }

int get _totalQuantity {
    return _quantityByProduct.values.fold(
      0,
      (total, quantity) => total + quantity,
    );
  }

bool get _canSubmit {
    if (_saving || _loadingProducts || _totalQuantity <= 0) {
      return false;
    }

    if (_mode == ProductionSaleMode.customer) {
      return _selectedCustomer != null;
    }

    return true;
  }

String _productId(Map<String, dynamic> product) {
    return (product['product_id'] ??
            product['id'] ??
            product['inventory_product_setting_id'] ??
            '')
        .toString();
  }

String _money(num value) {
    return '\$${value.toStringAsFixed(2)}';
  }

Future<Map<String, dynamic>> _readJson(http.Response response) async {
    final body = response.body.trim();
    final contentType = response.headers['content-type'] ?? '';

    if (body.isEmpty) {
      throw Exception(
        'El servidor respondió vacío (HTTP ${response.statusCode}).',
      );
    }

    if (!contentType.toLowerCase().contains('application/json')) {
      final preview = body.length > 160 ? body.substring(0, 160) : body;

      throw Exception(
        'El servidor no devolvió JSON (HTTP ${response.statusCode}). '
        'Revisa API_BASE_URL. Respuesta: $preview',
      );
    }

    try {
      final decoded = jsonDecode(body);

      if (decoded is! Map<String, dynamic>) {
        throw const FormatException('La respuesta JSON no es un objeto.');
      }

      return decoded;
    } on FormatException catch (error) {
      throw Exception(
        'JSON inválido del servidor (HTTP ${response.statusCode}): '
        '${error.message}',
      );
    }
  }

  void _clearSaleSelection() {
    _quantityByProduct.clear();

    for (final controller in _quantityControllers.values) {
      controller.clear();
    }

    _paymentMethod = 'EFECTIVO';
    _error = null;
  }

Future<void> _changeMode(ProductionSaleMode mode) async {
    if (_saving || _mode == mode) return;

    setState(() {
      _mode = mode;
      _selectedCustomer = null;
      _customers = [];
      _products = [];
      _clearSaleSelection();
    });

    if (mode == ProductionSaleMode.public) {
      await _loadPublicProducts();
    }
  }

Future<void> _searchCustomers() async {
    final query = _customerSearchCtrl.text.trim();

    if (query.length < 2) {
      setState(() {
        _customers = [];
        _error = 'Escribe al menos 2 caracteres.';
      });
      return;
    }

    setState(() {
      _loadingCustomers = true;
      _error = null;
      _customers = [];
    });

    try {
      final uri = Uri.parse(
        '$_apiBase/api/production-sales/customers',
      ).replace(
        queryParameters: {
          'q': query,
        },
      );

      final response = await http.get(uri).timeout(_requestTimeout);
      final json = await _readJson(response);

      if (response.statusCode >= 400 || json['ok'] != true) {
        throw Exception(
          json['error'] ?? 'No se pudieron buscar los clientes.',
        );
      }

      if (!mounted) return;

      setState(() {
        _customers = List<Map<String, dynamic>>.from(
          json['data'] ?? const [],
        );
      });
    } catch (error) {
      if (!mounted) return;

      setState(() {
        _error = error
            .toString()
            .replaceFirst('Exception: ', '')
            .trim();
      });
    } finally {
      if (mounted) {
        setState(() {
          _loadingCustomers = false;
        });
      }
    }
  }

Future<void> _selectCustomer(
Map<String, dynamic> customer,
  ) async {
    setState(() {
      _selectedCustomer = customer;
      _customers = [];
      _products = [];
      _quantityByProduct.clear();
      _loadingProducts = true;
      _error = null;
    });

    try {
      final customerId = (customer['id'] ?? '').toString().trim();

      if (customerId.isEmpty) {
        throw Exception('El cliente seleccionado no tiene ID.');
      }

      final uri = Uri.parse(
        '$_apiBase/api/production-sales/products',
      ).replace(
        queryParameters: {
          'customer_id': customerId,
          'sale_type': 'CUSTOMER',
        },
      );

      final response = await http.get(uri).timeout(_requestTimeout);
      final json = await _readJson(response);

      if (response.statusCode >= 400 || json['ok'] != true) {
        throw Exception(
          json['error'] ?? 'No se pudieron cargar los productos.',
        );
      }

      final rows = List<Map<String, dynamic>>.from(
        json['data'] ?? const [],
      );

      _sortProducts(rows);

      if (!mounted) return;

      setState(() {
        _products = rows;
      });
    } catch (error) {
      if (!mounted) return;

      setState(() {
        _error = error
            .toString()
            .replaceFirst('Exception: ', '')
            .trim();
      });
    } finally {
      if (mounted) {
        setState(() {
          _loadingProducts = false;
        });
      }
    }
  }

Future<void> _loadPublicProducts() async {
    setState(() {
      _loadingProducts = true;
      _products = [];
      _quantityByProduct.clear();
      _error = null;
    });

    try {
      final uri = Uri.parse(
        '$_apiBase/api/production-sales/products',
      ).replace(
        queryParameters: {
          'sale_type': 'PUBLIC',
        },
      );

      final response = await http.get(uri).timeout(_requestTimeout);
      final json = await _readJson(response);

      if (response.statusCode >= 400 || json['ok'] != true) {
        throw Exception(
          json['error'] ?? 'No se pudieron cargar los productos.',
        );
      }

      final rows = List<Map<String, dynamic>>.from(
        json['data'] ?? const [],
      );

      _sortProducts(rows);

      if (!mounted) return;

      setState(() {
        _products = rows;
      });
    } catch (error) {
      if (!mounted) return;

      setState(() {
        _error = error
            .toString()
            .replaceFirst('Exception: ', '')
            .trim();
      });
    } finally {
      if (mounted) {
        setState(() {
          _loadingProducts = false;
        });
      }
    }
  }

  void _sortProducts(List<Map<String, dynamic>> rows) {
    rows.sort((a, b) {
      final stockA = NumberParser.toInt(a['available_qty']);
      final stockB = NumberParser.toInt(b['available_qty']);

      if (stockA != stockB) {
        return stockB.compareTo(stockA);
      }

      return (a['nombre'] ?? '')
          .toString()
          .compareTo((b['nombre'] ?? '').toString());
    });
  }

Future<void> _refreshProducts() async {
    if (_mode == ProductionSaleMode.public) {
      await _loadPublicProducts();
      return;
    }

    final customer = _selectedCustomer;

    if (customer != null) {
      await _selectCustomer(customer);
    }
  }

TextEditingController _quantityControllerFor(
Map<String, dynamic> product,
  ) {
    final productId = _productId(product);

    return _quantityControllers.putIfAbsent(
      productId,
      () => TextEditingController(
        text: (_quantityByProduct[productId] ?? 0) > 0
            ? (_quantityByProduct[productId] ?? 0).toString()
            : '',
      ),
    );
  }

  void _setQuantityFromInput(
Map<String, dynamic> product,
String value,
  ) {
    final productId = _productId(product);
    final available = NumberParser.toInt(product['available_qty']);

    if (productId.isEmpty) return;

    final parsed = int.tryParse(value.trim()) ?? 0;
    final nextQuantity = parsed.clamp(0, available).toInt();

    if (parsed > available) {
      final controller = _quantityControllerFor(product);
      final corrected = available > 0 ? available.toString() : '';

      controller.value = TextEditingValue(
        text: corrected,
        selection: TextSelection.collapsed(
          offset: corrected.length,
        ),
      );

      _showMessage(
        available > 0
            ? 'Solo hay $available bolsas disponibles.'
            : 'Este producto no tiene stock disponible.',
      );
    }

    setState(() {
      if (nextQuantity <= 0) {
        _quantityByProduct.remove(productId);
      } else {
        _quantityByProduct[productId] = nextQuantity;
      }
    });
  }

  void _setQuantity(
Map<String, dynamic> product,
int quantity,
  ) {
    final productId = _productId(product);
    final available = NumberParser.toInt(product['available_qty']);

    if (productId.isEmpty) return;

    var nextQuantity = quantity;

    if (nextQuantity < 0) {
      nextQuantity = 0;
    }

    if (nextQuantity > available) {
      nextQuantity = available;
    }

    setState(() {
      if (nextQuantity <= 0) {
        _quantityByProduct.remove(productId);
      } else {
        _quantityByProduct[productId] = nextQuantity;
      }
    });
  }

List<Map<String, dynamic>> _buildItems() {
    final items = <Map<String, dynamic>>[];

    for (final entry in _quantityByProduct.entries) {
      if (entry.value <= 0) continue;

      final product = _products.firstWhere(
        (row) => _productId(row) == entry.key,
        orElse: () => <String, dynamic>{},
      );

      if (product.isEmpty) continue;

      final available = NumberParser.toInt(
        product['available_qty'],
      );

      if (entry.value > available) {
        throw Exception(
          'La cantidad de ${product['nombre'] ?? 'un producto'} '
          'supera el inventario disponible.',
        );
      }

      items.add({
        'product_id': entry.key,
        'inventory_product_setting_id':
            product['inventory_product_setting_id'],
        'inventory_code':
            product['inventory_code'] ??
            product['productoCodigo'] ??
            product['codigo'],
        'ice_type':
            product['ice_type'] ??
            product['tipoHielo'] ??
            product['tipo_hielo'],
        'quantity': entry.value,
      });
    }

    return items;
  }

Future<void> _registerSale() async {
    if (!_canSubmit) return;

    if (_mode == ProductionSaleMode.customer &&
        _selectedCustomer == null) {
      _showMessage('Selecciona un cliente.');
      return;
    }

    final employeeId = widget.employeeId.trim();

    if (employeeId.isEmpty) {
      _showMessage('No se pudo identificar al empleado.');
      return;
    }

    late final List<Map<String, dynamic>> items;

    try {
      items = _buildItems();
    } catch (error) {
      _showMessage(
        error.toString().replaceFirst('Exception: ', ''),
      );
      return;
    }

    if (items.isEmpty) {
      _showMessage('Agrega al menos un producto.');
      return;
    }

    final publicName = _publicCustomerNameCtrl.text.trim();

    final payload = <String, dynamic>{
      'employee_id': employeeId,
      'employee_name': widget.employeeName.trim(),
      'sale_type': _mode == ProductionSaleMode.customer
          ? 'CUSTOMER'
          : 'PUBLIC',
      'customer_id': _mode == ProductionSaleMode.customer
          ? _selectedCustomer!['id']
          : null,
      'customer_name': _mode == ProductionSaleMode.customer
          ? (_selectedCustomer?['nombre'] ?? 'Cliente').toString()
          : publicName.isEmpty
              ? 'Público general'
              : publicName,
      'payment_method': _paymentMethod,
      'source': 'PRODUCTION_TABLET',
      'inventory_location': 'CAMARA_FRIA',
      'items': items,
    };

    setState(() {
      _saving = true;
      _error = null;
    });

    try {
      final response = await http
          .post(
Uri.parse('$_apiBase/api/production-sales'),
            headers: {
              'Content-Type': 'application/json',
            },
            body: jsonEncode(payload),
          )
          .timeout(_requestTimeout);

      final json = await _readJson(response);

      if (response.statusCode >= 400 || json['ok'] != true) {
        throw Exception(
          json['error'] ?? 'No se pudo registrar la venta.',
        );
      }

      final result = ProductionSaleResult.fromJson(json);

      if (!mounted) return;

      await Navigator.of(context).push(
MaterialPageRoute(
          builder: (_) => ProductionSaleSuccessPage(
            result: result,
          ),
        ),
      );

      if (!mounted) return;

Navigator.of(context).pop(true);
    } catch (error) {
      if (!mounted) return;

      setState(() {
        _error = error
            .toString()
            .replaceFirst('Exception: ', '')
            .trim();
      });

      await _refreshProducts();
    } finally {
      if (mounted) {
        setState(() {
          _saving = false;
        });
      }
    }
  }

  void _showMessage(String message) {
ScaffoldMessenger.of(context).showSnackBar(
SnackBar(
        content: Text(message),
      ),
    );
  }

Color _stockColor(int available) {
    if (available <= 0) return _danger;
    if (available <= 5) return _warning;
    return _green;
  }

String _stockLabel(int available) {
    if (available <= 0) return 'Sin stock';
    if (available <= 5) return 'Stock bajo';
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
        title: const Text('Nueva venta'),
        actions: [
IconButton(
            tooltip: 'Actualizar inventario',
            onPressed: _loadingProducts || _saving
                ? null
                : _refreshProducts,
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      body: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [
              _navy,
              _royal,
            ],
          ),
        ),
        child: SafeArea(
          child: ListView(
            padding: const EdgeInsets.fromLTRB(
              16,
              8,
              16,
              28,
            ),
            children: [
              _buildEmployeeCard(),
              const SizedBox(height: 14),
              _buildSaleModeCard(),
              const SizedBox(height: 14),
              if (_mode == ProductionSaleMode.customer)
                _buildCustomerSection()
              else
                _buildPublicCustomerSection(),
              const SizedBox(height: 14),
              _buildProductsSection(),
              if (_products.isNotEmpty) ...[
                const SizedBox(height: 14),
                _buildPaymentSection(),
              ],
              if (_error != null && _error!.trim().isNotEmpty) ...[
                const SizedBox(height: 14),
_ErrorCard(
                  message: _error!,
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }

Widget _buildEmployeeCard() {
    return _GlassCard(
      child: Row(
        children: [
Container(
            height: 52,
            width: 52,
            decoration: BoxDecoration(
              color: _accent.withValues(alpha: 0.16),
              borderRadius: BorderRadius.circular(16),
            ),
            child: const Icon(
Icons.factory_outlined,
              color: _accent,
              size: 29,
            ),
          ),
          const SizedBox(width: 13),
Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Venta desde Producción',
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 17,
                    fontWeight: FontWeight.w900,
                  ),
                ),
                const SizedBox(height: 4),
Text(
                  widget.employeeName,
                  style: TextStyle(
                    color: Colors.white.withValues(alpha: 0.70),
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

Widget _buildSaleModeCard() {
    return _GlassCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Tipo de venta',
            style: TextStyle(
              color: Colors.white,
              fontSize: 16,
              fontWeight: FontWeight.w900,
            ),
          ),
          const SizedBox(height: 12),
Row(
            children: [
Expanded(
                child: _ModeButton(
                  selected: _mode == ProductionSaleMode.customer,
                  icon: Icons.storefront_outlined,
                  label: 'Cliente',
                  onTap: () {
                    _changeMode(ProductionSaleMode.customer);
                  },
                ),
              ),
              const SizedBox(width: 10),
Expanded(
                child: _ModeButton(
                  selected: _mode == ProductionSaleMode.public,
                  icon: Icons.shopping_cart_checkout,
                  label: 'Público',
                  onTap: () {
                    _changeMode(ProductionSaleMode.public);
                  },
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

Widget _buildCustomerSection() {
    return _GlassCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Cliente registrado',
            style: TextStyle(
              color: Colors.white,
              fontSize: 16,
              fontWeight: FontWeight.w900,
            ),
          ),
          const SizedBox(height: 5),
Text(
            'Se aplicará el precio especial configurado para el cliente.',
            style: TextStyle(
              color: Colors.white.withValues(alpha: 0.65),
              fontSize: 12.5,
              height: 1.3,
            ),
          ),
          const SizedBox(height: 13),
TextField(
            controller: _customerSearchCtrl,
            enabled: !_saving,
            style: const TextStyle(
              color: Colors.white,
              fontWeight: FontWeight.w600,
            ),
            textInputAction: TextInputAction.search,
            decoration: InputDecoration(
              hintText: 'Buscar cliente...',
              hintStyle: TextStyle(
                color: Colors.white.withValues(alpha: 0.42),
              ),
              prefixIcon: const Icon(
Icons.search,
                color: Colors.white70,
              ),
              filled: true,
              fillColor: Colors.white.withValues(alpha: 0.08),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(15),
                borderSide: BorderSide(
                  color: Colors.white.withValues(alpha: 0.16),
                ),
              ),
              focusedBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(15),
                borderSide: const BorderSide(
                  color: _accent,
                ),
              ),
            ),
            onSubmitted: (_) {
              _searchCustomers();
            },
          ),
          const SizedBox(height: 11),
SizedBox(
            width: double.infinity,
            child: ElevatedButton.icon(
              onPressed: _loadingCustomers || _saving
                  ? null
                  : _searchCustomers,
              icon: _loadingCustomers
                  ? const SizedBox(
                      height: 17,
                      width: 17,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: Colors.white,
                      ),
                    )
                  : const Icon(Icons.search),
              label: const Text('Buscar cliente'),
              style: ElevatedButton.styleFrom(
                backgroundColor: _accent,
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(
                  vertical: 13,
                ),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(15),
                ),
              ),
            ),
          ),
          if (_selectedCustomer != null) ...[
            const SizedBox(height: 13),
_SelectedCustomerCard(
              name: (_selectedCustomer?['nombre'] ?? 'Cliente')
                  .toString(),
              onClear: _saving
                  ? null
                  : () {
                      setState(() {
                        _selectedCustomer = null;
                        _products = [];
                        _quantityByProduct.clear();
                      });
                    },
            ),
          ],
          if (_customers.isNotEmpty) ...[
            const SizedBox(height: 13),
            ..._customers.map(
              (customer) => ListTile(
                contentPadding: EdgeInsets.zero,
                leading: const CircleAvatar(
                  backgroundColor: Color(0x224DADFF),
                  child: Icon(
Icons.storefront_outlined,
                    color: _accent,
                  ),
                ),
                title: Text(
                  (customer['nombre'] ?? 'Cliente').toString(),
                  style: const TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                subtitle: Text(
                  (customer['telefono'] ??
                          customer['direccion'] ??
                          'Cliente registrado')
                      .toString(),
                  style: TextStyle(
                    color: Colors.white.withValues(alpha: 0.58),
                  ),
                ),
                trailing: const Icon(
Icons.chevron_right,
                  color: Colors.white70,
                ),
                onTap: _saving
                    ? null
                    : () {
                        _selectCustomer(customer);
                      },
              ),
            ),
          ],
        ],
      ),
    );
  }

Widget _buildPublicCustomerSection() {
    return _GlassCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Venta al público',
            style: TextStyle(
              color: Colors.white,
              fontSize: 16,
              fontWeight: FontWeight.w900,
            ),
          ),
          const SizedBox(height: 5),
Text(
            'Se utilizarán los precios generales configurados.',
            style: TextStyle(
              color: Colors.white.withValues(alpha: 0.65),
              fontSize: 12.5,
            ),
          ),
          const SizedBox(height: 13),
TextField(
            controller: _publicCustomerNameCtrl,
            enabled: !_saving,
            textCapitalization: TextCapitalization.words,
            style: const TextStyle(
              color: Colors.white,
              fontWeight: FontWeight.w600,
            ),
            decoration: InputDecoration(
              labelText: 'Nombre del cliente (opcional)',
              labelStyle: TextStyle(
                color: Colors.white.withValues(alpha: 0.66),
              ),
              hintText: 'Público general',
              hintStyle: TextStyle(
                color: Colors.white.withValues(alpha: 0.38),
              ),
              prefixIcon: const Icon(
Icons.person_outline,
                color: Colors.white70,
              ),
              filled: true,
              fillColor: Colors.white.withValues(alpha: 0.08),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(15),
                borderSide: BorderSide(
                  color: Colors.white.withValues(alpha: 0.16),
                ),
              ),
              focusedBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(15),
                borderSide: const BorderSide(
                  color: _accent,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

Widget _buildProductsSection() {
    if (_loadingProducts) {
      return const _GlassCard(
        child: Padding(
          padding: EdgeInsets.symmetric(vertical: 22),
          child: Center(
            child: Column(
              children: [
CircularProgressIndicator(
                  color: _accent,
                ),
SizedBox(height: 12),
Text(
                  'Consultando inventario real...',
                  style: TextStyle(
                    color: Colors.white70,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ],
            ),
          ),
        ),
      );
    }

    if (_mode == ProductionSaleMode.customer &&
        _selectedCustomer == null) {
      return _GlassCard(
        child: Text(
          'Selecciona un cliente para consultar sus productos, '
          'precios especiales y existencias.',
          style: TextStyle(
            color: Colors.white.withValues(alpha: 0.72),
            fontWeight: FontWeight.w600,
            height: 1.4,
          ),
        ),
      );
    }

    if (_products.isEmpty) {
      return _GlassCard(
        child: Text(
          'No hay productos comerciales disponibles o no existe stock.',
          style: TextStyle(
            color: Colors.white.withValues(alpha: 0.72),
            fontWeight: FontWeight.w700,
          ),
        ),
      );
    }

    return _GlassCard(
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
                    fontSize: 16,
                    fontWeight: FontWeight.w900,
                  ),
                ),
              ),
Text(
                '$_totalQuantity unidades',
                style: TextStyle(
                  color: Colors.white.withValues(alpha: 0.68),
                  fontSize: 12,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ],
          ),
          const SizedBox(height: 11),
          ..._products.map(_buildProductCard),
        ],
      ),
    );
  }

Widget _buildProductCard(Map<String, dynamic> product) {
    final productId = _productId(product);
    final quantity = _quantityByProduct[productId] ?? 0;
    final available = NumberParser.toInt(product['available_qty']);
    final price = NumberParser.toDouble(product['precio']);

    final hasOverride =
        product['has_override'] == true ||
        product['precio_override'] != null ||
        (product['price_source'] ?? '').toString().toUpperCase() ==
            'OVERRIDE';

    final stockColor = _stockColor(available);

    return Container(
      margin: const EdgeInsets.only(bottom: 11),
      padding: const EdgeInsets.all(13),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.07),
        borderRadius: BorderRadius.circular(17),
        border: Border.all(
          color: Colors.white.withValues(alpha: 0.12),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
Row(
            children: [
Expanded(
                child: Text(
                  (product['nombre'] ?? 'Producto').toString(),
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 15,
                    fontWeight: FontWeight.w900,
                  ),
                ),
              ),
Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 9,
                  vertical: 5,
                ),
                decoration: BoxDecoration(
                  color: stockColor.withValues(alpha: 0.14),
                  borderRadius: BorderRadius.circular(999),
                  border: Border.all(
                    color: stockColor.withValues(alpha: 0.34),
                  ),
                ),
                child: Text(
                  _stockLabel(available),
                  style: TextStyle(
                    color: stockColor,
                    fontSize: 10.5,
                    fontWeight: FontWeight.w900,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 7),
Wrap(
            spacing: 7,
            runSpacing: 7,
            children: [
_ProductBadge(
                icon: Icons.inventory_2_outlined,
                label: 'Stock: $available',
              ),
_ProductBadge(
                icon: Icons.sell_outlined,
                label: _money(price),
              ),
              if (hasOverride)
                const _ProductBadge(
                  icon: Icons.star_outline,
                  label: 'Precio especial',
                  accent: _green,
                )
              else
                const _ProductBadge(
                  icon: Icons.price_check_outlined,
                  label: 'Precio general',
                ),
            ],
          ),
          const SizedBox(height: 11),
TextField(
            controller: _quantityControllerFor(product),
            enabled: !_saving && available > 0,
            keyboardType: TextInputType.number,
            inputFormatters: [
FilteringTextInputFormatter.digitsOnly,
            ],
            textInputAction: TextInputAction.done,
            textAlign: TextAlign.center,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 20,
              fontWeight: FontWeight.w900,
            ),
            decoration: InputDecoration(
              labelText: '¿Cuántas bolsas?',
              labelStyle: TextStyle(
                color: Colors.white.withValues(alpha: 0.70),
                fontWeight: FontWeight.w700,
              ),
              hintText: available > 0
                  ? 'Escribe la cantidad'
                  : 'Sin stock',
              hintStyle: TextStyle(
                color: Colors.white.withValues(alpha: 0.38),
              ),
              helperText: 'Máximo disponible: $available',
              helperStyle: TextStyle(
                color: Colors.white.withValues(alpha: 0.55),
                fontWeight: FontWeight.w600,
              ),
              prefixIcon: const Icon(
Icons.shopping_bag_outlined,
                color: Colors.white70,
              ),
              filled: true,
              fillColor: Colors.white.withValues(alpha: 0.08),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(15),
                borderSide: BorderSide(
                  color: Colors.white.withValues(alpha: 0.16),
                ),
              ),
              focusedBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(15),
                borderSide: const BorderSide(
                  color: _accent,
                  width: 1.5,
                ),
              ),
              disabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(15),
                borderSide: BorderSide(
                  color: Colors.white.withValues(alpha: 0.08),
                ),
              ),
            ),
            onTap: () {
              final controller = _quantityControllerFor(product);
              controller.selection = TextSelection(
                baseOffset: 0,
                extentOffset: controller.text.length,
              );
            },
            onChanged: (value) {
              _setQuantityFromInput(product, value);
            },
          ),
          const SizedBox(height: 8),
Row(
            children: [
Text(
                'Cantidad: $quantity',
                style: TextStyle(
                  color: Colors.white.withValues(alpha: 0.62),
                  fontSize: 11.5,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const Spacer(),
Text(
                'Subtotal: ${_money(quantity * price)}',
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 12.5,
                  fontWeight: FontWeight.w900,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

Widget _buildPaymentSection() {
    return _GlassCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Método de pago',
            style: TextStyle(
              color: Colors.white,
              fontSize: 16,
              fontWeight: FontWeight.w900,
            ),
          ),
          const SizedBox(height: 6),
RadioListTile<String>(
            value: 'EFECTIVO',
            groupValue: _paymentMethod,
            activeColor: _accent,
            contentPadding: EdgeInsets.zero,
            title: const Text(
              'Efectivo',
              style: TextStyle(
                color: Colors.white,
                fontWeight: FontWeight.w700,
              ),
            ),
            onChanged: _saving
                ? null
                : (value) {
                    setState(() {
                      _paymentMethod = value ?? 'EFECTIVO';
                    });
                  },
          ),
RadioListTile<String>(
            value: 'CREDITO',
            groupValue: _paymentMethod,
            activeColor: _accent,
            contentPadding: EdgeInsets.zero,
            title: const Text(
              'Crédito',
              style: TextStyle(
                color: Colors.white,
                fontWeight: FontWeight.w700,
              ),
            ),
            onChanged: _saving
                ? null
                : (value) {
                    setState(() {
                      _paymentMethod = value ?? 'CREDITO';
                    });
                  },
          ),
          const Divider(
            color: Colors.white24,
            height: 24,
          ),
Row(
            children: [
              const Expanded(
                child: Text(
                  'Total',
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 19,
                    fontWeight: FontWeight.w900,
                  ),
                ),
              ),
Text(
                _money(_total),
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 23,
                  fontWeight: FontWeight.w900,
                ),
              ),
            ],
          ),
          const SizedBox(height: 15),
SizedBox(
            width: double.infinity,
            child: ElevatedButton.icon(
              onPressed: _canSubmit ? _registerSale : null,
              icon: _saving
                  ? const SizedBox(
                      height: 17,
                      width: 17,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: Colors.white,
                      ),
                    )
                  : const Icon(Icons.check_circle_outline),
              label: Text(
                _saving
                    ? 'Registrando venta...'
                    : 'Confirmar venta',
                style: const TextStyle(
                  fontWeight: FontWeight.w900,
                ),
              ),
              style: ElevatedButton.styleFrom(
                backgroundColor: _wine,
                foregroundColor: Colors.white,
                disabledBackgroundColor:
Colors.white.withValues(alpha: 0.12),
                disabledForegroundColor:
Colors.white.withValues(alpha: 0.38),
                padding: const EdgeInsets.symmetric(
                  vertical: 15,
                ),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(17),
                ),
              ),
            ),
          ),
          const SizedBox(height: 9),
Text(
            'Al confirmar se validará nuevamente el inventario y '
            'se registrará la salida real en el sistema de Inventario.',
            textAlign: TextAlign.center,
            style: TextStyle(
              color: Colors.white.withValues(alpha: 0.52),
              fontSize: 11.5,
              height: 1.3,
            ),
          ),
        ],
      ),
    );
  }
}

class ProductionSaleResult {
  final String saleId;
  final String folio;
  final String customerName;
  final String employeeName;
  final String paymentMethod;
  final double total;
  final DateTime createdAt;
  final List<ProductionSaleResultItem> items;

  const ProductionSaleResult({
    required this.saleId,
    required this.folio,
    required this.customerName,
    required this.employeeName,
    required this.paymentMethod,
    required this.total,
    required this.createdAt,
    required this.items,
  });

  factory ProductionSaleResult.fromJson(
Map<String, dynamic> json,
  ) {
    final rawItems = json['items'];

    return ProductionSaleResult(
      saleId: (json['sale_id'] ?? json['id'] ?? '').toString(),
      folio: (json['folio'] ?? 'VENTA').toString(),
      customerName:
          (json['customer_name'] ?? 'Público general').toString(),
      employeeName:
          (json['employee_name'] ?? 'Producción').toString(),
      paymentMethod:
          (json['payment_method'] ?? 'EFECTIVO').toString(),
      total: NumberParser.toDouble(json['total']),
      createdAt: DateTime.tryParse(
            (json['created_at'] ?? '').toString(),
          ) ??
DateTime.now(),
      items: rawItems is List
          ? rawItems
              .whereType<Map>()
              .map(
                (item) => ProductionSaleResultItem.fromJson(
Map<String, dynamic>.from(item),
                ),
              )
              .toList()
          : const [],
    );
  }
}

class ProductionSaleResultItem {
  final String name;
  final int quantity;
  final double unitPrice;
  final double subtotal;

  const ProductionSaleResultItem({
    required this.name,
    required this.quantity,
    required this.unitPrice,
    required this.subtotal,
  });

  factory ProductionSaleResultItem.fromJson(
Map<String, dynamic> json,
  ) {
    final quantity = NumberParser.toInt(
      json['quantity'] ?? json['qty'],
    );

    final unitPrice = NumberParser.toDouble(
      json['unit_price'] ?? json['precio'],
    );

    return ProductionSaleResultItem(
      name: (json['name'] ??
              json['nombre'] ??
              json['product_name'] ??
              'Producto')
          .toString(),
      quantity: quantity,
      unitPrice: unitPrice,
      subtotal: NumberParser.toDouble(
        json['subtotal'] ?? quantity * unitPrice,
      ),
    );
  }
}

class ProductionSaleSuccessPage extends StatefulWidget {
  final ProductionSaleResult result;

  const ProductionSaleSuccessPage({
super.key,
    required this.result,
  });

  @override
State<ProductionSaleSuccessPage> createState() =>
_ProductionSaleSuccessPageState();
}

class _ProductionSaleSuccessPageState
    extends State<ProductionSaleSuccessPage> {
bool _printing = false;

ProductionSaleResult get result => widget.result;

String _money(num value) {
    return '\$${value.toStringAsFixed(2)}';
  }

Future<void> _printTicket() async {
    if (_printing) return;

    setState(() {
      _printing = true;
    });

    final printer = PrinterService.instance;

    try {
      final connected = await printer.isConnected;

      if (!connected) {
        if (!mounted) return;

ScaffoldMessenger.of(context).showSnackBar(
SnackBar(
            content: Text(
              printer.lastError ??
                  'No hay impresora conectada. Conecta la impresora '
                      'Bluetooth desde la configuración de impresión.',
            ),
          ),
        );
        return;
      }

      final ticketItems = result.items
          .map(
            (item) => PrinterTicketItem(
              qtyReal: item.quantity,
              description: item.name,
              unitPrice: item.unitPrice,
              amount: item.subtotal,
            ),
          )
          .toList();

      final printed = await printer.printDeliveryTicket(
        folio: result.folio,
        customerName: result.customerName,
        dinerName: '',
        driverName: result.employeeName,
        deliveredAt: result.createdAt.toIso8601String(),
        items: ticketItems,
        totalReal: result.total,
        paymentMethod: result.paymentMethod,
        copies: 1,
        copyLabel: 'ORIGINAL',
      );

      if (!mounted) return;

ScaffoldMessenger.of(context).showSnackBar(
SnackBar(
          content: Text(
            printed
                ? 'Ticket enviado a la impresora.'
                : printer.lastError ??
                    'No se pudo imprimir el ticket.',
          ),
          backgroundColor: printed
              ? const Color(0xFF10B981)
              : const Color(0xFFEF4444),
        ),
      );
    } catch (error) {
      if (!mounted) return;

ScaffoldMessenger.of(context).showSnackBar(
SnackBar(
          content: Text(
            error
                .toString()
                .replaceFirst('Exception: ', '')
                .trim(),
          ),
          backgroundColor: const Color(0xFFEF4444),
        ),
      );
    } finally {
      if (mounted) {
        setState(() {
          _printing = false;
        });
      }
    }
  }

  @override
Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF4F7FB),
      appBar: AppBar(
        title: const Text('Venta registrada'),
        automaticallyImplyLeading: false,
      ),
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(20),
            child: ConstrainedBox(
              constraints: const BoxConstraints(
                maxWidth: 620,
              ),
              child: Column(
                children: [
Container(
                    height: 82,
                    width: 82,
                    decoration: BoxDecoration(
                      color: const Color(0xFF10B981)
                          .withValues(alpha: 0.14),
                      shape: BoxShape.circle,
                    ),
                    child: const Icon(
Icons.check_circle,
                      size: 54,
                      color: Color(0xFF10B981),
                    ),
                  ),
                  const SizedBox(height: 17),
                  const Text(
                    'Venta registrada correctamente',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      color: Color(0xFF0A1A2F),
                      fontSize: 23,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                  const SizedBox(height: 18),
Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(19),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(22),
                      border: Border.all(
                        color: const Color(0xFFE4E9F1),
                      ),
                    ),
                    child: Column(
                      children: [
_ResultRow(
                          label: 'Folio',
                          value: result.folio,
                        ),
_ResultRow(
                          label: 'Cliente',
                          value: result.customerName,
                        ),
_ResultRow(
                          label: 'Atendió',
                          value: result.employeeName,
                        ),
_ResultRow(
                          label: 'Pago',
                          value: result.paymentMethod,
                        ),
_ResultRow(
                          label: 'Total',
                          value: _money(result.total),
                          emphasized: true,
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 17),
SizedBox(
                    width: double.infinity,
                    child: FilledButton.icon(
                      onPressed:
                          _printing ? null : _printTicket,
                      icon: _printing
                          ? const SizedBox(
                              height: 18,
                              width: 18,
                              child: CircularProgressIndicator(
                                strokeWidth: 2,
                                color: Colors.white,
                              ),
                            )
                          : const Icon(
Icons.print_outlined,
                            ),
                      label: Text(
                        _printing
                            ? 'Imprimiendo...'
                            : 'Imprimir ticket',
                      ),
                      style: FilledButton.styleFrom(
                        padding: const EdgeInsets.symmetric(
                          vertical: 15,
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(height: 11),
SizedBox(
                    width: double.infinity,
                    child: OutlinedButton.icon(
                      onPressed: _printing
                          ? null
                          : () {
Navigator.of(context).pop();
                            },
                      icon: const Icon(
Icons.add_shopping_cart,
                      ),
                      label: const Text('Terminar'),
                      style: OutlinedButton.styleFrom(
                        padding: const EdgeInsets.symmetric(
                          vertical: 15,
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(height: 12),
                  const Text(
                    'La impresión usa el formato térmico ESC/POS '
                    'de 80 mm configurado para Global Ice.',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      color: Colors.black54,
                      fontSize: 12,
                      height: 1.3,
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

class NumberParser {
  static double toDouble(dynamic value) {
    if (value == null) return 0;

    if (value is num) {
      return value.toDouble();
    }

    return double.tryParse(value.toString()) ?? 0;
  }

  static int toInt(dynamic value) {
    if (value == null) return 0;

    if (value is num) {
      return value.toInt();
    }

    return int.tryParse(value.toString()) ?? 0;
  }
}

class _GlassCard extends StatelessWidget {
  final Widget child;

  const _GlassCard({
    required this.child,
  });

  @override
Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(15),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(21),
        border: Border.all(
          color: Colors.white.withValues(alpha: 0.16),
        ),
      ),
      child: child,
    );
  }
}

class _ModeButton extends StatelessWidget {
  final bool selected;
  final IconData icon;
  final String label;
  final VoidCallback onTap;

  const _ModeButton({
    required this.selected,
    required this.icon,
    required this.label,
    required this.onTap,
  });

  @override
Widget build(BuildContext context) {
    return Material(
      color: selected
          ? const Color(0xFF4DADFF)
          : Colors.white.withValues(alpha: 0.08),
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(16),
        child: Container(
          padding: const EdgeInsets.symmetric(
            horizontal: 10,
            vertical: 14,
          ),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
            border: Border.all(
              color: selected
                  ? const Color(0xFF4DADFF)
                  : Colors.white.withValues(alpha: 0.15),
            ),
          ),
          child: Column(
            children: [
Icon(
                icon,
                color: Colors.white,
              ),
              const SizedBox(height: 6),
Text(
                label,
                textAlign: TextAlign.center,
                style: const TextStyle(
                  color: Colors.white,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _SelectedCustomerCard extends StatelessWidget {
  final String name;
  final VoidCallback? onClear;

  const _SelectedCustomerCard({
    required this.name,
    required this.onClear,
  });

  @override
Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: const Color(0xFF10B981)
            .withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(15),
        border: Border.all(
          color: const Color(0xFF10B981)
              .withValues(alpha: 0.28),
        ),
      ),
      child: Row(
        children: [
          const Icon(
Icons.check_circle_outline,
            color: Color(0xFF10B981),
          ),
          const SizedBox(width: 9),
Expanded(
            child: Text(
              name,
              style: const TextStyle(
                color: Colors.white,
                fontWeight: FontWeight.w900,
              ),
            ),
          ),
IconButton(
            onPressed: onClear,
            icon: const Icon(
Icons.close,
              color: Colors.white70,
            ),
          ),
        ],
      ),
    );
  }
}

class _ProductBadge extends StatelessWidget {
  final IconData icon;
  final String label;
  final Color accent;

  const _ProductBadge({
    required this.icon,
    required this.label,
this.accent = const Color(0xFF4DADFF),
  });

  @override
Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: 8,
        vertical: 5,
      ),
      decoration: BoxDecoration(
        color: accent.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
Icon(
            icon,
            size: 13,
            color: accent,
          ),
          const SizedBox(width: 4),
Text(
            label,
            style: TextStyle(
              color: accent,
              fontSize: 10.5,
              fontWeight: FontWeight.w800,
            ),
          ),
        ],
      ),
    );
  }
}

class _ErrorCard extends StatelessWidget {
  final String message;

  const _ErrorCard({
    required this.message,
  });

  @override
Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(13),
      decoration: BoxDecoration(
        color: const Color(0xFFEF4444)
            .withValues(alpha: 0.13),
        borderRadius: BorderRadius.circular(17),
        border: Border.all(
          color: const Color(0xFFEF4444)
              .withValues(alpha: 0.28),
        ),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(
Icons.error_outline,
            color: Color(0xFFFFB4B4),
          ),
          const SizedBox(width: 10),
Expanded(
            child: Text(
              message,
              style: const TextStyle(
                color: Colors.white,
                fontWeight: FontWeight.w700,
                height: 1.3,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _ResultRow extends StatelessWidget {
  final String label;
  final String value;
  final bool emphasized;

  const _ResultRow({
    required this.label,
    required this.value,
this.emphasized = false,
  });

  @override
Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(
        vertical: 7,
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
SizedBox(
            width: 84,
            child: Text(
              label,
              style: const TextStyle(
                color: Colors.black54,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
Expanded(
            child: Text(
              value,
              textAlign: TextAlign.right,
              style: TextStyle(
                color: const Color(0xFF0A1A2F),
                fontSize: emphasized ? 20 : 15,
                fontWeight: FontWeight.w900,
              ),
            ),
          ),
        ],
      ),
    );
  }
}