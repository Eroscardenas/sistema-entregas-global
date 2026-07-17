import 'package:flutter/material.dart';

import 'package:mobile/features/production/production_sale_page.dart';
import 'package:mobile/features/production/production_sales_history_page.dart';
import 'package:mobile/features/production/production_printer_page.dart';

class ProductionDashboardPage extends StatelessWidget {
  final String nombre;
  final String profileId;

  const ProductionDashboardPage({
    super.key,
    required this.nombre,
    required this.profileId,
  });

  static const Color _navy = Color(0xFF0A1A2F);
  static const Color _blue = Color(0xFF4DADFF);
  static const Color _wine = Color(0xFF852838);
  static const Color _background = Color(0xFFF4F7FB);

  Future<void> _openProductionSale(
    BuildContext context, {
    required ProductionSaleMode mode,
  }) async {
    final result = await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        builder: (_) => ProductionSalePage(
          employeeId: profileId,
          employeeName: nombre,
          initialMode: mode,
        ),
      ),
    );

    if (result == true && context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Venta registrada correctamente.',
          ),
        ),
      );
    }
  }

  void _showComingSoon(
    BuildContext context,
    String module,
  ) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          '$module estará disponible en el siguiente paso.',
        ),
      ),
    );
  }

  Future<void> _logout(BuildContext context) async {
    final shouldLogout = await showDialog<bool>(
      context: context,
      builder: (dialogContext) {
        return AlertDialog(
          title: const Text('Cerrar sesión'),
          content: const Text(
            '¿Deseas salir del módulo de Producción?',
          ),
          actions: [
            TextButton(
              onPressed: () {
                Navigator.pop(dialogContext, false);
              },
              child: const Text('Cancelar'),
            ),
            FilledButton(
              onPressed: () {
                Navigator.pop(dialogContext, true);
              },
              child: const Text('Cerrar sesión'),
            ),
          ],
        );
      },
    );

    if (shouldLogout != true || !context.mounted) {
      return;
    }

    Navigator.of(context).popUntil(
      (route) => route.isFirst,
    );
  }

  @override
  Widget build(BuildContext context) {
    final firstName = nombre.trim().isEmpty
        ? 'Producción'
        : nombre.trim().split(' ').first;

    return Scaffold(
      backgroundColor: _background,
      body: SafeArea(
        child: Column(
          children: [
            _DashboardHeader(
              nombre: firstName,
              onLogout: () => _logout(context),
            ),
            Expanded(
              child: RefreshIndicator(
                onRefresh: () async {
                  await Future<void>.delayed(
                    const Duration(milliseconds: 500),
                  );

                  if (!context.mounted) return;

                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(
                      content: Text(
                        'Información actualizada.',
                      ),
                    ),
                  );
                },
                child: SingleChildScrollView(
                  physics: const AlwaysScrollableScrollPhysics(),
                  padding: const EdgeInsets.fromLTRB(
                    18,
                    20,
                    18,
                    28,
                  ),
                  child: Center(
                    child: ConstrainedBox(
                      constraints: const BoxConstraints(
                        maxWidth: 1000,
                      ),
                      child: Column(
                        crossAxisAlignment:
                            CrossAxisAlignment.start,
                        children: [
                          _WelcomeBanner(
                            nombre: firstName,
                          ),
                          const SizedBox(height: 18),
                          const _SectionTitle(
                            title: 'Resumen del turno',
                            subtitle:
                                'Información general de ventas y operación',
                          ),
                          const SizedBox(height: 12),
                          LayoutBuilder(
                            builder: (
                              context,
                              constraints,
                            ) {
                              final wide =
                                  constraints.maxWidth >= 720;

                              final cardWidth = wide
                                  ? (constraints.maxWidth - 24) / 3
                                  : (constraints.maxWidth - 12) / 2;

                              return Wrap(
                                spacing: 12,
                                runSpacing: 12,
                                children: [
                                  SizedBox(
                                    width: cardWidth,
                                    child: const _SummaryCard(
                                      title: 'Ventas del turno',
                                      value: '0',
                                      icon: Icons.point_of_sale,
                                      accent: _blue,
                                    ),
                                  ),
                                  SizedBox(
                                    width: cardWidth,
                                    child: const _SummaryCard(
                                      title: 'Total vendido',
                                      value: '\$0.00',
                                      icon:
                                          Icons.payments_outlined,
                                      accent:
                                          Color(0xFF24A36A),
                                    ),
                                  ),
                                  SizedBox(
                                    width: cardWidth,
                                    child: const _SummaryCard(
                                      title:
                                          'Productos vendidos',
                                      value: '0',
                                      icon:
                                          Icons.inventory_2_outlined,
                                      accent: _wine,
                                    ),
                                  ),
                                ],
                              );
                            },
                          ),
                          const SizedBox(height: 24),
                          const _SectionTitle(
                            title: 'Operaciones',
                            subtitle:
                                'Selecciona una opción para comenzar',
                          ),
                          const SizedBox(height: 12),
                          LayoutBuilder(
                            builder: (
                              context,
                              constraints,
                            ) {
                              final wide =
                                  constraints.maxWidth >= 720;

                              final itemWidth = wide
                                  ? (constraints.maxWidth - 16) / 2
                                  : constraints.maxWidth;

                              return Wrap(
                                spacing: 16,
                                runSpacing: 16,
                                children: [
                                  SizedBox(
                                    width: itemWidth,
                                    child: _ActionCard(
                                      title:
                                          'Venta a cliente',
                                      description:
                                          'Busca un cliente registrado y aplica sus precios especiales.',
                                      icon:
                                          Icons.storefront_outlined,
                                      accent: _blue,
                                      buttonText:
                                          'Nueva venta',
                                      onTap: () {
                                        _openProductionSale(
                                          context,
                                          mode:
                                              ProductionSaleMode
                                                  .customer,
                                        );
                                      },
                                    ),
                                  ),
                                  SizedBox(
                                    width: itemWidth,
                                    child: _ActionCard(
                                      title:
                                          'Venta al público',
                                      description:
                                          'Captura un nombre y vende con precios generales.',
                                      icon:
                                          Icons.shopping_cart_checkout,
                                      accent:
                                          const Color(0xFF24A36A),
                                      buttonText:
                                          'Venta rápida',
                                      onTap: () {
                                        _openProductionSale(
                                          context,
                                          mode:
                                              ProductionSaleMode
                                                  .public,
                                        );
                                      },
                                    ),
                                  ),
                                  SizedBox(
                                    width: itemWidth,
                                    child: _ActionCard(
                                      title:
                                          'Historial de ventas',
                                      description:
                                          'Revisa folios, clientes, totales e impresiones.',
                                      icon:
                                          Icons.receipt_long_outlined,
                                      accent:
                                          const Color(0xFF6E56CF),
                                      buttonText:
                                          'Ver historial',
                                      onTap: () {
                                        Navigator.of(context).push(
                                          MaterialPageRoute(
                                            builder: (_) =>
                                                ProductionSalesHistoryPage(
                                              employeeId: profileId,
                                              employeeName: nombre,
                                            ),
                                          ),
                                        );
                                      },
                                    ),
                                  ),
                                ],
                              );
                            },
                          ),
                          const SizedBox(height: 24),
                          const _SectionTitle(
                            title: 'Accesos rápidos',
                            subtitle:
                                'Herramientas del módulo de Producción',
                          ),
                          const SizedBox(height: 12),
                          _QuickActions(
                            onPrinter: () {
                             Navigator.of(context).push(
                              MaterialPageRoute(
                            builder: (_) => ProductionPrinterPage(
                             employeeName: nombre,
                              ),
                            ),
                          );
                        },
                            onCashCut: () {
                              _showComingSoon(
                                context,
                                'Corte de caja',
                              );
                            },
                            onRefresh: () {
                              ScaffoldMessenger.of(context)
                                  .showSnackBar(
                                const SnackBar(
                                  content: Text(
                                    'Información actualizada.',
                                  ),
                                ),
                              );
                            },
                          ),
                          const SizedBox(height: 24),
                          _SessionInfo(
                            nombre: nombre,
                            profileId: profileId,
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _DashboardHeader extends StatelessWidget {
  final String nombre;
  final VoidCallback onLogout;

  const _DashboardHeader({
    required this.nombre,
    required this.onLogout,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(
        18,
        14,
        14,
        14,
      ),
      decoration: const BoxDecoration(
        color: ProductionDashboardPage._navy,
        boxShadow: [
          BoxShadow(
            color: Color(0x22000000),
            blurRadius: 14,
            offset: Offset(0, 6),
          ),
        ],
      ),
      child: Row(
        children: [
          Container(
            height: 46,
            width: 46,
            padding: const EdgeInsets.all(7),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(14),
            ),
            child: Image.asset(
              'assets/images/global_ice.png',
              fit: BoxFit.contain,
              errorBuilder: (
                context,
                error,
                stackTrace,
              ) {
                return const Icon(
                  Icons.ac_unit,
                  color: ProductionDashboardPage._navy,
                );
              },
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment:
                  CrossAxisAlignment.start,
              children: [
                const Text(
                  'Global Ice Producción',
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 18,
                    fontWeight: FontWeight.w900,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  'Sesión de $nombre',
                  style: TextStyle(
                    color: Colors.white.withValues(
                      alpha: 0.68,
                    ),
                    fontSize: 12,
                  ),
                ),
              ],
            ),
          ),
          IconButton(
            tooltip: 'Cerrar sesión',
            onPressed: onLogout,
            icon: const Icon(
              Icons.logout,
              color: Colors.white,
            ),
          ),
        ],
      ),
    );
  }
}

class _WelcomeBanner extends StatelessWidget {
  final String nombre;

  const _WelcomeBanner({
    required this.nombre,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(22),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(26),
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            ProductionDashboardPage._navy,
            Color(0xFF12365C),
            Color(0xFF1E5B88),
          ],
        ),
        boxShadow: const [
          BoxShadow(
            color: Color(0x280A1A2F),
            blurRadius: 24,
            offset: Offset(0, 12),
          ),
        ],
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment:
                  CrossAxisAlignment.start,
              children: [
                Text(
                  'Hola, $nombre 👋',
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 25,
                    fontWeight: FontWeight.w900,
                  ),
                ),
                const SizedBox(height: 7),
                Text(
                  'Registra ventas, consulta inventario y genera tickets desde esta tablet.',
                  style: TextStyle(
                    color: Colors.white.withValues(
                      alpha: 0.78,
                    ),
                    fontSize: 14,
                    height: 1.4,
                  ),
                ),
                const SizedBox(height: 14),
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 12,
                    vertical: 7,
                  ),
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(
                      alpha: 0.12,
                    ),
                    borderRadius:
                        BorderRadius.circular(999),
                    border: Border.all(
                      color: Colors.white.withValues(
                        alpha: 0.18,
                      ),
                    ),
                  ),
                  child: const Text(
                    'Módulo de venta en Producción',
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 12,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 16),
          Container(
            height: 86,
            width: 86,
            decoration: BoxDecoration(
              color: Colors.white.withValues(
                alpha: 0.12,
              ),
              borderRadius: BorderRadius.circular(24),
              border: Border.all(
                color: Colors.white.withValues(
                  alpha: 0.18,
                ),
              ),
            ),
            child: const Icon(
              Icons.factory_outlined,
              size: 46,
              color: Colors.white,
            ),
          ),
        ],
      ),
    );
  }
}

class _SectionTitle extends StatelessWidget {
  final String title;
  final String subtitle;

  const _SectionTitle({
    required this.title,
    required this.subtitle,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment:
          CrossAxisAlignment.start,
      children: [
        Text(
          title,
          style: const TextStyle(
            color: ProductionDashboardPage._navy,
            fontSize: 19,
            fontWeight: FontWeight.w900,
          ),
        ),
        const SizedBox(height: 3),
        Text(
          subtitle,
          style: const TextStyle(
            color: Colors.black54,
            fontSize: 13,
          ),
        ),
      ],
    );
  }
}

class _SummaryCard extends StatelessWidget {
  final String title;
  final String value;
  final IconData icon;
  final Color accent;

  const _SummaryCard({
    required this.title,
    required this.value,
    required this.icon,
    required this.accent,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(17),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(
          color: const Color(0xFFE5EAF1),
        ),
        boxShadow: const [
          BoxShadow(
            color: Color(0x10000000),
            blurRadius: 14,
            offset: Offset(0, 7),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment:
            CrossAxisAlignment.start,
        children: [
          Container(
            height: 42,
            width: 42,
            decoration: BoxDecoration(
              color: accent.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(13),
            ),
            child: Icon(
              icon,
              color: accent,
              size: 23,
            ),
          ),
          const SizedBox(height: 15),
          Text(
            value,
            style: const TextStyle(
              color: ProductionDashboardPage._navy,
              fontSize: 23,
              fontWeight: FontWeight.w900,
            ),
          ),
          const SizedBox(height: 3),
          Text(
            title,
            style: const TextStyle(
              color: Colors.black54,
              fontSize: 12.5,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }
}

class _ActionCard extends StatelessWidget {
  final String title;
  final String description;
  final IconData icon;
  final Color accent;
  final String buttonText;
  final VoidCallback onTap;

  const _ActionCard({
    required this.title,
    required this.description,
    required this.icon,
    required this.accent,
    required this.buttonText,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(23),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(23),
        child: Container(
          padding: const EdgeInsets.all(19),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(23),
            border: Border.all(
              color: const Color(0xFFE4E9F1),
            ),
            boxShadow: const [
              BoxShadow(
                color: Color(0x0D000000),
                blurRadius: 16,
                offset: Offset(0, 8),
              ),
            ],
          ),
          child: Row(
            children: [
              Container(
                height: 58,
                width: 58,
                decoration: BoxDecoration(
                  color: accent.withValues(
                    alpha: 0.12,
                  ),
                  borderRadius:
                      BorderRadius.circular(18),
                ),
                child: Icon(
                  icon,
                  color: accent,
                  size: 30,
                ),
              ),
              const SizedBox(width: 15),
              Expanded(
                child: Column(
                  crossAxisAlignment:
                      CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: const TextStyle(
                        color:
                            ProductionDashboardPage._navy,
                        fontSize: 17,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                    const SizedBox(height: 5),
                    Text(
                      description,
                      style: const TextStyle(
                        color: Colors.black54,
                        fontSize: 12.5,
                        height: 1.35,
                      ),
                    ),
                    const SizedBox(height: 10),
                    Row(
                      children: [
                        Text(
                          buttonText,
                          style: TextStyle(
                            color: accent,
                            fontSize: 12.5,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                        const SizedBox(width: 4),
                        Icon(
                          Icons.arrow_forward,
                          size: 16,
                          color: accent,
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _QuickActions extends StatelessWidget {
  final VoidCallback onPrinter;
  final VoidCallback onCashCut;
  final VoidCallback onRefresh;

  const _QuickActions({
    required this.onPrinter,
    required this.onCashCut,
    required this.onRefresh,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(22),
        border: Border.all(
          color: const Color(0xFFE4E9F1),
        ),
      ),
      child: Wrap(
        alignment: WrapAlignment.spaceAround,
        spacing: 8,
        runSpacing: 8,
        children: [
          _QuickActionButton(
            icon: Icons.print_outlined,
            label: 'Impresora',
            onTap: onPrinter,
          ),
          _QuickActionButton(
            icon: Icons.sync,
            label: 'Actualizar',
            onTap: onRefresh,
          ),
        ],
      ),
    );
  }
}

class _QuickActionButton extends StatelessWidget {
  final IconData icon;
  final String label;
  final VoidCallback onTap;

  const _QuickActionButton({
    required this.icon,
    required this.label,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return TextButton.icon(
      onPressed: onTap,
      icon: Icon(
        icon,
        color: ProductionDashboardPage._blue,
      ),
      label: Text(
        label,
        style: const TextStyle(
          color: ProductionDashboardPage._navy,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }
}

class _SessionInfo extends StatelessWidget {
  final String nombre;
  final String profileId;

  const _SessionInfo({
    required this.nombre,
    required this.profileId,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(17),
      decoration: BoxDecoration(
        color: const Color(0xFFEAF4FD),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(
          color: const Color(0xFFCDE7FA),
        ),
      ),
      child: Row(
        children: [
          const Icon(
            Icons.verified_user_outlined,
            color: ProductionDashboardPage._blue,
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment:
                  CrossAxisAlignment.start,
              children: [
                Text(
                  nombre,
                  style: const TextStyle(
                    color:
                        ProductionDashboardPage._navy,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  'Sesión activa · ID $profileId',
                  style: const TextStyle(
                    color: Colors.black54,
                    fontSize: 12,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}