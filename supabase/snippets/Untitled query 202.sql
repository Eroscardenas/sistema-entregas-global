update new_customer_requests
set status = 'APROBADO'
where status = 'ATENDIDO';

alter table new_customer_requests
drop constraint if exists new_customer_requests_status_check;

alter table new_customer_requests
add constraint new_customer_requests_status_check
check (status in ('NUEVO', 'EN_PROCESO', 'APROBADO', 'RECHAZADO'));