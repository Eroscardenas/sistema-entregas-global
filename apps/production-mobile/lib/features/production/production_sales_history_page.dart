import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:http/http.dart' as http;
import 'package:mobile/services/printer_service.dart';

class ProductionSalesHistoryPage extends StatefulWidget {
  final String employeeId;
  final String employeeName;

  const ProductionSalesHistoryPage({
    super.key,
    required this.employeeId,
    required this.employeeName,
  });

  @override
  State<ProductionSalesHistoryPage> createState() =>
      _ProductionSalesHistoryPageState();
}

class _ProductionSalesHistoryPageState
    extends State<ProductionSalesHistoryPage> {
  static const Color _navy = Color(0xFF0A1A2F);
  static const Color _blue = Color(0xFF4DADFF);
  static const Color _green = Color(0xFF10B981);
  static const Color _wine = Color(0xFF852838);
  static const Color _background = Color(0xFFF4F7FB);

  static const String _apiBase = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'https://sistema-entregas-global.vercel.app',
  );

  static const Duration _timeout = Duration(seconds: 25);
  static const String _deletePin = '7777';

  bool _loading = true;
  bool _refreshing = false;
  bool _deleting = false;
  String? _error;
  List<Map<String, dynamic>> _sales = [];

  @override
  void initState() {
    super.initState();
    _loadHistory();
  }

  Future<Map<String, dynamic>> _readJson(
    http.Response response,
  ) async {
    final body = response.body.trim();

    if (body.isEmpty) {
      throw Exception(
        'El servidor respondió vacío (HTTP ${response.statusCode}).',
      );
    }

    final decoded = jsonDecode(body);

    if (decoded is! Map<String, dynamic>) {
      throw Exception('La respuesta del servidor no es válida.');
    }

    return decoded;
  }

  Future<void> _loadHistory({
    bool refresh = false,
  }) async {
    setState(() {
      _loading = !refresh;
      _refreshing = refresh;
      _error = null;
    });

    try {
      final uri = Uri.parse(
        '$_apiBase/api/production-sales/history',
      ).replace(
        queryParameters: {
          'limit': '200',
        },
      );

      final response = await http.get(uri).timeout(_timeout);
      final json = await _readJson(response);

      if (response.statusCode >= 400 || json['ok'] != true) {
        throw Exception(
          json['error'] ?? 'No se pudo cargar el historial.',
        );
      }

      final rows = List<Map<String, dynamic>>.from(
        json['data'] ?? const [],
      );

      if (!mounted) return;

      setState(() {
        _sales = rows;
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
          _loading = false;
          _refreshing = false;
        });
      }
    }
  }

  Future<String?> _requestDeletePin({
    required String folio,
  }) async {
    final controller = TextEditingController();
    String? errorMessage;
    bool obscurePin = true;

    final result = await showDialog<String>(
      context: context,
      barrierDismissible: false,
      builder: (dialogContext) {
        return StatefulBuilder(
          builder: (context, setDialogState) {
            void validatePin() {
              final pin = controller.text.trim();

              if (pin.length != 4) {
                setDialogState(() {
                  errorMessage =
                      'Escribe el PIN de 4 dígitos.';
                });
                return;
              }

              if (pin != _deletePin) {
                setDialogState(() {
                  errorMessage =
                      'PIN incorrecto. La venta no fue eliminada.';
                });
                controller.clear();
                return;
              }

              Navigator.of(dialogContext).pop(pin);
            }

            return AlertDialog(
              title: const Row(
                children: [
                  Icon(
                    Icons.lock_outline,
                    color: Colors.redAccent,
                  ),
                  SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      'Autorizar eliminación',
                      style: TextStyle(
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                  ),
                ],
              ),
              content: SizedBox(
                width: 360,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment:
                      CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Para eliminar la venta $folio, '
                      'ingresa el PIN de autorización.',
                      style: const TextStyle(
                        height: 1.35,
                      ),
                    ),
                    const SizedBox(height: 16),
                    TextField(
                      controller: controller,
                      autofocus: true,
                      obscureText: obscurePin,
                      keyboardType:
                          TextInputType.number,
                      textInputAction:
                          TextInputAction.done,
                      maxLength: 4,
                      inputFormatters: [
                        FilteringTextInputFormatter.digitsOnly,
                        LengthLimitingTextInputFormatter(4),
                      ],
                      onChanged: (_) {
                        if (errorMessage != null) {
                          setDialogState(() {
                            errorMessage = null;
                          });
                        }
                      },
                      onSubmitted: (_) => validatePin(),
                      decoration: InputDecoration(
                        labelText: 'PIN',
                        hintText: '••••',
                        errorText: errorMessage,
                        counterText: '',
                        prefixIcon:
                            const Icon(Icons.pin_outlined),
                        suffixIcon: IconButton(
                          tooltip: obscurePin
                              ? 'Mostrar PIN'
                              : 'Ocultar PIN',
                          onPressed: () {
                            setDialogState(() {
                              obscurePin = !obscurePin;
                            });
                          },
                          icon: Icon(
                            obscurePin
                                ? Icons.visibility_outlined
                                : Icons
                                    .visibility_off_outlined,
                          ),
                        ),
                        border:
                            const OutlineInputBorder(),
                      ),
                    ),
                    const SizedBox(height: 10),
                    const Text(
                      'Esta acción eliminará la venta y sus '
                      'productos del historial. No se puede '
                      'deshacer.',
                      style: TextStyle(
                        color: Colors.redAccent,
                        fontSize: 12.5,
                        fontWeight: FontWeight.w700,
                        height: 1.3,
                      ),
                    ),
                  ],
                ),
              ),
              actions: [
                TextButton(
                  onPressed: () {
                    Navigator.of(dialogContext).pop();
                  },
                  child: const Text('Cancelar'),
                ),
                FilledButton.icon(
                  style: FilledButton.styleFrom(
                    backgroundColor: Colors.redAccent,
                    foregroundColor: Colors.white,
                  ),
                  onPressed: validatePin,
                  icon: const Icon(
                    Icons.delete_forever_outlined,
                  ),
                  label: const Text(
                    'Autorizar y eliminar',
                  ),
                ),
              ],
            );
          },
        );
      },
    );

    controller.dispose();
    return result;
  }

  Future<bool> _deleteSale(
    Map<String, dynamic> sale,
  ) async {
    if (_deleting) return false;

    final saleId =
        (sale['id'] ?? sale['sale_id'] ?? '')
            .toString()
            .trim();

    final folio =
        (sale['folio'] ?? 'VENTA').toString();

    if (saleId.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'La venta no tiene un ID válido.',
          ),
          backgroundColor: Colors.redAccent,
        ),
      );

      return false;
    }

    final authorizationPin =
        await _requestDeletePin(
      folio: folio,
    );

    if (authorizationPin == null) {
      return false;
    }

    setState(() {
      _deleting = true;
    });

    try {
      final uri = Uri.parse(
        '$_apiBase/api/production-sales/history',
      );

      final response = await http
          .delete(
            uri,
            headers: const {
              'Content-Type': 'application/json',
            },
            body: jsonEncode({
              'sale_id': saleId,
              'delete_pin': authorizationPin,
              'employee_id': widget.employeeId,
              'employee_name': widget.employeeName,
            }),
          )
          .timeout(_timeout);

      final json = await _readJson(response);

      if (
        response.statusCode >= 400 ||
        json['ok'] != true
      ) {
        throw Exception(
          json['error'] ??
              'No se pudo eliminar la venta.',
        );
      }

      if (!mounted) return false;

      setState(() {
        _sales.removeWhere(
          (currentSale) {
            final currentId =
                (currentSale['id'] ??
                        currentSale['sale_id'] ??
                        '')
                    .toString()
                    .trim();

            return currentId == saleId;
          },
        );
      });

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            'Venta $folio eliminada correctamente.',
          ),
          backgroundColor: _green,
        ),
      );

      return true;
    } catch (error) {
      if (!mounted) return false;

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            error
                .toString()
                .replaceFirst('Exception: ', '')
                .trim(),
          ),
          backgroundColor: Colors.redAccent,
        ),
      );

      return false;
    } finally {
      if (mounted) {
        setState(() {
          _deleting = false;
        });
      }
    }
  }

  String _money(dynamic value) {
    final number = value is num
        ? value.toDouble()
        : double.tryParse(value?.toString() ?? '') ?? 0;

    return '\$${number.toStringAsFixed(2)}';
  }

  String _formatDate(dynamic raw) {
    final value = DateTime.tryParse(
      raw?.toString() ?? '',
    )?.toLocal();

    if (value == null) return 'Fecha no disponible';

    String two(int number) =>
        number.toString().padLeft(2, '0');

    return '${two(value.day)}/${two(value.month)}/${value.year} '
        '${two(value.hour)}:${two(value.minute)}';
  }

  int _totalUnits(Map<String, dynamic> sale) {
    final value = sale['total_quantity'];

    if (value is num) return value.toInt();

    return int.tryParse(value?.toString() ?? '') ?? 0;
  }

  List<Map<String, dynamic>> _items(
    Map<String, dynamic> sale,
  ) {
    final raw = sale['items'];

    if (raw is! List) return const [];

    return raw
        .whereType<Map>()
        .map((item) => Map<String, dynamic>.from(item))
        .toList();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: _background,
      appBar: AppBar(
        backgroundColor: _navy,
        foregroundColor: Colors.white,
        title: const Text(
          'Historial de ventas',
          style: TextStyle(fontWeight: FontWeight.w900),
        ),
        actions: [
          IconButton(
            tooltip: 'Actualizar',
            onPressed: _refreshing
                ? null
                : () => _loadHistory(refresh: true),
            icon: _refreshing
                ? const SizedBox(
                    height: 18,
                    width: 18,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      color: Colors.white,
                    ),
                  )
                : const Icon(Icons.refresh),
          ),
        ],
      ),
      body: SafeArea(child: _buildBody()),
    );
  }

  Widget _buildBody() {
    if (_loading) {
      return const Center(
        child: CircularProgressIndicator(color: _blue),
      );
    }

    if (_error != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(22),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(
                Icons.error_outline,
                color: Colors.redAccent,
                size: 52,
              ),
              const SizedBox(height: 13),
              Text(
                _error!,
                textAlign: TextAlign.center,
                style: const TextStyle(
                  color: _navy,
                  fontSize: 15,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 16),
              FilledButton.icon(
                onPressed: _loadHistory,
                icon: const Icon(Icons.refresh),
                label: const Text('Reintentar'),
              ),
            ],
          ),
        ),
      );
    }

    return RefreshIndicator(
      onRefresh: () => _loadHistory(refresh: true),
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 28),
        children: [
          _buildHeaderSummary(),
          const SizedBox(height: 16),
          if (_sales.isEmpty)
            _buildEmptyState()
          else
            ..._sales.map(_buildSaleCard),
        ],
      ),
    );
  }

  Widget _buildHeaderSummary() {
    final total = _sales.fold<double>(
      0,
      (sum, sale) {
        final value = sale['total'];
        return sum +
            (value is num
                ? value.toDouble()
                : double.tryParse(value?.toString() ?? '') ?? 0);
      },
    );

    final units = _sales.fold<int>(
      0,
      (sum, sale) => sum + _totalUnits(sale),
    );

    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [_navy, Color(0xFF1E4A7A)],
        ),
        borderRadius: BorderRadius.circular(22),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Resumen de ventas registradas',
            style: TextStyle(
              color: Colors.white,
              fontSize: 18,
              fontWeight: FontWeight.w900,
            ),
          ),
          const SizedBox(height: 14),
          Wrap(
            spacing: 10,
            runSpacing: 10,
            children: [
              _SummaryPill(
                icon: Icons.receipt_long_outlined,
                label: '${_sales.length} ventas',
              ),
              _SummaryPill(
                icon: Icons.inventory_2_outlined,
                label: '$units productos',
              ),
              _SummaryPill(
                icon: Icons.payments_outlined,
                label: _money(total),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildEmptyState() {
    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: 20,
        vertical: 42,
      ),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(22),
        border: Border.all(color: const Color(0xFFE4E9F1)),
      ),
      child: const Column(
        children: [
          Icon(
            Icons.receipt_long_outlined,
            size: 58,
            color: Colors.black26,
          ),
          SizedBox(height: 13),
          Text(
            'Todavía no hay ventas registradas.',
            textAlign: TextAlign.center,
            style: TextStyle(
              color: _navy,
              fontSize: 16,
              fontWeight: FontWeight.w800,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSaleCard(Map<String, dynamic> sale) {
    final items = _items(sale);
    final customer =
        (sale['customer_name'] ?? 'Público general').toString();
    final folio = (sale['folio'] ?? 'VENTA').toString();
    final payment =
        (sale['payment_method'] ?? 'EFECTIVO').toString();

    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: Material(
        color: Colors.white,
        borderRadius: BorderRadius.circular(22),
        child: InkWell(
          borderRadius: BorderRadius.circular(22),
          onTap: () {
            Navigator.of(context).push(
              MaterialPageRoute(
                builder: (_) => ProductionSaleHistoryDetailPage(
                  sale: sale,
                  fallbackEmployeeName: widget.employeeName,
                  onDelete: _deleteSale,
                ),
              ),
            );
          },
          child: Container(
            padding: const EdgeInsets.all(17),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(22),
              border: Border.all(
                color: const Color(0xFFE4E9F1),
              ),
              boxShadow: const [
                BoxShadow(
                  color: Color(0x0D000000),
                  blurRadius: 14,
                  offset: Offset(0, 7),
                ),
              ],
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Container(
                      height: 48,
                      width: 48,
                      decoration: BoxDecoration(
                        color: _blue.withValues(alpha: 0.12),
                        borderRadius: BorderRadius.circular(15),
                      ),
                      child: const Icon(
                        Icons.point_of_sale,
                        color: _blue,
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            customer,
                            style: const TextStyle(
                              color: _navy,
                              fontSize: 16,
                              fontWeight: FontWeight.w900,
                            ),
                          ),
                          const SizedBox(height: 3),
                          Text(
                            _formatDate(
                              sale['created_at'] ??
                                  sale['delivered_at'],
                            ),
                            style: const TextStyle(
                              color: Colors.black54,
                              fontSize: 12.5,
                            ),
                          ),
                          const SizedBox(height: 3),
                          Text(
                            'Folio: $folio',
                            style: const TextStyle(
                              color: Colors.black45,
                              fontSize: 11.5,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(width: 8),
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        Text(
                          _money(
                            sale['total'] ??
                                sale['total_real'] ??
                                sale['total_expected'],
                          ),
                          style: const TextStyle(
                            color: _green,
                            fontSize: 18,
                            fontWeight: FontWeight.w900,
                          ),
                        ),
                        const SizedBox(height: 5),
                        const Icon(
                          Icons.chevron_right,
                          color: Colors.black38,
                        ),
                      ],
                    ),
                  ],
                ),
                const SizedBox(height: 14),
                const Divider(
                  height: 1,
                  color: Color(0xFFE8ECF2),
                ),
                const SizedBox(height: 12),
                ...items.map(
                  (item) => Padding(
                    padding: const EdgeInsets.only(bottom: 9),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Container(
                          height: 31,
                          width: 31,
                          decoration: BoxDecoration(
                            color: _wine.withValues(alpha: 0.10),
                            borderRadius: BorderRadius.circular(10),
                          ),
                          child: const Icon(
                            Icons.ac_unit,
                            size: 17,
                            color: _wine,
                          ),
                        ),
                        const SizedBox(width: 9),
                        Expanded(
                          child: Text(
                            (item['product_name'] ??
                                    item['name'] ??
                                    item['nombre'] ??
                                    'Producto')
                                .toString(),
                            style: const TextStyle(
                              color: _navy,
                              fontSize: 13.5,
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                        ),
                        Text(
                          '${item['quantity'] ?? item['qty_real'] ?? item['qty_assigned'] ?? 0} pzas.',
                          style: const TextStyle(
                            color: _navy,
                            fontSize: 13,
                            fontWeight: FontWeight.w900,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 3),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    _InfoBadge(
                      icon: Icons.inventory_2_outlined,
                      text: '${_totalUnits(sale)} productos',
                    ),
                    _InfoBadge(
                      icon: Icons.payments_outlined,
                      text: payment,
                    ),
                    if ((sale['sale_type'] ?? '')
                            .toString()
                            .toUpperCase() ==
                        'PUBLIC')
                      const _InfoBadge(
                        icon: Icons.people_outline,
                        text: 'Venta al público',
                      )
                    else
                      const _InfoBadge(
                        icon: Icons.storefront_outlined,
                        text: 'Cliente registrado',
                      ),
                  ],
                ),
                const SizedBox(height: 10),
                Row(
                  children: [
                    const Expanded(
                      child: Text(
                        'Toca para ver detalles y reimprimir',
                        style: TextStyle(
                          color: Colors.black45,
                          fontSize: 11.5,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                    TextButton.icon(
                      onPressed: _deleting
                          ? null
                          : () => _deleteSale(sale),
                      icon: const Icon(
                        Icons.delete_outline,
                        size: 18,
                      ),
                      label: const Text('Eliminar'),
                      style: TextButton.styleFrom(
                        foregroundColor: Colors.redAccent,
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

}

class ProductionSaleHistoryDetailPage extends StatefulWidget {
  final Map<String, dynamic> sale;
  final String fallbackEmployeeName;
  final Future<bool> Function(Map<String, dynamic> sale) onDelete;

  const ProductionSaleHistoryDetailPage({
    super.key,
    required this.sale,
    required this.fallbackEmployeeName,
    required this.onDelete,
  });

  @override
  State<ProductionSaleHistoryDetailPage> createState() =>
      _ProductionSaleHistoryDetailPageState();
}

class _ProductionSaleHistoryDetailPageState
    extends State<ProductionSaleHistoryDetailPage> {
  static const Color _navy = Color(0xFF0A1A2F);
  static const Color _green = Color(0xFF10B981);
  static const Color _wine = Color(0xFF852838);
  static const Color _background = Color(0xFFF4F7FB);

  bool _printing = false;
  bool _deleting = false;

  Map<String, dynamic> get sale => widget.sale;

  String _money(dynamic value) {
    final number = value is num
        ? value.toDouble()
        : double.tryParse(value?.toString() ?? '') ?? 0;

    return '\$${number.toStringAsFixed(2)}';
  }

  double _number(dynamic value) {
    if (value is num) return value.toDouble();
    return double.tryParse(value?.toString() ?? '') ?? 0;
  }

  int _integer(dynamic value) {
    if (value is num) return value.toInt();
    return int.tryParse(value?.toString() ?? '') ?? 0;
  }

  String _formatDate(dynamic raw) {
    final value = DateTime.tryParse(
      raw?.toString() ?? '',
    )?.toLocal();

    if (value == null) return 'Fecha no disponible';

    String two(int number) =>
        number.toString().padLeft(2, '0');

    return '${two(value.day)}/${two(value.month)}/${value.year} '
        '${two(value.hour)}:${two(value.minute)}';
  }

  List<Map<String, dynamic>> _items() {
    final raw = sale['items'];

    if (raw is! List) return const [];

    return raw
        .whereType<Map>()
        .map((item) => Map<String, dynamic>.from(item))
        .toList();
  }

  String _itemName(Map<String, dynamic> item) {
    return (item['product_name'] ??
            item['name'] ??
            item['nombre'] ??
            'Producto')
        .toString();
  }

  int _itemQuantity(Map<String, dynamic> item) {
    return _integer(
      item['quantity'] ??
          item['qty_real'] ??
          item['qty_assigned'],
    );
  }

  double _itemUnitPrice(Map<String, dynamic> item) {
    return _number(
      item['unit_price'] ??
          item['precio_aplicado'] ??
          item['precio'],
    );
  }

  double _itemSubtotal(Map<String, dynamic> item) {
    final quantity = _itemQuantity(item);
    final unitPrice = _itemUnitPrice(item);

    return _number(
      item['subtotal'] ??
          item['subtotal_real'] ??
          item['subtotal_expected'] ??
          quantity * unitPrice,
    );
  }

  String _employeeName() {
    final value = (sale['employee_name'] ??
            sale['production_employee_name'] ??
            widget.fallbackEmployeeName)
        .toString()
        .trim();

    return value.isEmpty
        ? widget.fallbackEmployeeName
        : value;
  }

  Future<void> _printCopy() async {
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
                  'No hay impresora conectada. Entra primero a Bluetooth '
                      'y conecta la impresora.',
            ),
            backgroundColor: const Color(0xFFEF4444),
          ),
        );
        return;
      }

      final ticketItems = _items()
          .map(
            (item) => PrinterTicketItem(
              qtyReal: _itemQuantity(item),
              description: _itemName(item),
              unitPrice: _itemUnitPrice(item),
              amount: _itemSubtotal(item),
            ),
          )
          .toList();

      final rawDate =
          sale['created_at'] ?? sale['delivered_at'];

      final printed = await printer.printDeliveryTicket(
        folio: (sale['folio'] ?? 'VENTA').toString(),
        customerName:
            (sale['customer_name'] ?? 'Público general').toString(),
        dinerName: '',
        driverName: _employeeName(),
        deliveredAt: rawDate?.toString(),
        items: ticketItems,
        totalReal: _number(
          sale['total'] ??
              sale['total_real'] ??
              sale['total_expected'],
        ),
        paymentMethod:
            (sale['payment_method'] ?? 'EFECTIVO').toString(),
        copies: 1,
        copyLabel: 'COPIA',
      );

      if (!mounted) return;

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            printed
                ? 'Copia enviada a la impresora.'
                : printer.lastError ??
                    'No se pudo imprimir la copia.',
          ),
          backgroundColor: printed
              ? _green
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

  Future<void> _deleteCurrentSale() async {
    if (_deleting) return;

    setState(() {
      _deleting = true;
    });

    try {
      final deleted =
          await widget.onDelete(sale);

      if (
        deleted &&
        mounted
      ) {
        Navigator.of(context).pop(true);
      }
    } finally {
      if (mounted) {
        setState(() {
          _deleting = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final items = _items();
    final total = sale['total'] ??
        sale['total_real'] ??
        sale['total_expected'];

    return Scaffold(
      backgroundColor: _background,
      appBar: AppBar(
        backgroundColor: _navy,
        foregroundColor: Colors.white,
        title: const Text(
          'Detalle de venta',
          style: TextStyle(fontWeight: FontWeight.w900),
        ),
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 28),
          children: [
            Container(
              padding: const EdgeInsets.all(18),
              decoration: BoxDecoration(
                gradient: const LinearGradient(
                  colors: [_navy, Color(0xFF1E4A7A)],
                ),
                borderRadius: BorderRadius.circular(22),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Venta registrada',
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 19,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                  const SizedBox(height: 14),
                  _DetailLine(
                    label: 'Folio',
                    value: (sale['folio'] ?? 'VENTA').toString(),
                  ),
                  _DetailLine(
                    label: 'Cliente',
                    value: (sale['customer_name'] ??
                            'Público general')
                        .toString(),
                  ),
                  _DetailLine(
                    label: 'Atendió',
                    value: _employeeName(),
                  ),
                  _DetailLine(
                    label: 'Fecha',
                    value: _formatDate(
                      sale['created_at'] ??
                          sale['delivered_at'],
                    ),
                  ),
                  _DetailLine(
                    label: 'Pago',
                    value: (sale['payment_method'] ??
                            'EFECTIVO')
                        .toString(),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),
            Container(
              padding: const EdgeInsets.all(17),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(22),
                border: Border.all(
                  color: const Color(0xFFE4E9F1),
                ),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Productos',
                    style: TextStyle(
                      color: _navy,
                      fontSize: 17,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                  const SizedBox(height: 12),
                  if (items.isEmpty)
                    const Text(
                      'No hay productos disponibles para esta venta.',
                      style: TextStyle(
                        color: Colors.black54,
                        fontWeight: FontWeight.w600,
                      ),
                    )
                  else
                    ...items.map(
                      (item) => Container(
                        margin: const EdgeInsets.only(bottom: 10),
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: const Color(0xFFF8FAFC),
                          borderRadius: BorderRadius.circular(15),
                          border: Border.all(
                            color: const Color(0xFFE8ECF2),
                          ),
                        ),
                        child: Row(
                          crossAxisAlignment:
                              CrossAxisAlignment.start,
                          children: [
                            Container(
                              height: 38,
                              width: 38,
                              decoration: BoxDecoration(
                                color: _wine.withValues(
                                  alpha: 0.10,
                                ),
                                borderRadius:
                                    BorderRadius.circular(12),
                              ),
                              child: const Icon(
                                Icons.ac_unit,
                                size: 19,
                                color: _wine,
                              ),
                            ),
                            const SizedBox(width: 10),
                            Expanded(
                              child: Column(
                                crossAxisAlignment:
                                    CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    _itemName(item),
                                    style: const TextStyle(
                                      color: _navy,
                                      fontWeight:
                                          FontWeight.w900,
                                    ),
                                  ),
                                  const SizedBox(height: 4),
                                  Text(
                                    '${_itemQuantity(item)} x '
                                    '${_money(_itemUnitPrice(item))}',
                                    style: const TextStyle(
                                      color: Colors.black54,
                                      fontSize: 12.5,
                                      fontWeight:
                                          FontWeight.w600,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                            Text(
                              _money(_itemSubtotal(item)),
                              style: const TextStyle(
                                color: _navy,
                                fontWeight: FontWeight.w900,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  const Divider(
                    height: 24,
                    color: Color(0xFFE8ECF2),
                  ),
                  Row(
                    children: [
                      const Expanded(
                        child: Text(
                          'TOTAL',
                          style: TextStyle(
                            color: _navy,
                            fontSize: 18,
                            fontWeight: FontWeight.w900,
                          ),
                        ),
                      ),
                      Text(
                        _money(total),
                        style: const TextStyle(
                          color: _green,
                          fontSize: 22,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),
            SizedBox(
              width: double.infinity,
              child: FilledButton.icon(
                onPressed: _printing ? null : _printCopy,
                icon: _printing
                    ? const SizedBox(
                        height: 18,
                        width: 18,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: Colors.white,
                        ),
                      )
                    : const Icon(Icons.print_outlined),
                label: Text(
                  _printing
                      ? 'Imprimiendo copia...'
                      : 'Reimprimir ticket',
                ),
                style: FilledButton.styleFrom(
                  backgroundColor: _wine,
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(
                    vertical: 15,
                  ),
                ),
              ),
            ),
            const SizedBox(height: 12),
            SizedBox(
              width: double.infinity,
              child: OutlinedButton.icon(
                onPressed:
                    _deleting ? null : _deleteCurrentSale,
                icon: _deleting
                    ? const SizedBox(
                        height: 18,
                        width: 18,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                        ),
                      )
                    : const Icon(Icons.delete_outline),
                label: Text(
                  _deleting
                      ? 'Eliminando venta...'
                      : 'Eliminar venta',
                ),
                style: OutlinedButton.styleFrom(
                  foregroundColor: Colors.redAccent,
                  side: const BorderSide(
                    color: Colors.redAccent,
                  ),
                  padding: const EdgeInsets.symmetric(
                    vertical: 15,
                  ),
                ),
              ),
            ),
            const SizedBox(height: 10),
            const Text(
              'La reimpresión se marca como COPIA y usa la impresora '
              'conectada desde la pantalla Bluetooth.',
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
    );
  }
}

class _DetailLine extends StatelessWidget {
  final String label;
  final String value;

  const _DetailLine({
    required this.label,
    required this.value,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 78,
            child: Text(
              '$label:',
              style: TextStyle(
                color: Colors.white.withValues(alpha: 0.70),
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
          Expanded(
            child: Text(
              value,
              style: const TextStyle(
                color: Colors.white,
                fontWeight: FontWeight.w900,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _SummaryPill extends StatelessWidget {
  final IconData icon;
  final String label;

  const _SummaryPill({
    required this.icon,
    required this.label,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: 11,
        vertical: 8,
      ),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(
          color: Colors.white.withValues(alpha: 0.18),
        ),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 16, color: Colors.white),
          const SizedBox(width: 6),
          Text(
            label,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 12,
              fontWeight: FontWeight.w800,
            ),
          ),
        ],
      ),
    );
  }
}

class _InfoBadge extends StatelessWidget {
  final IconData icon;
  final String text;

  const _InfoBadge({
    required this.icon,
    required this.text,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: 9,
        vertical: 6,
      ),
      decoration: BoxDecoration(
        color: const Color(0xFFF1F5F9),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            icon,
            size: 14,
            color: const Color(0xFF0A1A2F),
          ),
          const SizedBox(width: 5),
          Text(
            text,
            style: const TextStyle(
              color: Color(0xFF0A1A2F),
              fontSize: 11,
              fontWeight: FontWeight.w800,
            ),
          ),
        ],
      ),
    );
  }
}