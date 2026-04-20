import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class CustomerOrderPage extends StatefulWidget {
  const CustomerOrderPage({super.key});

  @override
  State<CustomerOrderPage> createState() => _CustomerOrderPageState();
}

class _CustomerOrderPageState extends State<CustomerOrderPage> {
  static const Color _navy = Color(0xFF0A1A2F);
  static const Color _accent = Color(0xFF4DADFF);
  static const Color _bg = Color(0xFFF4F7FB);

  final _formKey = GlobalKey<FormState>();
  final _supabase = Supabase.instance.client;

  final TextEditingController _nameCtrl = TextEditingController();
  final TextEditingController _phoneCtrl = TextEditingController();
  final TextEditingController _dateCtrl = TextEditingController();
  final TextEditingController _notesCtrl = TextEditingController();

  DateTime? _requiredDate;

  bool _loadingProducts = true;
  bool _saving = false;
  String? _loadError;

  List<_ProductOption> _products = const [];

  @override
  void initState() {
    super.initState();
    _loadProducts();
  }

  @override
  void dispose() {
    _nameCtrl.dispose();
    _phoneCtrl.dispose();
    _dateCtrl.dispose();
    _notesCtrl.dispose();
    super.dispose();
  }

  int get _totalPieces {
    int total = 0;
    for (final p in _products) {
      total += p.qty;
    }
    return total;
  }

  void _log(String message) {
    debugPrint('[CustomerOrderPage] $message');
  }

  Future<void> _loadProducts() async {
    if (!mounted) return;

    setState(() {
      _loadingProducts = true;
      _loadError = null;
    });

    try {
      final currentUser = _supabase.auth.currentUser;
      _log('AUTH USER ID => ${currentUser?.id ?? 'SIN SESION'}');
      _log('AUTH USER EMAIL => ${currentUser?.email ?? 'SIN EMAIL'}');

      final rows = await _supabase
          .from('products')
          .select('id,nombre,kind,ice_type,kg_por_unidad,activo')
          .eq('activo', true)
          .order('nombre', ascending: true);

      _log('SUPABASE PRODUCTS RAW => $rows');
      _log('SUPABASE PRODUCTS COUNT => ${(rows as List).length}');

      final mapped = (rows as List<dynamic>)
          .whereType<Map<String, dynamic>>()
          .map(_ProductOption.fromMap)
          .where((p) => p.id.isNotEmpty && p.name.trim().isNotEmpty)
          .toList();

      mapped.sort(
        (a, b) => a.name.toLowerCase().compareTo(b.name.toLowerCase()),
      );

      if (!mounted) return;

      setState(() {
        _products = List<_ProductOption>.unmodifiable(mapped);
        _loadingProducts = false;
      });

      if (mapped.isEmpty) {
        setState(() {
          _loadError =
              'La consulta sí corrió, pero regresó 0 productos activos. '
              'Esto normalmente significa que la app móvil está conectada a otra Supabase '
              'o que RLS no le permite leer la tabla products.';
        });
      }
    } on PostgrestException catch (e) {
      _log('POSTGREST ERROR => ${e.message}');
      _log('POSTGREST DETAILS => ${e.details}');
      _log('POSTGREST HINT => ${e.hint}');

      if (!mounted) return;
      setState(() {
        _loadingProducts = false;
        _loadError = e.message.isEmpty
            ? 'No se pudieron cargar los productos'
            : e.message;
      });
    } catch (e) {
      _log('GENERIC ERROR => $e');

      if (!mounted) return;
      setState(() {
        _loadingProducts = false;
        _loadError = 'Error al cargar productos: $e';
      });
    }
  }

  void _changeQty(int index, int delta) {
    if (index < 0 || index >= _products.length) return;

    setState(() {
      final current = _products[index].qty;
      final next = current + delta;

      _products = List<_ProductOption>.from(_products)
        ..[index] = _products[index].copyWith(qty: next < 0 ? 0 : next);
    });
  }

  Future<void> _pickDate() async {
    final now = DateTime.now();
    final firstDate = DateTime(now.year, now.month, now.day);

    final picked = await showDatePicker(
      context: context,
      initialDate: _requiredDate ?? firstDate,
      firstDate: firstDate,
      lastDate: DateTime(now.year + 2),
      builder: (context, child) {
        return Theme(
          data: Theme.of(context).copyWith(
            colorScheme: const ColorScheme.light(primary: _navy),
          ),
          child: child!,
        );
      },
    );

    if (picked == null || !mounted) return;

    setState(() {
      _requiredDate = picked;
      _dateCtrl.text =
          '${picked.day.toString().padLeft(2, '0')}/'
          '${picked.month.toString().padLeft(2, '0')}/'
          '${picked.year}';
    });
  }

  String _friendlyDbError(PostgrestException e) {
    final msg = e.message.toLowerCase();

    if (msg.contains('row-level security') ||
        msg.contains('violates row-level security policy')) {
      return 'No se pudo guardar el pedido por una restricción de seguridad en Supabase. Revisa las policies de INSERT para public_order_requests y public_order_request_items.';
    }

    if (msg.contains('not-null')) {
      return 'Faltan campos obligatorios para guardar el pedido.';
    }

    if (msg.contains('foreign key')) {
      return 'Hay un problema de relación entre el pedido y sus productos.';
    }

    return e.message.isEmpty ? 'No se pudo enviar el pedido' : e.message;
  }

  Future<void> _submitOrder() async {
    if (_loadingProducts || _saving) return;
    if (!_formKey.currentState!.validate()) return;

    final selectedProducts = _products
        .where((p) => p.qty > 0)
        .map(
          (p) => {
            'product_id': p.id,
            'product_name': p.name,
            'qty': p.qty,
          },
        )
        .toList(growable: false);

    if (selectedProducts.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Agrega al menos un producto al pedido'),
        ),
      );
      return;
    }

    if (_requiredDate == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Selecciona la fecha requerida'),
        ),
      );
      return;
    }

    setState(() => _saving = true);

    try {
      final fechaRequerida =
          '${_requiredDate!.year.toString().padLeft(4, '0')}-'
          '${_requiredDate!.month.toString().padLeft(2, '0')}-'
          '${_requiredDate!.day.toString().padLeft(2, '0')}';

      final requestPayload = {
        'nombre': _nameCtrl.text.trim(),
        'telefono': _phoneCtrl.text.trim().isEmpty
            ? null
            : _phoneCtrl.text.trim(),
        'fecha_requerida': fechaRequerida,
        'notes': _notesCtrl.text.trim().isEmpty
            ? null
            : _notesCtrl.text.trim(),
      };

      _log('CREANDO PEDIDO PUBLICO => $requestPayload');

      final requestInsert = await _supabase
          .from('public_order_requests')
          .insert(requestPayload)
          .select('id')
          .single();

      final requestId = requestInsert['id']?.toString() ?? '';

      if (requestId.isEmpty) {
        throw Exception('No se pudo obtener el id del pedido');
      }

      final items = selectedProducts
          .map(
            (item) => {
              'request_id': requestId,
              'product_id': item['product_id'],
              'product_name': item['product_name'],
              'qty': item['qty'],
            },
          )
          .toList(growable: false);

      _log('INSERTANDO ITEMS => $items');

      await _supabase.from('public_order_request_items').insert(items);

      if (!mounted) return;

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Pedido enviado correctamente. Será revisado por administración.',
          ),
        ),
      );

      _formKey.currentState?.reset();
      _nameCtrl.clear();
      _phoneCtrl.clear();
      _dateCtrl.clear();
      _notesCtrl.clear();

      setState(() {
        _requiredDate = null;
        _products = _products
            .map((p) => p.copyWith(qty: 0))
            .toList(growable: false);
      });
    } on PostgrestException catch (e) {
      _log('ERROR AL ENVIAR PEDIDO => ${e.message}');
      _log('DETAILS => ${e.details}');
      _log('HINT => ${e.hint}');

      if (!mounted) return;

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(_friendlyDbError(e)),
        ),
      );
    } catch (e) {
      _log('ERROR GENERICO AL ENVIAR PEDIDO => $e');

      if (!mounted) return;

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Error al enviar el pedido: $e'),
        ),
      );
    } finally {
      if (mounted) {
        setState(() => _saving = false);
      }
    }
  }

  Widget _buildProductsSection() {
    if (_loadingProducts) {
      return Container(
        width: double.infinity,
        padding: const EdgeInsets.all(18),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(
            color: Colors.black.withOpacity(0.06),
          ),
        ),
        child: const Column(
          children: [
            SizedBox(height: 10),
            CircularProgressIndicator(),
            SizedBox(height: 14),
            Text('Cargando productos...'),
            SizedBox(height: 10),
          ],
        ),
      );
    }

    if (_loadError != null) {
      return Container(
        width: double.infinity,
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(
            color: Colors.red.withOpacity(0.20),
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'No se pudieron cargar los productos',
              style: TextStyle(
                fontSize: 15,
                fontWeight: FontWeight.w800,
                color: Colors.red,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              _loadError!,
              style: const TextStyle(
                color: Colors.black87,
                height: 1.35,
              ),
            ),
            const SizedBox(height: 12),
            FilledButton.icon(
              onPressed: _saving ? null : _loadProducts,
              icon: const Icon(Icons.refresh),
              label: const Text('Reintentar'),
              style: FilledButton.styleFrom(
                backgroundColor: _navy,
                foregroundColor: Colors.white,
              ),
            ),
          ],
        ),
      );
    }

    if (_products.isEmpty) {
      return Container(
        width: double.infinity,
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(
            color: Colors.black.withOpacity(0.06),
          ),
        ),
        child: const Text(
          'No hay productos activos disponibles para pedir.',
          style: TextStyle(
            fontWeight: FontWeight.w700,
          ),
        ),
      );
    }

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(
          color: Colors.black.withOpacity(0.06),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Productos',
            style: TextStyle(
              fontSize: 15,
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: 14),
          ...List.generate(_products.length, (index) {
            final p = _products[index];

            return Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 14,
                  vertical: 12,
                ),
                decoration: BoxDecoration(
                  color: const Color(0xFFF8FAFC),
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(
                    color: Colors.black.withOpacity(0.06),
                  ),
                ),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: Padding(
                        padding: const EdgeInsets.only(right: 8),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              p.name,
                              style: const TextStyle(
                                fontSize: 14,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                            const SizedBox(height: 4),
                            Text(
                              p.subtitle,
                              style: TextStyle(
                                fontSize: 12,
                                color: Colors.black.withOpacity(0.62),
                                height: 1.25,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                    IconButton(
                      onPressed: _saving ? null : () => _changeQty(index, -1),
                      icon: const Icon(Icons.remove_circle_outline),
                    ),
                    Container(
                      width: 36,
                      alignment: Alignment.center,
                      child: Text(
                        '${p.qty}',
                        style: const TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                    ),
                    IconButton(
                      onPressed: _saving ? null : () => _changeQty(index, 1),
                      icon: const Icon(Icons.add_circle_outline),
                    ),
                  ],
                ),
              ),
            );
          }),
        ],
      ),
    );
  }

  Widget _buildHeroCard() {
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: _navy,
        borderRadius: BorderRadius.circular(22),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.12),
            blurRadius: 14,
            offset: const Offset(0, 6),
          ),
        ],
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            height: 58,
            width: 58,
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(16),
            ),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(16),
              child: Padding(
                padding: const EdgeInsets.all(8),
                child: Image.asset(
                  'assets/images/global_ice.png',
                  fit: BoxFit.contain,
                  filterQuality: FilterQuality.high,
                  errorBuilder: (_, __, ___) {
                    return const Icon(
                      Icons.shopping_cart_checkout_rounded,
                      color: _navy,
                      size: 30,
                    );
                  },
                ),
              ),
            ),
          ),
          const SizedBox(width: 14),
          const Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Formulario de pedidos',
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 20,
                    fontWeight: FontWeight.w900,
                  ),
                ),
                SizedBox(height: 6),
                Text(
                  'Selecciona tu producto y cantidad requerida.',
                  style: TextStyle(
                    color: Colors.white70,
                    height: 1.35,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final canSubmit =
        !_saving && !_loadingProducts && _loadError == null && _products.isNotEmpty;

    return Scaffold(
      backgroundColor: _bg,
      appBar: AppBar(
        backgroundColor: _navy,
        foregroundColor: Colors.white,
        title: const Text('Hacer pedido'),
      ),
      body: SafeArea(
        child: Column(
          children: [
            Expanded(
              child: ListView(
                padding: const EdgeInsets.all(18),
                children: [
                  _buildHeroCard(),
                  const SizedBox(height: 18),
                  Form(
                    key: _formKey,
                    child: Column(
                      children: [
                        _FieldCard(
                          child: TextFormField(
                            controller: _nameCtrl,
                            textCapitalization: TextCapitalization.words,
                            decoration: const InputDecoration(
                              labelText: 'Nombre del cliente o negocio',
                              prefixIcon: Icon(Icons.person_outline),
                              border: OutlineInputBorder(),
                            ),
                            validator: (value) {
                              if (value == null || value.trim().isEmpty) {
                                return 'Ingresa el nombre';
                              }
                              return null;
                            },
                          ),
                        ),
                        const SizedBox(height: 14),
                        _FieldCard(
                          child: TextFormField(
                            controller: _phoneCtrl,
                            keyboardType: TextInputType.phone,
                            decoration: const InputDecoration(
                              labelText: 'Teléfono de contacto',
                              prefixIcon: Icon(Icons.phone_outlined),
                              border: OutlineInputBorder(),
                            ),
                            validator: (value) {
                              final phone = value?.trim() ?? '';
                              if (phone.isEmpty) {
                                return 'Ingresa el teléfono';
                              }
                              if (phone.length < 10) {
                                return 'Ingresa un teléfono válido';
                              }
                              return null;
                            },
                          ),
                        ),
                        const SizedBox(height: 14),
                        _FieldCard(
                          child: TextFormField(
                            controller: _dateCtrl,
                            readOnly: true,
                            onTap: _pickDate,
                            decoration: const InputDecoration(
                              labelText: 'Fecha requerida',
                              prefixIcon: Icon(Icons.calendar_month_outlined),
                              border: OutlineInputBorder(),
                            ),
                            validator: (value) {
                              if (value == null || value.trim().isEmpty) {
                                return 'Selecciona la fecha requerida';
                              }
                              return null;
                            },
                          ),
                        ),
                        const SizedBox(height: 14),
                        _FieldCard(
                          child: TextFormField(
                            controller: _notesCtrl,
                            maxLines: 3,
                            textCapitalization: TextCapitalization.sentences,
                            decoration: const InputDecoration(
                              labelText: 'Notas u observaciones',
                              prefixIcon: Icon(Icons.notes_outlined),
                              border: OutlineInputBorder(),
                              alignLabelWithHint: true,
                            ),
                          ),
                        ),
                        const SizedBox(height: 14),
                        _buildProductsSection(),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            Container(
              padding: const EdgeInsets.fromLTRB(18, 14, 18, 18),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: const BorderRadius.vertical(
                  top: Radius.circular(26),
                ),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withOpacity(0.10),
                    blurRadius: 14,
                    offset: const Offset(0, -4),
                  ),
                ],
              ),
              child: SafeArea(
                top: false,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Row(
                      children: [
                        const Expanded(
                          child: Text(
                            'Total de piezas',
                            style: TextStyle(
                              fontSize: 15,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ),
                        Text(
                          '$_totalPieces',
                          style: const TextStyle(
                            fontSize: 22,
                            fontWeight: FontWeight.w900,
                            color: _navy,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    SizedBox(
                      width: double.infinity,
                      child: FilledButton.icon(
                        onPressed: canSubmit ? _submitOrder : null,
                        icon: _saving
                            ? const SizedBox(
                                height: 18,
                                width: 18,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2.2,
                                  color: Colors.white,
                                ),
                              )
                            : const Icon(Icons.send_rounded),
                        label: Text(
                          _saving ? 'Enviando...' : 'Enviar pedido',
                        ),
                        style: FilledButton.styleFrom(
                          backgroundColor: _accent,
                          foregroundColor: Colors.white,
                          padding: const EdgeInsets.symmetric(vertical: 15),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(18),
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ProductOption {
  final String id;
  final String name;
  final String kind;
  final String iceType;
  final num kgPorUnidad;
  final int qty;

  const _ProductOption({
    required this.id,
    required this.name,
    required this.kind,
    required this.iceType,
    required this.kgPorUnidad,
    required this.qty,
  });

  factory _ProductOption.fromMap(Map<String, dynamic> map) {
    return _ProductOption(
      id: (map['id'] ?? '').toString(),
      name: (map['nombre'] ?? '').toString().trim(),
      kind: (map['kind'] ?? '').toString().trim(),
      iceType: (map['ice_type'] ?? '').toString().trim(),
      kgPorUnidad: _toNum(map['kg_por_unidad']),
      qty: 0,
    );
  }

  _ProductOption copyWith({
    String? id,
    String? name,
    String? kind,
    String? iceType,
    num? kgPorUnidad,
    int? qty,
  }) {
    return _ProductOption(
      id: id ?? this.id,
      name: name ?? this.name,
      kind: kind ?? this.kind,
      iceType: iceType ?? this.iceType,
      kgPorUnidad: kgPorUnidad ?? this.kgPorUnidad,
      qty: qty ?? this.qty,
    );
  }

  String get subtitle {
    final parts = <String>[];

    if (kind.trim().isNotEmpty) {
      parts.add(kind.toUpperCase());
    }
    if (iceType.trim().isNotEmpty) {
      parts.add(iceType);
    }
    if (kgPorUnidad > 0) {
      parts.add('${_formatKg(kgPorUnidad)} kg');
    }

    if (parts.isEmpty) return 'Producto activo';
    return parts.join(' • ');
  }

  static num _toNum(dynamic value) {
    if (value == null) return 0;
    if (value is num) return value;
    return num.tryParse(value.toString()) ?? 0;
  }

  static String _formatKg(num value) {
    if (value == value.truncate()) {
      return value.truncate().toString();
    }
    return value.toString();
  }
}

class _FieldCard extends StatelessWidget {
  final Widget child;

  const _FieldCard({required this.child});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(
          color: Colors.black.withOpacity(0.06),
        ),
      ),
      child: child,
    );
  }
}