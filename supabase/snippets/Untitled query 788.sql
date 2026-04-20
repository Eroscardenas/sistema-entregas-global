insert into public.profiles (id, role, nombre, activo)
values (
  'eebdff4c-9aea-4982-8d32-708dd57192a5',
  'admin',
  'Admin Local',
  true
)
on conflict (id) do update
set
  role = excluded.role,
  nombre = excluded.nombre,
  activo = excluded.activo;