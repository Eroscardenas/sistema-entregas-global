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
  static const Color _navySoft = Color(0xFF14345C);
  static const Color _accent = Color(0xFF4DADFF);
  static const Color _accentSoft = Color(0xFFEAF5FF);
  static const Color _bg = Color(0xFFF3F7FB);
  static const Color _card = Colors.white;
  static const Color _muted = Color(0xFF6B7280);
  static const Color _border = Color(0xFFE5E7EB);
  static const Color _success = Color(0xFF0F766E);

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

  List<_CommercialProductOption> _products = const [];

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

  int get _selectedProductsCount {
    int total = 0;
    for (final p in _products) {
      if (p.qty > 0) total++;
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
          .from('public_catalog_products')
          .select(
            'setting_id, firebase_bolsa_vacia_codigo, firebase_tipo_hielo, peso_kg, nombre_comercial, activo',
          )
          .eq('activo', true)
          .order('nombre_comercial', ascending: true);

      _log('PUBLIC CATALOG RAW => $rows');
      _log('PUBLIC CATALOG COUNT => ${(rows as List).length}');

      final mapped = (rows as List<dynamic>)
          .whereType<Map<String, dynamic>>()
          .map(_CommercialProductOption.fromMap)
          .where((p) => p.settingId.isNotEmpty && p.name.trim().isNotEmpty)
          .toList();

      mapped.sort(
        (a, b) => a.name.toLowerCase().compareTo(b.name.toLowerCase()),
      );

      if (!mounted) return;

      setState(() {
        _products = List<_CommercialProductOption>.unmodifiable(mapped);
        _loadingProducts = false;
      });

      if (mapped.isEmpty) {
        setState(() {
          _loadError =
              'La consulta sí corrió, pero regresó 0 productos comerciales activos. '
              'Revisa que inventory_product_settings tenga nombre_comercial, activo=true '
              'y que la vista public_catalog_products exista y sea legible para la app móvil.';
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
            ? 'No se pudieron cargar los productos comerciales'
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

      _products = List<_CommercialProductOption>.from(_products)
        ..[index] = _products[index].copyWith(qty: next < 0 ? 0 : next);
    });
  }

  void _setQty(int index, int value) {
    if (index < 0 || index >= _products.length) return;

    setState(() {
      _products = List<_CommercialProductOption>.from(_products)
        ..[index] = _products[index].copyWith(qty: value < 0 ? 0 : value);
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
            'setting_id': p.settingId,
            'product_name': p.name,
            'qty': p.qty,
            'firebase_bolsa_vacia_codigo': p.bolsaVaciaCodigo,
            'firebase_tipo_hielo': p.iceType,
            'peso_kg': p.kgPorUnidad,
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
              'setting_id': item['setting_id'],
              'product_name': item['product_name'],
              'qty': item['qty'],
              'firebase_bolsa_vacia_codigo':
                  item['firebase_bolsa_vacia_codigo'],
              'firebase_tipo_hielo': item['firebase_tipo_hielo'],
              'peso_kg': item['peso_kg'],
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

  Widget _buildHeader() {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [_navy, _navySoft],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(28),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.14),
            blurRadius: 22,
            offset: const Offset(0, 10),
          ),
        ],
      ),
      child: Column(
        children: [
          Row(
            children: [
              Container(
                height: 62,
                width: 62,
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(18),
                ),
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(18),
                  child: Padding(
                    padding: const EdgeInsets.all(10),
                    child: Image.asset(
                      'assets/images/global_ice.png',
                      fit: BoxFit.contain,
                      errorBuilder: (_, __, ___) {
                        return const Icon(
                          Icons.ac_unit_rounded,
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
                      'Global Ice',
                      style: TextStyle(
                        color: Colors.white,
                        fontSize: 22,
                        fontWeight: FontWeight.w900,
                        letterSpacing: 0.2,
                      ),
                    ),
                    SizedBox(height: 4),
                    Text(
                      'Pedido de producto',
                      style: TextStyle(
                        color: Colors.white70,
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 18),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: Colors.white.withOpacity(0.10),
              borderRadius: BorderRadius.circular(18),
              border: Border.all(
                color: Colors.white.withOpacity(0.12),
              ),
            ),
            child: Text(
              _selectedProductsCount > 0
                  ? 'Has seleccionado $_selectedProductsCount producto(s). Ajusta cantidades y envía tu pedido.'
                  : 'Selecciona los productos que necesitas. El pedido será revisado por administración.',
              style: const TextStyle(
                color: Colors.white,
                height: 1.35,
                fontSize: 13.5,
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSectionTitle(String title, String subtitle) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          title,
          style: const TextStyle(
            fontSize: 17,
            fontWeight: FontWeight.w900,
            color: _navy,
          ),
        ),
        const SizedBox(height: 4),
        Text(
          subtitle,
          style: const TextStyle(
            fontSize: 13,
            color: _muted,
            height: 1.35,
          ),
        ),
      ],
    );
  }

  Widget _buildCard({required Widget child, EdgeInsets? padding}) {
    return Container(
      padding: padding ?? const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: _card,
        borderRadius: BorderRadius.circular(22),
        border: Border.all(color: _border),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.04),
            blurRadius: 14,
            offset: const Offset(0, 6),
          ),
        ],
      ),
      child: child,
    );
  }

  Widget _buildProductsSection() {
    if (_loadingProducts) {
      return _buildCard(
        padding: const EdgeInsets.all(24),
        child: const Column(
          children: [
            SizedBox(height: 6),
            CircularProgressIndicator(),
            SizedBox(height: 14),
            Text(
              'Cargando catálogo...',
              style: TextStyle(
                fontWeight: FontWeight.w800,
                color: _navy,
              ),
            ),
          ],
        ),
      );
    }

    if (_loadError != null) {
      return _buildCard(
        padding: const EdgeInsets.all(18),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'No se pudieron cargar los productos',
              style: TextStyle(
                fontSize: 15,
                fontWeight: FontWeight.w900,
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
            const SizedBox(height: 14),
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
      return _buildCard(
        child: const Text(
          'No hay productos comerciales activos disponibles para pedir.',
          style: TextStyle(
            fontWeight: FontWeight.w800,
            color: _navy,
          ),
        ),
      );
    }

    return Column(
      children: List.generate(_products.length, (index) {
        final product = _products[index];
        final selected = product.qty > 0;

        return Padding(
          padding: const EdgeInsets.only(bottom: 14),
          child: _ProductTile(
            product: product,
            selected: selected,
            enabled: !_saving,
            onDecrease: () => _changeQty(index, -1),
            onIncrease: () => _changeQty(index, 1),
            onReset: selected ? () => _setQty(index, 0) : null,
          ),
        );
      }),
    );
  }

  @override
  Widget build(BuildContext context) {
    final canSubmit =
        !_saving && !_loadingProducts && _loadError == null && _products.isNotEmpty;

    return Scaffold(
      backgroundColor: _bg,
      appBar: AppBar(
        elevation: 0,
        backgroundColor: _bg,
        foregroundColor: _navy,
        centerTitle: true,
        title: const Text(
          'Hacer pedido',
          style: TextStyle(
            fontWeight: FontWeight.w900,
            letterSpacing: 0.2,
          ),
        ),
      ),
      body: SafeArea(
        child: Column(
          children: [
            Expanded(
              child: ListView(
                padding: const EdgeInsets.fromLTRB(18, 8, 18, 18),
                children: [
                  _buildHeader(),
                  const SizedBox(height: 22),
                  _buildSectionTitle(
                    'Datos del pedido',
                    'Completa la información para registrar tu solicitud.',
                  ),
                  const SizedBox(height: 12),
                  Form(
                    key: _formKey,
                    child: Column(
                      children: [
                        _buildCard(
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
                        _buildCard(
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
                        _buildCard(
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
                        _buildCard(
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
                        const SizedBox(height: 24),
                        _buildSectionTitle(
                          'Catálogo',
                          'Selecciona la cantidad que deseas pedir de cada producto.',
                        ),
                        const SizedBox(height: 12),
                        _buildProductsSection(),
                      ],
                    ),
                  ),
                  const SizedBox(height: 130),
                ],
              ),
            ),
            _BottomSummaryBar(
              totalPieces: _totalPieces,
              selectedProductsCount: _selectedProductsCount,
              canSubmit: canSubmit,
              saving: _saving,
              onSubmit: _submitOrder,
            ),
          ],
        ),
      ),
    );
  }
}

class _CommercialProductOption {
  final String settingId;
  final String bolsaVaciaCodigo;
  final String iceType;
  final num kgPorUnidad;
  final String name;
  final bool activo;
  final int qty;

  const _CommercialProductOption({
    required this.settingId,
    required this.bolsaVaciaCodigo,
    required this.iceType,
    required this.kgPorUnidad,
    required this.name,
    required this.activo,
    required this.qty,
  });

  factory _CommercialProductOption.fromMap(Map<String, dynamic> map) {
    return _CommercialProductOption(
      settingId: (map['setting_id'] ?? '').toString(),
      bolsaVaciaCodigo:
          (map['firebase_bolsa_vacia_codigo'] ?? '').toString().trim(),
      iceType: (map['firebase_tipo_hielo'] ?? '').toString().trim(),
      kgPorUnidad: _toNum(map['peso_kg']),
      name: (map['nombre_comercial'] ?? '').toString().trim(),
      activo: map['activo'] == true,
      qty: 0,
    );
  }

  _CommercialProductOption copyWith({
    String? settingId,
    String? bolsaVaciaCodigo,
    String? iceType,
    num? kgPorUnidad,
    String? name,
    bool? activo,
    int? qty,
  }) {
    return _CommercialProductOption(
      settingId: settingId ?? this.settingId,
      bolsaVaciaCodigo: bolsaVaciaCodigo ?? this.bolsaVaciaCodigo,
      iceType: iceType ?? this.iceType,
      kgPorUnidad: kgPorUnidad ?? this.kgPorUnidad,
      name: name ?? this.name,
      activo: activo ?? this.activo,
      qty: qty ?? this.qty,
    );
  }

  static num _toNum(dynamic value) {
    if (value == null) return 0;
    if (value is num) return value;
    return num.tryParse(value.toString()) ?? 0;
  }
}

class _ProductTile extends StatelessWidget {
  final _CommercialProductOption product;
  final bool selected;
  final bool enabled;
  final VoidCallback onDecrease;
  final VoidCallback onIncrease;
  final VoidCallback? onReset;

  const _ProductTile({
    required this.product,
    required this.selected,
    required this.enabled,
    required this.onDecrease,
    required this.onIncrease,
    this.onReset,
  });

  @override
  Widget build(BuildContext context) {
    return AnimatedContainer(
      duration: const Duration(milliseconds: 180),
      curve: Curves.easeOut,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: selected ? _CustomerOrderPageState._accentSoft : Colors.white,
        borderRadius: BorderRadius.circular(22),
        border: Border.all(
          color: selected
              ? _CustomerOrderPageState._accent
              : _CustomerOrderPageState._border,
          width: selected ? 1.4 : 1,
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.045),
            blurRadius: 14,
            offset: const Offset(0, 6),
          ),
        ],
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          Container(
            height: 46,
            width: 46,
            decoration: BoxDecoration(
              gradient: LinearGradient(
                colors: selected
                    ? const [
                        Color(0xFF4DADFF),
                        Color(0xFF88C9FF),
                      ]
                    : const [
                        Color(0xFFF8FAFC),
                        Color(0xFFF1F5F9),
                      ],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
              borderRadius: BorderRadius.circular(14),
            ),
            child: Icon(
              selected ? Icons.ac_unit_rounded : Icons.inventory_2_outlined,
              size: 22,
              color: selected
                  ? Colors.white
                  : _CustomerOrderPageState._navy,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              product.name,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                fontSize: 14.5,
                fontWeight: FontWeight.w900,
                color: _CustomerOrderPageState._navy,
                height: 1.1,
              ),
            ),
          ),
          const SizedBox(width: 8),
          SizedBox(
            width: 124,
            child: Align(
              alignment: Alignment.centerRight,
              child: _QtyControl(
                qty: product.qty,
                enabled: enabled,
                onDecrease: onDecrease,
                onIncrease: onIncrease,
                onReset: onReset,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _QtyControl extends StatelessWidget {
  final int qty;
  final bool enabled;
  final VoidCallback onDecrease;
  final VoidCallback onIncrease;
  final VoidCallback? onReset;

  const _QtyControl({
    required this.qty,
    required this.enabled,
    required this.onDecrease,
    required this.onIncrease,
    this.onReset,
  });

  @override
  Widget build(BuildContext context) {
    final canDecrease = enabled && qty > 0;
    final showReset = qty > 0 && onReset != null;

    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        SizedBox(
          width: 28,
          height: 28,
          child: AnimatedOpacity(
            duration: const Duration(milliseconds: 150),
            opacity: showReset ? 1 : 0,
            child: IgnorePointer(
              ignoring: !showReset || !enabled,
              child: InkWell(
                onTap: enabled ? onReset : null,
                borderRadius: BorderRadius.circular(8),
                child: Container(
                  decoration: BoxDecoration(
                    color: const Color(0xFFF3F4F6),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: const Icon(
                    Icons.delete_outline_rounded,
                    size: 16,
                    color: Colors.black54,
                  ),
                ),
              ),
            ),
          ),
        ),
        const SizedBox(width: 6),
        Container(
          height: 40,
          padding: const EdgeInsets.symmetric(horizontal: 4),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: _CustomerOrderPageState._border),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              InkWell(
                onTap: canDecrease ? onDecrease : null,
                borderRadius: BorderRadius.circular(8),
                child: Container(
                  height: 28,
                  width: 28,
                  decoration: BoxDecoration(
                    color: canDecrease
                        ? const Color(0xFFEFF6FF)
                        : const Color(0xFFF3F4F6),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Icon(
                    Icons.remove_rounded,
                    size: 18,
                    color: canDecrease ? const Color(0xFF2563EB) : Colors.grey,
                  ),
                ),
              ),
              SizedBox(
                width: 24,
                child: Center(
                  child: Text(
                    '$qty',
                    style: const TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w900,
                      color: _CustomerOrderPageState._navy,
                    ),
                  ),
                ),
              ),
              InkWell(
                onTap: enabled ? onIncrease : null,
                borderRadius: BorderRadius.circular(8),
                child: Container(
                  height: 28,
                  width: 28,
                  decoration: BoxDecoration(
                    color: enabled
                        ? const Color(0xFFDBEAFE)
                        : const Color(0xFFF3F4F6),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Icon(
                    Icons.add_rounded,
                    size: 18,
                    color: enabled ? const Color(0xFF2563EB) : Colors.grey,
                  ),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _BottomSummaryBar extends StatelessWidget {
  final int totalPieces;
  final int selectedProductsCount;
  final bool canSubmit;
  final bool saving;
  final VoidCallback onSubmit;

  const _BottomSummaryBar({
    required this.totalPieces,
    required this.selectedProductsCount,
    required this.canSubmit,
    required this.saving,
    required this.onSubmit,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(18, 16, 18, 18),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: const BorderRadius.vertical(
          top: Radius.circular(30),
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.10),
            blurRadius: 20,
            offset: const Offset(0, -6),
          ),
        ],
      ),
      child: SafeArea(
        top: false,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: const Color(0xFFF8FAFC),
                borderRadius: BorderRadius.circular(20),
                border: Border.all(color: _CustomerOrderPageState._border),
              ),
              child: Row(
                children: [
                  Container(
                    height: 46,
                    width: 46,
                    decoration: BoxDecoration(
                      color: _CustomerOrderPageState._accentSoft,
                      borderRadius: BorderRadius.circular(14),
                    ),
                    child: const Icon(
                      Icons.shopping_bag_outlined,
                      color: _CustomerOrderPageState._accent,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          'Resumen del pedido',
                          style: TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w700,
                            color: _CustomerOrderPageState._muted,
                          ),
                        ),
                        const SizedBox(height: 3),
                        Text(
                          '$totalPieces pieza(s) seleccionadas',
                          style: const TextStyle(
                            fontSize: 17,
                            fontWeight: FontWeight.w900,
                            color: _CustomerOrderPageState._navy,
                          ),
                        ),
                      ],
                    ),
                  ),
                  if (selectedProductsCount > 0)
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 10,
                        vertical: 7,
                      ),
                      decoration: BoxDecoration(
                        color: _CustomerOrderPageState._success.withOpacity(0.12),
                        borderRadius: BorderRadius.circular(999),
                      ),
                      child: Text(
                        '$selectedProductsCount productos',
                        style: const TextStyle(
                          color: _CustomerOrderPageState._success,
                          fontSize: 12,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                    ),
                ],
              ),
            ),
            const SizedBox(height: 14),
            SizedBox(
              width: double.infinity,
              child: FilledButton(
                onPressed: canSubmit ? onSubmit : null,
                style: FilledButton.styleFrom(
                  backgroundColor: _CustomerOrderPageState._accent,
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(vertical: 17),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(18),
                  ),
                  textStyle: const TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w900,
                    letterSpacing: 0.2,
                  ),
                ),
                child: saving
                    ? const SizedBox(
                        height: 20,
                        width: 20,
                        child: CircularProgressIndicator(
                          strokeWidth: 2.4,
                          color: Colors.white,
                        ),
                      )
                    : const Text('Enviar pedido'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}