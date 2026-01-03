-- ==============================
-- PROFILES (Users)
-- ==============================
create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  email text unique not null,
  first_name text,
  middle_name text,
  last_name text,
  birth_date date,
  sex text check (sex in ('M','F')),
  phone text,
  referral_code text unique,
  base_referral text,
  role text not null default 'student'
    check (role in ('admin','assistant','teacher','student','influencer')),
  is_active boolean not null default true,
  created_at timestamp with time zone default (timezone('est', now())),
  first_lesson text,
  medical_note text
);


-- ==============================
-- REFERRAL AUTO-CODE GENERATION
-- ==============================
create or replace function set_referral_code()
returns trigger as $$
declare
  initials text;
  yr text;
begin
  initials := upper(substring(new.first_name,1,1))
           || coalesce(upper(substring(new.middle_name,1,1)),'')
           || upper(substring(new.last_name,1,1));

  if new.birth_date is not null then
    yr := to_char(new.birth_date,'YY');
  else
    yr := '00';
  end if;

  new.referral_code := initials || yr;
  new.base_referral := '00';
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_referral_code_trigger on public.profiles;
create trigger set_referral_code_trigger
before insert on public.profiles
for each row execute function set_referral_code();

-- ==============================
-- SIGN UP TYPE
-- ==============================

-- 2. Fees table (if not already there)
CREATE TABLE IF NOT EXISTS public.fees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL,
  description TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Trigger function to auto-charge
CREATE OR REPLACE FUNCTION public.handle_signup_fee()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.signup_type = 'me' THEN
    INSERT INTO public.fees (profile_id, amount, description)
    VALUES (NEW.id, 60.00, 'Frais inscription (me)');
  ELSIF NEW.signup_type = 'me+others' THEN
    -- Add fee for main user
    INSERT INTO public.fees (profile_id, amount, description)
    VALUES (NEW.id, 60.00, 'Frais inscription (me+others - main)');
    -- Dependents will each add their own fees when added separately
  ELSIF NEW.signup_type = 'others_only' THEN
    -- No fee for main user, handled at dependent creation
    NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4. Attach trigger to profiles
DROP TRIGGER IF EXISTS trg_signup_fee ON public.profiles;
CREATE TRIGGER trg_signup_fee
AFTER INSERT ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.handle_signup_fee();


-- Make sure pgcrypto exists for UUIDs
CREATE EXTENSION IF NOT EXISTS pgcrypto;

----------------------------------------------------
-- 1. Sessions table (holds actual occurrences)
----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  start_date date NOT NULL,
  end_date date NOT NULL,
  day_of_week int NOT NULL CHECK (day_of_week BETWEEN 1 AND 7), -- 1=Dimanche, 7=Samedi
  start_time time NOT NULL,
  duration_hours int NOT NULL DEFAULT 2,
  capacity int NOT NULL DEFAULT 20,
  booking_mode text NOT NULL DEFAULT 'allow'
    CHECK (booking_mode IN ('allow','admin_only')),
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','cancelled')),
  created_at timestamptz DEFAULT now()
);

-- Prevent duplicate sessions (same course, same date/time)
CREATE UNIQUE INDEX IF NOT EXISTS ux_sessions_unique
  ON public.sessions(course_id, start_date, start_time);

----------------------------------------------------
-- 2. Session Series table (patterns)
----------------------------------------------------
DROP TABLE IF EXISTS public.session_series CASCADE;

CREATE TABLE public.session_series (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  start_date date NOT NULL,
  end_date date NOT NULL,
  days_of_week int[] NOT NULL,        -- e.g. {2,4,6} = Lundi, Mercredi, Vendredi
  start_time time NOT NULL,
  duration_hours int NOT NULL DEFAULT 2,
  capacity int NOT NULL DEFAULT 20,
  booking_mode text NOT NULL DEFAULT 'allow'
    CHECK (booking_mode IN ('allow','admin_only')),
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','cancelled')),
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz DEFAULT now(),

  -- Constraint: array not empty
  CONSTRAINT session_series_nonempty CHECK (array_length(days_of_week, 1) > 0),

  -- Constraint: no Sunday (1)
  CONSTRAINT session_series_no_sunday CHECK (NOT (1 = ANY(days_of_week))),

  -- Constraint: all values must be between 1 and 7
  CONSTRAINT session_series_valid_days CHECK (
    array_position(days_of_week, 0) IS NULL
    AND array_position(days_of_week, 8) IS NULL
  )
);

----------------------------------------------------
-- 3. Generator function + trigger
----------------------------------------------------
CREATE OR REPLACE FUNCTION public.generate_sessions_from_series()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  occ_date date;
  dow_iso int;
  dow_sun1 int; -- 1=Dimanche .. 7=Samedi
BEGIN
  occ_date := NEW.start_date;

  WHILE occ_date <= NEW.end_date LOOP
    -- ISO: Monday=1..Sunday=7
    dow_iso := EXTRACT(ISODOW FROM occ_date)::int;
    dow_sun1 := CASE WHEN dow_iso = 7 THEN 1 ELSE dow_iso + 1 END;

    IF dow_sun1 <> 1 AND dow_sun1 = ANY(NEW.days_of_week) THEN
      INSERT INTO public.sessions (
        course_id,
        start_date,
        end_date,
        day_of_week,
        start_time,
        duration_hours,
        capacity,
        booking_mode,
        status
      )
      VALUES (
        NEW.course_id,
        occ_date,
        occ_date,  -- single-day occurrence
        dow_sun1,
        NEW.start_time,
        NEW.duration_hours,
        NEW.capacity,
        NEW.booking_mode,
        NEW.status
      )
      ON CONFLICT ON CONSTRAINT ux_sessions_unique DO NOTHING;
    END IF;

    occ_date := occ_date + INTERVAL '1 day';
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_generate_sessions_from_series ON public.session_series;

CREATE TRIGGER trg_generate_sessions_from_series
AFTER INSERT ON public.session_series
FOR EACH ROW
EXECUTE FUNCTION public.generate_sessions_from_series();

----------------------------------------------------
-- 4. RLS Policies
----------------------------------------------------
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_series ENABLE ROW LEVEL SECURITY;

-- Select: all
DROP POLICY IF EXISTS "sessions_select_all" ON public.sessions;
CREATE POLICY "sessions_select_all"
  ON public.sessions
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "series_select_all" ON public.session_series;
CREATE POLICY "series_select_all"
  ON public.session_series
  FOR SELECT
  USING (true);

-- Write: only staff (admin, assistant, teacher)
DROP POLICY IF EXISTS "sessions_write_staff" ON public.sessions;
CREATE POLICY "sessions_write_staff"
  ON public.sessions
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
      AND p.role IN ('admin','assistant','teacher')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
      AND p.role IN ('admin','assistant','teacher')
    )
  );

DROP POLICY IF EXISTS "series_write_staff" ON public.session_series;
CREATE POLICY "series_write_staff"
  ON public.session_series
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
      AND p.role IN ('admin','assistant','teacher')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
      AND p.role IN ('admin','assistant','teacher')
    )
  );


-- ==============================
-- ENROLLMENTS
-- ==============================
create table if not exists public.enrollments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade,
  course_id uuid references public.courses(id) on delete cascade,
  created_at timestamp with time zone default timezone('utc'::text, now())
);

-- ==============================
-- BULLETINS & FICHES TECHNIQUES
-- ==============================
create table if not exists public.bulletins (
  id uuid primary key default gen_random_uuid(),
  student_id uuid references public.profiles(id) on delete cascade,
  teacher_id uuid references public.profiles(id) on delete set null,
  month text not null,
  content jsonb not null,
  created_at timestamp with time zone default timezone('utc'::text, now())
);

create table if not exists public.fiches (
  id uuid primary key default gen_random_uuid(),
  student_id uuid references public.profiles(id) on delete cascade,
  teacher_id uuid references public.profiles(id) on delete set null,
  month text not null,
  content jsonb not null,
  created_at timestamp with time zone default timezone('utc'::text, now())
);

-- ==============================
-- ATTENDANCE
-- ==============================
create table if not exists public.attendance (
  id uuid primary key default gen_random_uuid(),
  student_id uuid references public.profiles(id) on delete cascade,
  session_id uuid references public.sessions(id) on delete cascade,
  present boolean default false,
  created_at timestamp with time zone default timezone('utc'::text, now())
);

-- Auto-inactive after 13 consecutive absences
create or replace function auto_inactive_after_absences()
returns trigger as $$
declare
  abs_count int;
begin
  if new.present = false then
    select count(*) into abs_count
    from public.attendance
    where student_id = new.student_id and present = false;

    if abs_count >= 13 then
      update public.profiles set is_active = false where id = new.student_id;
    end if;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists auto_inactive_trigger on public.attendance;
create trigger auto_inactive_trigger
after insert on public.attendance
for each row execute function auto_inactive_after_absences();

-- ==============================
-- INVOICES
-- ==============================
CREATE TABLE IF NOT EXISTS public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Type of invoice
  type text NOT NULL 
    CHECK (
      type IN (
        'registration',
        'annual',
        'monthly',
        'product',
        'reactivation'
      )
    ),
  
  description text,                        -- e.g. "Annual Membership Fee 2025", "September Tuition", "Goggles Purchase"
  
  amount numeric NOT NULL DEFAULT 0,       -- total to be paid
  paid_total numeric NOT NULL DEFAULT 0,   -- amount already paid
  
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','paid','cancelled','partial')),
  
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);

-- Enable RLS
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;


-- ==============================
-- COMMISSIONS & REFERRALS
-- ==============================
create table if not exists public.referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid references public.profiles(id) on delete cascade,
  referee_id uuid references public.profiles(id) on delete cascade,
  created_at timestamp with time zone default timezone('utc'::text, now())
);

create table if not exists public.commissions (
  id uuid primary key default gen_random_uuid(),
  influencer_id uuid references public.profiles(id) on delete cascade,
  amount numeric(10,2) not null,
  created_at timestamp with time zone default timezone('utc'::text, now())
);

create table if not exists public.commission_requests (
  id uuid primary key default gen_random_uuid(),
  influencer_id uuid references public.profiles(id) on delete cascade,
  amount numeric(10,2) not null,
  status text default 'pending' check (status in ('pending','approved','rejected')),
  created_at timestamp with time zone default timezone('utc'::text, now())
);

-- ==============================
-- PRODUCTS (Boutique) & PLANS
-- ==============================
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  price numeric(10,2) not null,
  created_at timestamp with time zone default timezone('utc'::text, now())
);

create table if not exists public.plans (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  price numeric(10,2) not null,
  duration interval not null,
  created_at timestamp with time zone default timezone('utc'::text, now())
);

-- ==============================
-- POLICIES (RLS)
-- ==============================
alter table public.profiles enable row level security;
alter table public.courses enable row level security;
alter table public.sessions enable row level security;
alter table public.enrollments enable row level security;
alter table public.bulletins enable row level security;
alter table public.fiches enable row level security;
alter table public.attendance enable row level security;
alter table public.invoices enable row level security;
alter table public.referrals enable row level security;
alter table public.commissions enable row level security;
alter table public.commission_requests enable row level security;
alter table public.products enable row level security;
alter table public.plans enable row level security;

-- =======================================================
-- ✅ Ensure profiles are always created when a new user signs up
-- =======================================================

create or replace function public.handle_new_user()
returns trigger as $$
begin
  -- Insert into profiles if not already there
  insert into public.profiles (id, email, role, is_active)
  values (new.id, new.email, 'student', true)
  on conflict (id) do nothing;

  return new;
end;
$$ language plpgsql security definer;

-- Remove old trigger if it exists (avoid duplicates)
drop trigger if exists on_auth_user_created on auth.users;

-- Create new trigger for automatic profile creation
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

insert into profiles (id, email, first_name, last_name, role)
select id, email, 'David Emmanuel','Adrien','admin'
from auth.users where email = 'deadrien@clubaquador.com'
on conflict (id) do update set role = 'admin';

insert into profiles (id, email, first_name, last_name, role)
select id, email, 'Waldine Soraya','SAUREL','assistant'
from auth.users where email = 'ssaurel88@gmail.com'
on conflict (id) do update set role = 'assistant';

insert into profiles (id, email, first_name, last_name, role)
select id, email, 'Djaffey','Laurent','teacher'
from auth.users where email = 'laurentdjaffey@gmail.com'
on conflict (id) do update set role = 'teacher';

insert into profiles (id, email, first_name, last_name, role)
select id, email, 'Ishida Mardelle','Desir','student'
from auth.users where email = 'desirmardelle.ishida@gmail.com'
on conflict (id) do update set role = 'student';

-- INFLUENCER
insert into profiles (id, email, first_name, last_name, role)
select id, email, 'Jennika','Joseph','influencer'
from auth.users where email = 'josephjennika@yahoo.com'
on conflict (id) do update set role = 'influencer';