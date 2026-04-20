select table_name
from information_schema.views
where table_schema = 'public'
  and table_name in (
    'v_order_detail',
    'v_active_public_order_requests',
    'v_recent_public_order_requests'
  );