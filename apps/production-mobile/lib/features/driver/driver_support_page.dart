import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:url_launcher/url_launcher.dart';

class DriverSupportPage extends StatelessWidget {
  const DriverSupportPage({super.key});

  static const _navy = Color(0xFF0A1A2F);
  static const _royal = Color(0xFF1E4A7A);
  static const _accent = Color(0xFF4DADFF);
  static const _burgundy = Color(0xFF852838);
  static const _success = Color(0xFF10B981);

  static const String salesPhone = '3321316655';
  static const String logisticsPhone = '3314581827';

  Future<void> _call(BuildContext context, String phone) async {
    try {
      final uri = Uri.parse('tel:$phone');
      final ok = await launchUrl(uri, mode: LaunchMode.externalApplication);

      if (!ok && context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('No se pudo abrir el marcador')),
        );
      }
    } catch (_) {
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('No se pudo abrir el marcador')),
      );
    }
  }

  Future<void> _openWhatsApp(BuildContext context, String phone, String area) async {
    try {
      final message = Uri.encodeComponent(
        'Hola, soy chofer de Global Ice de México. Necesito apoyo de $area.',
      );

      final uri = Uri.parse('https://wa.me/52$phone?text=$message');
      final ok = await launchUrl(uri, mode: LaunchMode.externalApplication);

      if (!ok && context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('No se pudo abrir WhatsApp')),
        );
      }
    } catch (_) {
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('No se pudo abrir WhatsApp')),
      );
    }
  }

  Future<void> _copy(BuildContext context, String phone) async {
    await Clipboard.setData(ClipboardData(text: phone));
    if (!context.mounted) return;

    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text('Número copiado: $phone')),
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
        title: const Text(
          'Soporte',
          style: TextStyle(fontWeight: FontWeight.w900),
        ),
      ),
      body: Stack(
        children: [
          Positioned.fill(
            child: Container(
              decoration: const BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: [_navy, _royal],
                ),
              ),
            ),
          ),
          Positioned(
            top: -220,
            left: -160,
            child: Container(
              height: 520,
              width: 520,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: _accent.withOpacity(0.18),
              ),
            ),
          ),
          Positioned(
            bottom: -260,
            right: -200,
            child: Container(
              height: 640,
              width: 640,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: _burgundy.withOpacity(0.16),
              ),
            ),
          ),
          SafeArea(
            child: ListView(
              padding: const EdgeInsets.all(16),
              children: [
                _GlassCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Row(
                        children: [
                          Icon(Icons.support_agent, color: Colors.white),
                          SizedBox(width: 10),
                          Expanded(
                            child: Text(
                              'Asesores Global Ice',
                              style: TextStyle(
                                color: Colors.white,
                                fontSize: 18,
                                fontWeight: FontWeight.w900,
                              ),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 10),
                      Text(
                        'Desde aquí puedes comunicarte con las áreas de soporte. Puedes marcar directamente, abrir WhatsApp o copiar el número.',
                        style: TextStyle(
                          color: Colors.white.withOpacity(0.72),
                          fontWeight: FontWeight.w600,
                          height: 1.35,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 14),
                _SupportCard(
                  title: 'Ventas',
                  subtitle: salesPhone,
                  description: 'Apoyo para clientes, pedidos, precios y seguimiento comercial.',
                  color: _accent,
                  onCall: () => _call(context, salesPhone),
                  onCopy: () => _copy(context, salesPhone),
                  onWhatsApp: () => _openWhatsApp(context, salesPhone, 'Ventas'),
                ),
                const SizedBox(height: 12),
                _SupportCard(
                  title: 'Logística',
                  subtitle: logisticsPhone,
                  description: 'Apoyo para rutas, entregas, incidencias operativas y coordinación.',
                  color: _burgundy,
                  onCall: () => _call(context, logisticsPhone),
                  onCopy: () => _copy(context, logisticsPhone),
                  onWhatsApp: () => _openWhatsApp(context, logisticsPhone, 'Logística'),
                ),
                const SizedBox(height: 14),
                _GlassCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Row(
                        children: [
                          Icon(Icons.info_outline, color: Colors.white70, size: 18),
                          SizedBox(width: 8),
                          Text(
                            'Tip',
                            style: TextStyle(
                              color: Colors.white,
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 8),
                      Text(
                        'Si el marcador no abre, usa la opción de copiar y pega el número manualmente.',
                        style: TextStyle(
                          color: Colors.white.withOpacity(0.70),
                          fontSize: 12.5,
                          height: 1.35,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
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

class _GlassCard extends StatelessWidget {
  final Widget child;
  const _GlassCard({required this.child});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(22),
        color: Colors.white.withOpacity(0.10),
        border: Border.all(color: Colors.white.withOpacity(0.18)),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.22),
            blurRadius: 24,
            offset: const Offset(0, 12),
          ),
        ],
      ),
      child: child,
    );
  }
}

class _SupportCard extends StatelessWidget {
  final String title;
  final String subtitle;
  final String description;
  final Color color;
  final VoidCallback onCall;
  final VoidCallback onCopy;
  final VoidCallback onWhatsApp;

  const _SupportCard({
    required this.title,
    required this.subtitle,
    required this.description,
    required this.color,
    required this.onCall,
    required this.onCopy,
    required this.onWhatsApp,
  });

  @override
  Widget build(BuildContext context) {
    return _GlassCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                height: 48,
                width: 48,
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(16),
                  color: color.withOpacity(0.18),
                  border: Border.all(color: color.withOpacity(0.28)),
                ),
                child: Icon(
                  title == 'Ventas' ? Icons.point_of_sale : Icons.local_shipping_outlined,
                  color: Colors.white,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 16,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      subtitle,
                      style: TextStyle(
                        color: Colors.white.withOpacity(0.80),
                        fontSize: 14,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Text(
            description,
            style: TextStyle(
              color: Colors.white.withOpacity(0.68),
              fontSize: 12.5,
              height: 1.3,
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: 14),
          Row(
            children: [
              Expanded(
                child: ElevatedButton.icon(
                  onPressed: onCall,
                  icon: const Icon(Icons.phone),
                  label: const Text('Marcar'),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: color,
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 13),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(14),
                    ),
                    elevation: 0,
                  ),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: ElevatedButton.icon(
                  onPressed: onWhatsApp,
                  icon: const Icon(Icons.chat),
                  label: const Text('WhatsApp'),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF10B981),
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 13),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(14),
                    ),
                    elevation: 0,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          SizedBox(
            width: double.infinity,
            child: OutlinedButton.icon(
              onPressed: onCopy,
              icon: const Icon(Icons.copy),
              label: const Text('Copiar número'),
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
}