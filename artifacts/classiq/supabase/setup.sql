-- ClassIQ Supabase bootstrap
-- Run this once in the Supabase SQL Editor for the project configured in Replit.
-- It creates the schema, role-aware RLS, simulator RPCs, and clearly simulated
-- demo records. It does not create Auth users; users sign up through ClassIQ.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  email text not null default '',
  role text not null default 'STUDENT' check (role in ('ADMIN','FACULTY','MAINTENANCE','STUDENT')),
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.buildings (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  location text not null default '',
  total_floors integer not null default 1 check (total_floors > 0),
  is_simulated boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.classrooms (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null references public.buildings(id) on delete cascade,
  room_number text not null unique,
  name text not null,
  floor integer not null default 1,
  capacity integer not null default 40 check (capacity > 0),
  status text not null default 'EMPTY' check (status in ('ACTIVE','EMPTY','SCHEDULED','MAINTENANCE','OFFLINE')),
  is_simulated boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (building_id, room_number)
);

create table if not exists public.devices (
  id uuid primary key default gen_random_uuid(),
  classroom_id uuid not null references public.classrooms(id) on delete cascade,
  name text not null,
  device_type text not null check (device_type in ('LIGHT','FAN','PROJECTOR','AC','SMART_PLUG','SENSOR')),
  status text not null default 'OFF' check (status in ('ON','OFF','OFFLINE','FAULT')),
  control_mode text not null default 'AUTO' check (control_mode in ('AUTO','MANUAL')),
  power_rating numeric not null default 0 check (power_rating >= 0),
  current_power numeric not null default 0 check (current_power >= 0),
  health_score numeric not null default 100 check (health_score between 0 and 100),
  operating_hours numeric not null default 0 check (operating_hours >= 0),
  is_simulated boolean not null default false,
  last_seen timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (classroom_id, name)
);

create table if not exists public.sensors (
  id uuid primary key default gen_random_uuid(),
  classroom_id uuid not null references public.classrooms(id) on delete cascade,
  sensor_type text not null check (sensor_type in ('TEMPERATURE','HUMIDITY','CO2','LIGHT','OCCUPANCY','POWER')),
  value numeric not null default 0,
  unit text not null default '',
  status text not null default 'ONLINE' check (status in ('ONLINE','OFFLINE','FAULT')),
  is_simulated boolean not null default false,
  last_reading_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (classroom_id, sensor_type)
);

create table if not exists public.device_readings (
  id bigserial primary key,
  device_id uuid not null references public.devices(id) on delete cascade,
  power numeric not null default 0,
  voltage numeric not null default 230,
  current_amps numeric not null default 0,
  is_simulated boolean not null default false,
  recorded_at timestamptz not null default now()
);

create table if not exists public.energy_readings (
  id bigserial primary key,
  classroom_id uuid not null references public.classrooms(id) on delete cascade,
  power numeric not null default 0,
  energy_kwh numeric not null default 0,
  estimated_cost numeric not null default 0,
  is_simulated boolean not null default false,
  recorded_at timestamptz not null default now()
);

create table if not exists public.students (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid unique references public.profiles(id) on delete set null,
  student_id text not null unique,
  department text not null default '',
  year integer not null default 1 check (year between 1 and 8),
  section text not null default 'A',
  created_at timestamptz not null default now()
);

create table if not exists public.faculty (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid unique references public.profiles(id) on delete set null,
  employee_id text not null unique,
  department text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.courses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,
  department text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.timetable (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  faculty_id uuid references public.faculty(id) on delete set null,
  classroom_id uuid not null references public.classrooms(id) on delete cascade,
  day_of_week integer not null check (day_of_week between 0 and 6),
  start_time time not null,
  end_time time not null,
  requires_projector boolean not null default false,
  created_at timestamptz not null default now(),
  check (end_time > start_time)
);

create table if not exists public.attendance (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  classroom_id uuid not null references public.classrooms(id) on delete cascade,
  faculty_id uuid references public.faculty(id) on delete set null,
  attendance_date date not null default current_date,
  check_in_time timestamptz,
  status text not null check (status in ('PRESENT','ABSENT','LATE')),
  method text not null default 'SIMULATED' check (method in ('MANUAL','QR','RFID','SIMULATED')),
  created_at timestamptz not null default now(),
  unique (student_id, course_id, attendance_date)
);

create table if not exists public.maintenance_tickets (
  id uuid primary key default gen_random_uuid(),
  device_id uuid references public.devices(id) on delete set null,
  classroom_id uuid references public.classrooms(id) on delete set null,
  title text not null,
  description text not null default '',
  priority text not null default 'MEDIUM' check (priority in ('LOW','MEDIUM','HIGH','CRITICAL')),
  status text not null default 'OPEN' check (status in ('OPEN','IN_PROGRESS','RESOLVED')),
  is_simulated boolean not null default false,
  assigned_to uuid references public.profiles(id) on delete set null,
  ai_generated boolean not null default false,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table if not exists public.alerts (
  id uuid primary key default gen_random_uuid(),
  classroom_id uuid references public.classrooms(id) on delete cascade,
  device_id uuid references public.devices(id) on delete cascade,
  alert_type text not null,
  severity text not null default 'INFO' check (severity in ('INFO','WARNING','CRITICAL')),
  title text not null,
  message text not null default '',
  is_read boolean not null default false,
  is_simulated boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.ai_insights (
  id uuid primary key default gen_random_uuid(),
  classroom_id uuid references public.classrooms(id) on delete cascade,
  device_id uuid references public.devices(id) on delete cascade,
  insight_type text not null check (insight_type in ('ENERGY_OPTIMIZATION','ANOMALY','PREDICTIVE_MAINTENANCE','ENERGY_FORECAST','ATTENDANCE','COMFORT')),
  title text not null,
  description text not null default '',
  confidence numeric not null default 0 check (confidence between 0 and 1),
  potential_saving_kwh numeric not null default 0,
  is_simulated boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.automation_logs (
  id uuid primary key default gen_random_uuid(),
  classroom_id uuid references public.classrooms(id) on delete cascade,
  device_id uuid references public.devices(id) on delete cascade,
  action text not null,
  reason text not null default '',
  trigger_type text not null check (trigger_type in ('TIMETABLE','AI','SENSOR','MANUAL','AUTOMATION')),
  is_simulated boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists classrooms_building_idx on public.classrooms(building_id);
create index if not exists devices_room_idx on public.devices(classroom_id);
create index if not exists sensors_room_type_idx on public.sensors(classroom_id, sensor_type);
create index if not exists device_readings_time_idx on public.device_readings(device_id, recorded_at desc);
create index if not exists energy_readings_room_time_idx on public.energy_readings(classroom_id, recorded_at desc);
create index if not exists timetable_room_day_time_idx on public.timetable(classroom_id, day_of_week, start_time);
create index if not exists attendance_student_date_idx on public.attendance(student_id, attendance_date desc);
create index if not exists tickets_status_time_idx on public.maintenance_tickets(status, created_at desc);
create index if not exists alerts_read_time_idx on public.alerts(is_read, created_at desc);
create index if not exists automation_logs_time_idx on public.automation_logs(created_at desc);
create index if not exists audit_logs_time_idx on public.audit_logs(created_at desc);

create or replace function public.classiq_role()
returns text language sql stable security definer set search_path = public
as $$ select role from public.profiles where id = auth.uid() $$;

create or replace function public.classiq_faculty_has_room(target_room uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.timetable t
    join public.faculty f on f.id = t.faculty_id
    where t.classroom_id = target_room and f.profile_id = auth.uid()
  )
$$;

create or replace function public.classiq_faculty_has_course(target_course uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.timetable t
    join public.faculty f on f.id = t.faculty_id
    where t.course_id = target_course and f.profile_id = auth.uid()
  )
$$;

create or replace function public.classiq_is_my_student(target_student uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.students s
    where s.id = target_student and s.profile_id = auth.uid()
  )
$$;

create or replace function public.classiq_can_access_room(target_room uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select public.classiq_role() in ('ADMIN','MAINTENANCE')
      or (public.classiq_role() = 'FACULTY' and public.classiq_faculty_has_room(target_room))
$$;

create or replace function public.classiq_guard_profile_role()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is not null
     and new.role is distinct from old.role
     and public.classiq_role() <> 'ADMIN' then
    raise exception 'Only an administrator can change profile roles';
  end if;
  new.updated_at = now();
  return new;
end
$$;

drop trigger if exists profiles_guard_role on public.profiles;
create trigger profiles_guard_role before update on public.profiles
for each row execute function public.classiq_guard_profile_role();

create or replace function public.classiq_handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.email, ''),
    'STUDENT'
  )
  on conflict (id) do nothing;
  return new;
end
$$;

drop trigger if exists classiq_auth_user_created on auth.users;
create trigger classiq_auth_user_created after insert on auth.users
for each row execute function public.classiq_handle_new_user();

create or replace function public.classiq_run_room_automation(target_room uuid)
returns jsonb language plpgsql security definer set search_path = public, auth, pg_temp
as $$
declare
  occupancy_count numeric := 0;
  temperature_c numeric := 22;
  light_level numeric := 500;
  class_active boolean := false;
  projector_required boolean := false;
  changed_count integer := 0;
  room_is_simulated boolean := false;
begin
  if auth.uid() is null
     or public.classiq_role() is null
     or (public.classiq_role() not in ('ADMIN','FACULTY'))
     or (public.classiq_role() = 'FACULTY' and not public.classiq_faculty_has_room(target_room)) then
    raise exception 'Not authorized to run classroom automation';
  end if;

  select is_simulated into room_is_simulated from public.classrooms where id = target_room;
  select coalesce(value, 0) into occupancy_count from public.sensors
    where classroom_id = target_room and sensor_type = 'OCCUPANCY';
  select coalesce(value, 22) into temperature_c from public.sensors
    where classroom_id = target_room and sensor_type = 'TEMPERATURE';
  select coalesce(value, 500) into light_level from public.sensors
    where classroom_id = target_room and sensor_type = 'LIGHT';

  select exists (
    select 1 from public.timetable
    where classroom_id = target_room
      and day_of_week = extract(dow from now())::integer
      and localtime between start_time and end_time
  ), coalesce(bool_or(requires_projector), false)
  into class_active, projector_required
  from public.timetable
  where classroom_id = target_room
    and day_of_week = extract(dow from now())::integer
    and localtime between start_time and end_time;

  if occupancy_count <= 0 and not class_active then
    update public.devices set status = 'OFF', current_power = 0, last_seen = now(), updated_at = now()
      where classroom_id = target_room and control_mode = 'AUTO' and status = 'ON';
    get diagnostics changed_count = row_count;
    if changed_count > 0 then
      insert into public.automation_logs (classroom_id, action, reason, trigger_type, is_simulated)
        values (target_room, 'ROOM_IDLE', 'No occupancy or active timetable; automatic devices were powered down', 'AUTOMATION', room_is_simulated);
    end if;
  else
    update public.devices
      set status = case
        when device_type = 'LIGHT' and light_level < 300 then 'ON'
        when device_type = 'FAN' and temperature_c >= 27 then 'ON'
        when device_type = 'PROJECTOR' and class_active and projector_required then 'ON'
        when device_type in ('LIGHT','FAN','PROJECTOR') then 'OFF'
        else status
      end,
      current_power = case
        when device_type = 'LIGHT' and light_level < 300 then power_rating
        when device_type = 'FAN' and temperature_c >= 27 then power_rating
        when device_type = 'PROJECTOR' and class_active and projector_required then power_rating
        when device_type in ('LIGHT','FAN','PROJECTOR') then 0
        else current_power
      end,
      last_seen = now(),
      updated_at = now()
    where classroom_id = target_room and control_mode = 'AUTO' and status <> 'OFFLINE'
      and status is distinct from case
        when device_type = 'LIGHT' and light_level < 300 then 'ON'
        when device_type = 'FAN' and temperature_c >= 27 then 'ON'
        when device_type = 'PROJECTOR' and class_active and projector_required then 'ON'
        when device_type in ('LIGHT','FAN','PROJECTOR') then 'OFF'
        else status
      end;
    get diagnostics changed_count = row_count;
    if changed_count > 0 then
      insert into public.automation_logs (classroom_id, action, reason, trigger_type, is_simulated)
        values (target_room, 'ROOM_OPTIMIZED', 'Device states evaluated against occupancy, sensors, and timetable', 'AUTOMATION', room_is_simulated);
    end if;
  end if;

  if public.classiq_role() = 'ADMIN' then
    update public.classrooms set status = case when occupancy_count > 0 then 'ACTIVE'
        when class_active then 'SCHEDULED' else 'EMPTY' end, updated_at = now()
      where id = target_room;
  end if;

  return jsonb_build_object(
    'classroom_id', target_room,
    'occupancy', occupancy_count,
    'temperature_c', temperature_c,
    'class_active', class_active,
    'devices_changed', changed_count
  );
end
$$;

create or replace function public.classiq_run_campus_automation()
returns integer language plpgsql security definer set search_path = public, auth, pg_temp
as $$
declare
  room_record record;
  processed integer := 0;
begin
  if auth.uid() is null or public.classiq_role() is null or public.classiq_role() not in ('ADMIN','FACULTY') then
    raise exception 'Not authorized to run campus automation';
  end if;
  for room_record in
    select id from public.classrooms
    where public.classiq_role() = 'ADMIN' or public.classiq_faculty_has_room(id)
  loop
    perform public.classiq_run_room_automation(room_record.id);
    processed := processed + 1;
  end loop;
  return processed;
end
$$;

create or replace function public.classiq_simulate_room_action(target_room uuid, action_name text)
returns jsonb language plpgsql security definer set search_path = public, auth, pg_temp
as $$
declare
  actor_role text := public.classiq_role();
  target_device uuid;
  current_power_w numeric := 0;
  occupancy_count numeric := 0;
begin
  if auth.uid() is null or actor_role is null or actor_role not in ('ADMIN','FACULTY')
     or (actor_role = 'FACULTY' and not public.classiq_faculty_has_room(target_room)) then
    raise exception 'Not authorized to simulate this classroom';
  end if;
  if not exists (select 1 from public.classrooms where id = target_room) then
    raise exception 'Classroom not found';
  end if;

  if action_name = 'STUDENT_ENTRY' then
    update public.sensors set value = least(value + 1, 120), is_simulated = true, last_reading_at = now()
      where classroom_id = target_room and sensor_type = 'OCCUPANCY';
  elsif action_name = 'STUDENT_EXIT' then
    update public.sensors set value = greatest(value - 1, 0), is_simulated = true, last_reading_at = now()
      where classroom_id = target_room and sensor_type = 'OCCUPANCY';
  elsif action_name = 'INCREASE_TEMPERATURE' then
    update public.sensors set value = least(value + 1, 40), is_simulated = true, last_reading_at = now()
      where classroom_id = target_room and sensor_type = 'TEMPERATURE';
  elsif action_name = 'DECREASE_TEMPERATURE' then
    update public.sensors set value = greatest(value - 1, 16), is_simulated = true, last_reading_at = now()
      where classroom_id = target_room and sensor_type = 'TEMPERATURE';
  elsif action_name = 'ENERGY_SPIKE' then
    select id into target_device from public.devices
      where classroom_id = target_room and device_type = 'PROJECTOR' limit 1;
    if target_device is null then raise exception 'No projector is configured for this classroom'; end if;
    update public.devices set status = 'ON', current_power = greatest(power_rating, 590), is_simulated = true,
      control_mode = 'MANUAL', last_seen = now(), updated_at = now() where id = target_device;
    insert into public.alerts (classroom_id, device_id, alert_type, severity, title, message, is_simulated)
      values (target_room, target_device, 'HIGH_ENERGY', 'WARNING', 'Projector energy spike',
        'Simulated projector draw exceeded its normal operating range.', true);
    insert into public.maintenance_tickets (device_id, classroom_id, title, description, priority, ai_generated, is_simulated)
      values (target_device, target_room, 'Investigate projector power draw',
        'A simulated reading exceeded the projector power rating. Inspect the device and meter.', 'HIGH', true, true);
    insert into public.ai_insights (classroom_id, device_id, insight_type, title, description, confidence, is_simulated)
      values (target_room, target_device, 'ANOMALY', 'Abnormal projector power',
        'Power draw exceeded the configured rating during an energy-spike simulation.', 0.96, true);
  elsif action_name = 'DEVICE_FAILURE' or action_name = 'DISCONNECT_DEVICE' then
    select id into target_device from public.devices where classroom_id = target_room
      and status <> 'OFFLINE' order by health_score asc limit 1;
    if target_device is null then raise exception 'No online device is available to simulate a fault'; end if;
    update public.devices set status = 'OFFLINE', current_power = 0, is_simulated = true,
      health_score = case when action_name = 'DEVICE_FAILURE' then least(health_score, 24) else health_score end,
      last_seen = now(), updated_at = now() where id = target_device;
    insert into public.alerts (classroom_id, device_id, alert_type, severity, title, message, is_simulated)
      values (target_room, target_device, 'DEVICE_OFFLINE', 'CRITICAL', 'Device disconnected',
        'The simulator marked this device as offline and opened a maintenance ticket.', true);
    insert into public.maintenance_tickets (device_id, classroom_id, title, description, priority, ai_generated, is_simulated)
      values (target_device, target_room, 'Inspect offline device',
        'Device stopped reporting during a simulator fault scenario.', 'CRITICAL', true, true);
  elsif action_name = 'RECONNECT_DEVICE' then
    select id into target_device from public.devices where classroom_id = target_room
      and status = 'OFFLINE' order by updated_at desc limit 1;
    if target_device is null then raise exception 'No offline device is available to reconnect'; end if;
    update public.devices set status = 'OFF', control_mode = 'AUTO', is_simulated = true,
      last_seen = now(), updated_at = now() where id = target_device;
    insert into public.alerts (classroom_id, device_id, alert_type, severity, title, message, is_simulated)
      values (target_room, target_device, 'DEVICE_RECONNECTED', 'INFO', 'Device reconnected',
        'The simulator restored the device connection.', true);
  else
    raise exception 'Unsupported simulator action';
  end if;

  insert into public.sensors (classroom_id, sensor_type, value, unit, status, is_simulated, last_reading_at)
  values (target_room, 'POWER', 0, 'W', 'ONLINE', true, now())
  on conflict (classroom_id, sensor_type) do update set is_simulated = true, last_reading_at = now();

  perform public.classiq_run_room_automation(target_room);
  select coalesce(value, 0) into occupancy_count from public.sensors
    where classroom_id = target_room and sensor_type = 'OCCUPANCY';
  select coalesce(sum(case when status = 'ON' then current_power else 0 end), 0)
    into current_power_w from public.devices where classroom_id = target_room;

  update public.sensors set value = current_power_w, is_simulated = true, last_reading_at = now()
    where classroom_id = target_room and sensor_type = 'POWER';
  insert into public.energy_readings (classroom_id, power, energy_kwh, estimated_cost, is_simulated)
    values (target_room, current_power_w, current_power_w / 4000, (current_power_w / 4000) * 8.25, true);
  insert into public.automation_logs (classroom_id, device_id, action, reason, trigger_type, is_simulated)
    values (target_room, target_device, action_name, 'User initiated simulator action; rules re-evaluated', 'SENSOR', true);
  insert into public.audit_logs (user_id, action, entity_type, entity_id, metadata)
    values (auth.uid(), 'SIMULATOR_' || action_name, 'classroom', target_room,
      jsonb_build_object('simulated', true, 'device_id', target_device));

  return jsonb_build_object('classroom_id', target_room, 'occupancy', occupancy_count,
    'power_w', current_power_w, 'simulated', true);
end
$$;

create or replace function public.classiq_set_device_command(target_device uuid, command_name text)
returns jsonb language plpgsql security definer set search_path = public, auth, pg_temp
as $$
declare
  device_row public.devices%rowtype;
begin
  if auth.uid() is null or public.classiq_role() is null or public.classiq_role() not in ('ADMIN','FACULTY','MAINTENANCE') then
    raise exception 'Not authorized to control devices';
  end if;
  select * into device_row from public.devices where id = target_device for update;
  if not found then raise exception 'Device not found or unavailable'; end if;
  if public.classiq_role() = 'FACULTY' and not public.classiq_faculty_has_room(device_row.classroom_id) then
    raise exception 'Not authorized for this classroom';
  end if;
  if command_name not in ('ON','OFF','AUTO') then raise exception 'Unsupported device command'; end if;

  if command_name = 'AUTO' then
    update public.devices set control_mode = 'AUTO', last_seen = now(), updated_at = now() where id = target_device;
    perform public.classiq_run_room_automation(device_row.classroom_id);
  else
    update public.devices set status = command_name, control_mode = 'MANUAL',
      current_power = case when command_name = 'ON' then power_rating else 0 end,
      last_seen = now(), updated_at = now() where id = target_device;
  end if;
  insert into public.automation_logs (classroom_id, device_id, action, reason, trigger_type, is_simulated)
    values (device_row.classroom_id, target_device, command_name,
      'Device command issued by ' || public.classiq_role(), 'MANUAL', device_row.is_simulated);
  insert into public.audit_logs (user_id, action, entity_type, entity_id, metadata)
    values (auth.uid(), 'DEVICE_' || command_name, 'device', target_device,
      jsonb_build_object('classroom_id', device_row.classroom_id, 'command', command_name));
  return jsonb_build_object('device_id', target_device, 'command', command_name, 'classroom_id', device_row.classroom_id);
end
$$;

alter table public.profiles enable row level security;
alter table public.buildings enable row level security;
alter table public.classrooms enable row level security;
alter table public.devices enable row level security;
alter table public.sensors enable row level security;
alter table public.device_readings enable row level security;
alter table public.energy_readings enable row level security;
alter table public.students enable row level security;
alter table public.faculty enable row level security;
alter table public.courses enable row level security;
alter table public.timetable enable row level security;
alter table public.attendance enable row level security;
alter table public.maintenance_tickets enable row level security;
alter table public.alerts enable row level security;
alter table public.ai_insights enable row level security;
alter table public.automation_logs enable row level security;
alter table public.audit_logs enable row level security;

drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated
using (id = auth.uid() or public.classiq_role() = 'ADMIN');
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated
using (id = auth.uid() or public.classiq_role() = 'ADMIN')
with check (id = auth.uid() or public.classiq_role() = 'ADMIN');
drop policy if exists profiles_admin_insert on public.profiles;
create policy profiles_admin_insert on public.profiles for insert to authenticated
with check (public.classiq_role() = 'ADMIN');

drop policy if exists buildings_read on public.buildings;
create policy buildings_read on public.buildings for select to authenticated using (true);
drop policy if exists buildings_admin_all on public.buildings;
create policy buildings_admin_all on public.buildings for all to authenticated
using (public.classiq_role() = 'ADMIN') with check (public.classiq_role() = 'ADMIN');

drop policy if exists classrooms_read on public.classrooms;
create policy classrooms_read on public.classrooms for select to authenticated using (true);
drop policy if exists classrooms_admin_all on public.classrooms;
create policy classrooms_admin_all on public.classrooms for all to authenticated
using (public.classiq_role() = 'ADMIN') with check (public.classiq_role() = 'ADMIN');

drop policy if exists devices_read on public.devices;
create policy devices_read on public.devices for select to authenticated
using (public.classiq_can_access_room(classroom_id));
drop policy if exists devices_write on public.devices;
create policy devices_write on public.devices for all to authenticated
using (public.classiq_role() in ('ADMIN','MAINTENANCE') or
  (public.classiq_role() = 'FACULTY' and public.classiq_faculty_has_room(classroom_id)))
with check (public.classiq_role() in ('ADMIN','MAINTENANCE') or
  (public.classiq_role() = 'FACULTY' and public.classiq_faculty_has_room(classroom_id)));

drop policy if exists sensors_room_access on public.sensors;
create policy sensors_room_access on public.sensors for all to authenticated
using (public.classiq_can_access_room(classroom_id))
with check (public.classiq_can_access_room(classroom_id));
drop policy if exists device_readings_access on public.device_readings;
create policy device_readings_access on public.device_readings for all to authenticated
using (exists (select 1 from public.devices d where d.id = device_id and public.classiq_can_access_room(d.classroom_id)))
with check (exists (select 1 from public.devices d where d.id = device_id and public.classiq_can_access_room(d.classroom_id)));
drop policy if exists energy_readings_access on public.energy_readings;
create policy energy_readings_access on public.energy_readings for all to authenticated
using (public.classiq_can_access_room(classroom_id))
with check (public.classiq_can_access_room(classroom_id));

drop policy if exists students_access on public.students;
create policy students_access on public.students for select to authenticated
using (public.classiq_role() = 'ADMIN'
  or profile_id = auth.uid()
  or (public.classiq_role() = 'FACULTY' and exists (
    select 1 from public.attendance a where a.student_id = id and public.classiq_faculty_has_course(a.course_id)
  )));
drop policy if exists students_admin_manage on public.students;
create policy students_admin_manage on public.students for all to authenticated
using (public.classiq_role() = 'ADMIN') with check (public.classiq_role() = 'ADMIN');

drop policy if exists faculty_access on public.faculty;
create policy faculty_access on public.faculty for select to authenticated using (true);
drop policy if exists faculty_admin_manage on public.faculty;
create policy faculty_admin_manage on public.faculty for all to authenticated
using (public.classiq_role() = 'ADMIN') with check (public.classiq_role() = 'ADMIN');

drop policy if exists courses_access on public.courses;
create policy courses_access on public.courses for select to authenticated using (true);
drop policy if exists courses_admin_manage on public.courses;
create policy courses_admin_manage on public.courses for all to authenticated
using (public.classiq_role() = 'ADMIN') with check (public.classiq_role() = 'ADMIN');

drop policy if exists timetable_access on public.timetable;
create policy timetable_access on public.timetable for select to authenticated using (true);
drop policy if exists timetable_manage on public.timetable;
create policy timetable_manage on public.timetable for all to authenticated
using (public.classiq_role() = 'ADMIN' or (public.classiq_role() = 'FACULTY' and exists (
  select 1 from public.faculty f where f.id = faculty_id and f.profile_id = auth.uid()
)))
with check (public.classiq_role() = 'ADMIN' or (public.classiq_role() = 'FACULTY' and exists (
  select 1 from public.faculty f where f.id = faculty_id and f.profile_id = auth.uid()
)));

drop policy if exists attendance_access on public.attendance;
create policy attendance_access on public.attendance for select to authenticated
using (public.classiq_role() = 'ADMIN'
  or public.classiq_faculty_has_course(course_id)
  or public.classiq_is_my_student(student_id));
drop policy if exists attendance_manage on public.attendance;
create policy attendance_manage on public.attendance for all to authenticated
using (public.classiq_role() = 'ADMIN' or public.classiq_faculty_has_course(course_id))
with check (public.classiq_role() = 'ADMIN' or public.classiq_faculty_has_course(course_id));

drop policy if exists maintenance_access on public.maintenance_tickets;
create policy maintenance_access on public.maintenance_tickets for select to authenticated
using (public.classiq_role() in ('ADMIN','MAINTENANCE')
  or (classroom_id is not null and public.classiq_faculty_has_room(classroom_id)));
drop policy if exists maintenance_manage on public.maintenance_tickets;
create policy maintenance_manage on public.maintenance_tickets for all to authenticated
using (public.classiq_role() in ('ADMIN','MAINTENANCE'))
with check (public.classiq_role() in ('ADMIN','MAINTENANCE'));

drop policy if exists alerts_access on public.alerts;
create policy alerts_access on public.alerts for select to authenticated
using (public.classiq_role() in ('ADMIN','MAINTENANCE')
  or (classroom_id is not null and public.classiq_faculty_has_room(classroom_id)));
drop policy if exists alerts_manage on public.alerts;
create policy alerts_manage on public.alerts for update to authenticated
using (public.classiq_role() in ('ADMIN','MAINTENANCE')
  or (classroom_id is not null and public.classiq_faculty_has_room(classroom_id)))
with check (public.classiq_role() in ('ADMIN','MAINTENANCE')
  or (classroom_id is not null and public.classiq_faculty_has_room(classroom_id)));

drop policy if exists insights_access on public.ai_insights;
create policy insights_access on public.ai_insights for select to authenticated
using (public.classiq_role() = 'ADMIN'
  or (classroom_id is not null and public.classiq_can_access_room(classroom_id)));

drop policy if exists automation_logs_access on public.automation_logs;
create policy automation_logs_access on public.automation_logs for select to authenticated
using (public.classiq_role() = 'ADMIN'
  or (classroom_id is not null and public.classiq_can_access_room(classroom_id)));
drop policy if exists audit_logs_admin_read on public.audit_logs;
create policy audit_logs_admin_read on public.audit_logs for select to authenticated
using (public.classiq_role() = 'ADMIN');
drop policy if exists audit_logs_self_insert on public.audit_logs;
create policy audit_logs_self_insert on public.audit_logs for insert to authenticated
with check (user_id = auth.uid());

revoke all on function public.classiq_role() from public, anon;
revoke all on function public.classiq_faculty_has_room(uuid) from public, anon;
revoke all on function public.classiq_faculty_has_course(uuid) from public, anon;
revoke all on function public.classiq_is_my_student(uuid) from public, anon;
revoke all on function public.classiq_can_access_room(uuid) from public, anon;
revoke all on function public.classiq_run_room_automation(uuid) from public, anon;
revoke all on function public.classiq_run_campus_automation() from public, anon;
revoke all on function public.classiq_simulate_room_action(uuid,text) from public, anon;
revoke all on function public.classiq_set_device_command(uuid,text) from public, anon;
grant execute on function public.classiq_role() to authenticated;
grant execute on function public.classiq_faculty_has_room(uuid) to authenticated;
grant execute on function public.classiq_faculty_has_course(uuid) to authenticated;
grant execute on function public.classiq_is_my_student(uuid) to authenticated;
grant execute on function public.classiq_can_access_room(uuid) to authenticated;
grant execute on function public.classiq_run_room_automation(uuid) to authenticated;
grant execute on function public.classiq_run_campus_automation() to authenticated;
grant execute on function public.classiq_simulate_room_action(uuid,text) to authenticated;
grant execute on function public.classiq_set_device_command(uuid,text) to authenticated;
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- Demo seed: 3 buildings, 15 rooms, 75 devices, 5 sensors per room,
-- 100 students, 10 faculty, several days of energy and attendance records.
insert into public.buildings (name, location, total_floors, is_simulated) values
  ('North Block', 'North campus', 3, true),
  ('Central Block', 'Main campus', 4, true),
  ('Science Block', 'East campus', 5, true)
on conflict (name) do nothing;

insert into public.classrooms (building_id, room_number, name, floor, capacity, status, is_simulated)
select b.id, p.prefix || p.floor_code || lpad(g.n::text, 2, '0'),
       'Lecture Hall ' || p.prefix || p.floor_code || lpad(g.n::text, 2, '0'),
       p.floor_code::integer,
       42 + (g.n % 3) * 6, case when g.n = 4 and p.prefix = 'C' then 'ACTIVE' else 'EMPTY' end, true
from (values ('North Block','A','1'),('Central Block','B','2'),('Science Block','C','2')) p(building_name,prefix,floor_code)
join public.buildings b on b.name = p.building_name
cross join generate_series(1,5) g(n)
on conflict (room_number) do nothing;

insert into public.devices (classroom_id, name, device_type, status, control_mode, power_rating, current_power, health_score, operating_hours, is_simulated)
select c.id, d.name, d.device_type,
       case when c.room_number = 'C204' and d.device_type = 'PROJECTOR' then 'ON' else 'OFF' end,
       'AUTO', d.power_rating,
       case when c.room_number = 'C204' and d.device_type = 'PROJECTOR' then d.power_rating else 0 end,
       case when c.room_number = 'C204' and d.device_type = 'FAN' then 62 else 82 + ((ascii(right(c.room_number,1)) + length(d.name)) % 18) end,
       340 + (ascii(right(c.room_number,1)) * 23), true
from public.classrooms c
cross join (values
  ('Ceiling lights','LIGHT',480::numeric),
  ('Ceiling fan','FAN',75::numeric),
  ('Projector','PROJECTOR',320::numeric),
  ('Smart AC','AC',1450::numeric),
  ('Smart plug','SMART_PLUG',45::numeric)
) d(name,device_type,power_rating)
on conflict (classroom_id, name) do nothing;

insert into public.sensors (classroom_id, sensor_type, value, unit, is_simulated)
select c.id, s.sensor_type,
  case s.sensor_type
    when 'TEMPERATURE' then case when c.room_number = 'C204' then 28 else 23 + ((ascii(right(c.room_number,1)) % 5)) end
    when 'HUMIDITY' then 48 + (ascii(right(c.room_number,1)) % 15)
    when 'CO2' then case when c.room_number = 'C204' then 870 else 480 + (ascii(right(c.room_number,1)) % 260) end
    when 'LIGHT' then 180 + ((ascii(right(c.room_number,1)) * 17) % 460)
    when 'OCCUPANCY' then case when c.room_number = 'C204' then 42 else 0 end
    else 0
  end,
  case s.sensor_type
    when 'TEMPERATURE' then '°C' when 'HUMIDITY' then '%'
    when 'CO2' then 'ppm' when 'LIGHT' then 'lux'
    when 'OCCUPANCY' then 'students' else 'W'
  end,
  true
from public.classrooms c
cross join (values ('TEMPERATURE'),('HUMIDITY'),('CO2'),('LIGHT'),('OCCUPANCY'),('POWER')) s(sensor_type)
on conflict (classroom_id, sensor_type) do nothing;

insert into public.courses (name, code, department) values
  ('Database Systems','CS302','Computer Science'),
  ('Applied Artificial Intelligence','CS418','Computer Science'),
  ('Networks and Security','CS326','Computer Science'),
  ('Signals and Systems','EC204','Electronics'),
  ('Engineering Mathematics','MA201','Applied Sciences'),
  ('Cloud Computing','CS442','Computer Science')
on conflict (code) do nothing;

insert into public.faculty (employee_id, department)
select 'FAC-' || lpad(n::text,3,'0'), case when n <= 6 then 'Computer Science' else 'Electronics' end
from generate_series(1,10) n
on conflict (employee_id) do nothing;

insert into public.students (student_id, department, year, section)
select 'STU-' || lpad(n::text,4,'0'),
       case when n % 4 = 0 then 'Electronics' else 'Computer Science' end,
       1 + (n % 4), case when n % 2 = 0 then 'A' else 'B' end
from generate_series(1,100) n
on conflict (student_id) do nothing;

insert into public.timetable (course_id, faculty_id, classroom_id, day_of_week, start_time, end_time, requires_projector)
select c.id, f.id, r.id, d.day_num, d.start_at, d.start_at + interval '50 minutes', d.projector
from (values
  ('CS302','FAC-001','A101',1,time '09:00',true),
  ('CS418','FAC-002','C204',1,time '10:00',true),
  ('CS326','FAC-003','A102',2,time '11:00',true),
  ('EC204','FAC-007','C201',3,time '09:00',false),
  ('MA201','FAC-009','B201',4,time '13:00',false),
  ('CS442','FAC-004','C202',5,time '14:00',true)
) d(course_code,employee_code,room_number,day_num,start_at,projector)
join public.courses c on c.code = d.course_code
join public.faculty f on f.employee_id = d.employee_code
join public.classrooms r on r.room_number = d.room_number
where not exists (
  select 1 from public.timetable t where t.course_id = c.id and t.classroom_id = r.id
    and t.day_of_week = d.day_num and t.start_time = d.start_at
);

insert into public.energy_readings (classroom_id, power, energy_kwh, estimated_cost, is_simulated, recorded_at)
select c.id,
       round((450 + ((g.hour_num % 8) * 95) + case when c.room_number = 'C204' then 360 else 0 end)::numeric, 2),
       round((450 + ((g.hour_num % 8) * 95) + case when c.room_number = 'C204' then 360 else 0 end)::numeric / 1000, 3),
       round(((450 + ((g.hour_num % 8) * 95) + case when c.room_number = 'C204' then 360 else 0 end)::numeric / 1000) * 8.25, 2),
       true,
       now() - (g.hour_num * interval '1 hour')
from public.classrooms c
cross join generate_series(0,167) g(hour_num)
where not exists (select 1 from public.energy_readings e where e.classroom_id = c.id);

insert into public.device_readings (device_id, power, voltage, current_amps, is_simulated, recorded_at)
select d.id, case when d.status = 'ON' then d.current_power else d.power_rating * 0.12 end,
       220 + (g.hour_num % 9), case when d.power_rating > 0 then d.power_rating / 230 else 0 end,
       true,
       now() - (g.hour_num * interval '1 hour')
from public.devices d cross join generate_series(0,23) g(hour_num)
where not exists (select 1 from public.device_readings dr where dr.device_id = d.id);

insert into public.attendance (student_id, course_id, classroom_id, attendance_date, check_in_time, status, method)
select s.id, c.id, r.id, current_date - days.day_num,
       (current_date - days.day_num)::timestamp + time '09:02',
       case when (row_number() over (partition by days.day_num order by s.student_id) % 13) = 0 then 'LATE' else 'PRESENT' end,
       'SIMULATED'
from public.students s
cross join generate_series(0,5) days(day_num)
join public.courses c on c.code = 'CS302'
join public.classrooms r on r.room_number = 'A101'
where s.student_id <= 'STU-0050'
on conflict (student_id, course_id, attendance_date) do nothing;

insert into public.maintenance_tickets (device_id, classroom_id, title, description, priority, status, ai_generated, is_simulated)
select d.id, d.classroom_id, 'Fan bearing inspection', 'Health score is below the recommended service threshold.', 'MEDIUM', 'OPEN', true, true
from public.devices d join public.classrooms c on c.id = d.classroom_id
where c.room_number = 'C204' and d.device_type = 'FAN'
and not exists (select 1 from public.maintenance_tickets t where t.device_id = d.id and t.status <> 'RESOLVED');

insert into public.alerts (classroom_id, device_id, alert_type, severity, title, message, is_simulated)
select d.classroom_id, d.id, 'MAINTENANCE_REQUIRED', 'WARNING', 'Fan health below threshold',
       'Predictive maintenance recommends an inspection before the next service interval.', true
from public.devices d join public.classrooms c on c.id = d.classroom_id
where c.room_number = 'C204' and d.device_type = 'FAN'
and not exists (select 1 from public.alerts a where a.device_id = d.id and a.title = 'Fan health below threshold');

insert into public.ai_insights (classroom_id, device_id, insight_type, title, description, confidence, potential_saving_kwh, is_simulated)
select c.id, d.id, 'ENERGY_OPTIMIZATION', 'Review projector idle hours',
       'Recent simulated readings show higher projector draw in this room; compare usage with the timetable.',
       0.88, 4.2, true
from public.classrooms c join public.devices d on d.classroom_id = c.id and d.device_type = 'PROJECTOR'
where c.room_number = 'C204'
and not exists (select 1 from public.ai_insights i where i.classroom_id = c.id and i.title = 'Review projector idle hours');

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'devices','sensors','device_readings','energy_readings','alerts',
    'maintenance_tickets','automation_logs'
  ] loop
    if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
       and not exists (
         select 1 from pg_publication_tables
         where pubname = 'supabase_realtime'
           and schemaname = 'public' and tablename = table_name
       ) then
      execute format('alter publication supabase_realtime add table public.%I', table_name);
    end if;
  end loop;
end
$$;

-- Promote a trusted first user manually after signing up:
-- update public.profiles set role = 'ADMIN' where email = 'your-admin-email';
-- Never make public sign-up default to ADMIN.
