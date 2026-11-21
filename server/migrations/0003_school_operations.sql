-- Milestone 2: school operations. The existing identity, membership, staff, and
-- audit tables remain the source of truth for authentication and school access.

CREATE TYPE public.student_gender AS ENUM ('female', 'male', 'other');
CREATE TYPE public.student_status AS ENUM ('active', 'inactive', 'graduated', 'withdrawn');
CREATE TYPE public.admission_status AS ENUM ('pending', 'under_review', 'accepted', 'rejected', 'withdrawn');
CREATE TYPE public.enrolment_status AS ENUM ('active', 'completed', 'withdrawn', 'transferred');

CREATE TABLE public.academic_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  name text NOT NULL,
  starts_on date NOT NULL,
  ends_on date NOT NULL,
  is_current boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, id),
  UNIQUE (school_id, name),
  CHECK (ends_on > starts_on)
);

CREATE UNIQUE INDEX academic_sessions_one_current_per_school
  ON public.academic_sessions(school_id) WHERE is_current;

CREATE TABLE public.departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, id),
  UNIQUE (school_id, name)
);

ALTER TABLE public.staff_profiles ADD CONSTRAINT staff_profiles_school_id_id_key UNIQUE (school_id, id);
ALTER TABLE public.campuses ADD CONSTRAINT campuses_school_id_id_key UNIQUE (school_id, id);

CREATE TABLE public.grade_levels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  name text NOT NULL,
  academic_level text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, id),
  UNIQUE (school_id, name)
);

INSERT INTO public.grade_levels(school_id, name, academic_level, sort_order)
SELECT s.id, levels.name, levels.academic_level, levels.sort_order
FROM public.schools s
CROSS JOIN (VALUES
  ('Nursery 1', 'Nursery', 10), ('Nursery 2', 'Nursery', 20), ('Nursery 3', 'Nursery', 30),
  ('Primary 1', 'Primary', 40), ('Primary 2', 'Primary', 50), ('Primary 3', 'Primary', 60),
  ('Primary 4', 'Primary', 70), ('Primary 5', 'Primary', 80), ('Primary 6', 'Primary', 90),
  ('JSS 1', 'Junior secondary', 100), ('JSS 2', 'Junior secondary', 110), ('JSS 3', 'Junior secondary', 120),
  ('SS 1', 'Senior secondary', 130), ('SS 2', 'Senior secondary', 140), ('SS 3', 'Senior secondary', 150)
) AS levels(name, academic_level, sort_order)
ON CONFLICT (school_id, name) DO NOTHING;

CREATE OR REPLACE FUNCTION public.seed_default_grade_levels()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.grade_levels(school_id, name, academic_level, sort_order)
  VALUES
    (NEW.id, 'Nursery 1', 'Nursery', 10), (NEW.id, 'Nursery 2', 'Nursery', 20),
    (NEW.id, 'Nursery 3', 'Nursery', 30), (NEW.id, 'Primary 1', 'Primary', 40),
    (NEW.id, 'Primary 2', 'Primary', 50), (NEW.id, 'Primary 3', 'Primary', 60),
    (NEW.id, 'Primary 4', 'Primary', 70), (NEW.id, 'Primary 5', 'Primary', 80),
    (NEW.id, 'Primary 6', 'Primary', 90), (NEW.id, 'JSS 1', 'Junior secondary', 100),
    (NEW.id, 'JSS 2', 'Junior secondary', 110), (NEW.id, 'JSS 3', 'Junior secondary', 120),
    (NEW.id, 'SS 1', 'Senior secondary', 130), (NEW.id, 'SS 2', 'Senior secondary', 140),
    (NEW.id, 'SS 3', 'Senior secondary', 150)
  ON CONFLICT (school_id, name) DO NOTHING;
  RETURN NEW;
END;
$$;
CREATE TRIGGER schools_seed_grade_levels AFTER INSERT ON public.schools
  FOR EACH ROW EXECUTE FUNCTION public.seed_default_grade_levels();

CREATE TABLE public.classes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  grade_level_id uuid NOT NULL,
  academic_session_id uuid NOT NULL,
  campus_id uuid,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, id),
  UNIQUE (school_id, id, academic_session_id),
  UNIQUE (school_id, name, academic_session_id),
  FOREIGN KEY (school_id, grade_level_id) REFERENCES public.grade_levels(school_id, id),
  FOREIGN KEY (school_id, academic_session_id) REFERENCES public.academic_sessions(school_id, id),
  FOREIGN KEY (school_id, campus_id) REFERENCES public.campuses(school_id, id)
);

CREATE TABLE public.class_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  class_id uuid NOT NULL,
  academic_session_id uuid NOT NULL,
  name text NOT NULL,
  classroom text,
  capacity integer CHECK (capacity IS NULL OR capacity > 0),
  class_teacher_id uuid,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, id),
  UNIQUE (school_id, id, class_id, academic_session_id),
  UNIQUE (school_id, class_id, name),
  FOREIGN KEY (school_id, class_id, academic_session_id)
    REFERENCES public.classes(school_id, id, academic_session_id),
  FOREIGN KEY (school_id, class_teacher_id) REFERENCES public.staff_profiles(school_id, id)
);

CREATE TABLE public.subjects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  name text NOT NULL,
  code text NOT NULL,
  description text,
  academic_level text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, id),
  UNIQUE (school_id, code),
  UNIQUE (school_id, name)
);

CREATE TABLE public.class_subjects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  class_id uuid NOT NULL,
  subject_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (school_id, class_id) REFERENCES public.classes(school_id, id) ON DELETE CASCADE,
  FOREIGN KEY (school_id, subject_id) REFERENCES public.subjects(school_id, id) ON DELETE CASCADE,
  UNIQUE (school_id, class_id, subject_id)
);

CREATE TABLE public.guardians (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  full_name text NOT NULL,
  email text,
  phone text NOT NULL,
  address text,
  account_status text NOT NULL DEFAULT 'no_account'
    CHECK (account_status IN ('no_account', 'active', 'inactive')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, id),
  UNIQUE (school_id, user_id)
);

CREATE TABLE public.students (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id text NOT NULL,
  first_name text NOT NULL,
  middle_name text,
  last_name text NOT NULL,
  date_of_birth date NOT NULL,
  gender public.student_gender NOT NULL,
  photo_url text,
  nationality text,
  state_of_origin text,
  residential_address text,
  admission_date date NOT NULL DEFAULT CURRENT_DATE,
  admission_type text,
  previous_school text,
  status public.student_status NOT NULL DEFAULT 'active',
  emergency_contact_name text,
  emergency_contact_phone text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, id),
  UNIQUE (school_id, student_id)
);

-- Health details are split out so they can be given narrower RLS than the
-- ordinary student directory/profile.
CREATE TABLE public.student_medical_records (
  student_id uuid PRIMARY KEY,
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  medical_notes text,
  blood_group text,
  allergies text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (school_id, student_id) REFERENCES public.students(school_id, id) ON DELETE CASCADE
);

CREATE TABLE public.student_guardians (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id uuid NOT NULL,
  guardian_id uuid NOT NULL,
  relationship text NOT NULL,
  is_primary boolean NOT NULL DEFAULT false,
  is_emergency_contact boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (school_id, student_id) REFERENCES public.students(school_id, id) ON DELETE CASCADE,
  FOREIGN KEY (school_id, guardian_id) REFERENCES public.guardians(school_id, id) ON DELETE CASCADE,
  UNIQUE (school_id, student_id, guardian_id)
);

CREATE UNIQUE INDEX student_guardians_one_primary
  ON public.student_guardians(school_id, student_id) WHERE is_primary;
CREATE UNIQUE INDEX guardians_school_name_phone_key
  ON public.guardians(school_id, lower(full_name), phone);

CREATE OR REPLACE FUNCTION public.validate_guardian_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.user_id IS NULL THEN
    NEW.account_status := 'no_account';
    RETURN NEW;
  END IF;
  IF NEW.email IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.user_profiles up
    JOIN public.school_memberships sm ON sm.user_id = up.id
    WHERE up.id = NEW.user_id AND lower(up.email) = lower(NEW.email)
      AND sm.school_id = NEW.school_id AND sm.role = 'parent' AND sm.is_active
  ) THEN
    RAISE EXCEPTION 'Guardian account must be a school parent member with a matching verified email';
  END IF;
  NEW.account_status := 'active';
  RETURN NEW;
END;
$$;
CREATE TRIGGER validate_guardian_user
  BEFORE INSERT OR UPDATE OF school_id, user_id, email ON public.guardians
  FOR EACH ROW EXECUTE FUNCTION public.validate_guardian_user();

ALTER TABLE public.staff_profiles
  ALTER COLUMN user_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS full_name text,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS date_of_birth date,
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS department_id uuid,
  ADD COLUMN IF NOT EXISTS job_title text,
  ADD COLUMN IF NOT EXISTS qualifications text,
  ADD COLUMN IF NOT EXISTS teaching_experience text,
  ADD COLUMN IF NOT EXISTS photo_url text,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'on_leave', 'inactive', 'archived')),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE UNIQUE INDEX staff_employee_id_per_school
  ON public.staff_profiles(school_id, employee_id) WHERE employee_id IS NOT NULL;
ALTER TABLE public.staff_profiles
  ADD CONSTRAINT staff_department_same_school
  FOREIGN KEY (school_id, department_id) REFERENCES public.departments(school_id, id);

CREATE OR REPLACE FUNCTION public.validate_staff_school_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.user_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.school_memberships sm
    WHERE sm.school_id = NEW.school_id AND sm.user_id = NEW.user_id AND sm.is_active
  ) THEN
    RAISE EXCEPTION 'Linked staff account must be an active member of this school';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER validate_staff_school_user
  BEFORE INSERT OR UPDATE OF school_id, user_id ON public.staff_profiles
  FOR EACH ROW EXECUTE FUNCTION public.validate_staff_school_user();

CREATE TABLE public.teacher_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  staff_profile_id uuid NOT NULL,
  class_section_id uuid NOT NULL,
  subject_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (school_id, class_section_id) REFERENCES public.class_sections(school_id, id) ON DELETE CASCADE,
  FOREIGN KEY (school_id, staff_profile_id) REFERENCES public.staff_profiles(school_id, id) ON DELETE CASCADE,
  FOREIGN KEY (school_id, subject_id) REFERENCES public.subjects(school_id, id) ON DELETE CASCADE,
  UNIQUE NULLS NOT DISTINCT (school_id, staff_profile_id, class_section_id, subject_id)
);

CREATE OR REPLACE FUNCTION public.validate_teacher_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_staff_status text;
  v_class_id uuid;
BEGIN
  SELECT user_id, status INTO v_user_id, v_staff_status FROM public.staff_profiles
  WHERE school_id = NEW.school_id AND id = NEW.staff_profile_id;
  IF NOT FOUND OR v_user_id IS NULL OR v_staff_status <> 'active'
     OR NOT EXISTS (
       SELECT 1 FROM public.school_memberships sm WHERE sm.school_id = NEW.school_id
         AND sm.user_id = v_user_id AND sm.role = 'teacher' AND sm.is_active
     ) THEN
    RAISE EXCEPTION 'Assignment requires an active staff member with the teacher role';
  END IF;
  SELECT class_id INTO v_class_id FROM public.class_sections
  WHERE school_id = NEW.school_id AND id = NEW.class_section_id AND status = 'active';
  IF NOT FOUND THEN RAISE EXCEPTION 'Class section is not active in this school'; END IF;
  IF NEW.subject_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.class_subjects cs
    WHERE cs.school_id = NEW.school_id AND cs.class_id = v_class_id AND cs.subject_id = NEW.subject_id
  ) THEN
    RAISE EXCEPTION 'Subject must be assigned to the class before assigning a teacher';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER validate_teacher_assignment
  BEFORE INSERT OR UPDATE ON public.teacher_assignments
  FOR EACH ROW EXECUTE FUNCTION public.validate_teacher_assignment();

CREATE TABLE public.admissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  applicant_first_name text NOT NULL,
  applicant_middle_name text,
  applicant_last_name text NOT NULL,
  date_of_birth date NOT NULL,
  gender public.student_gender NOT NULL,
  intended_grade_level_id uuid NOT NULL,
  academic_session_id uuid NOT NULL,
  parent_name text NOT NULL,
  parent_relationship text NOT NULL,
  parent_phone text NOT NULL,
  parent_email text,
  parent_address text,
  previous_school text,
  residential_address text,
  additional_notes text,
  status public.admission_status NOT NULL DEFAULT 'pending',
  requested_information text,
  linked_student_id uuid,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, id),
  FOREIGN KEY (school_id, intended_grade_level_id) REFERENCES public.grade_levels(school_id, id),
  FOREIGN KEY (school_id, academic_session_id) REFERENCES public.academic_sessions(school_id, id),
  FOREIGN KEY (school_id, linked_student_id) REFERENCES public.students(school_id, id)
);

CREATE TABLE public.admission_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  admission_id uuid NOT NULL,
  file_name text NOT NULL,
  storage_path text NOT NULL,
  document_type text,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (school_id, admission_id) REFERENCES public.admissions(school_id, id) ON DELETE CASCADE,
  UNIQUE (school_id, storage_path)
);

CREATE TABLE public.admission_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  admission_id uuid NOT NULL,
  actor_user_id uuid REFERENCES public.users(id),
  action text NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (school_id, admission_id) REFERENCES public.admissions(school_id, id) ON DELETE CASCADE
);

CREATE TABLE public.enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id uuid NOT NULL,
  academic_session_id uuid NOT NULL,
  class_id uuid NOT NULL,
  class_section_id uuid NOT NULL,
  enrolment_date date NOT NULL DEFAULT CURRENT_DATE,
  status public.enrolment_status NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (school_id, student_id) REFERENCES public.students(school_id, id),
  FOREIGN KEY (school_id, academic_session_id) REFERENCES public.academic_sessions(school_id, id),
  FOREIGN KEY (school_id, class_id, academic_session_id) REFERENCES public.classes(school_id, id, academic_session_id),
  FOREIGN KEY (school_id, class_section_id, class_id, academic_session_id)
    REFERENCES public.class_sections(school_id, id, class_id, academic_session_id),
  UNIQUE (school_id, id)
);

CREATE UNIQUE INDEX enrollments_one_active_per_session
  ON public.enrollments(school_id, student_id, academic_session_id) WHERE status = 'active';

CREATE TABLE public.student_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id uuid NOT NULL,
  file_name text NOT NULL,
  storage_path text NOT NULL,
  document_type text,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (school_id, student_id) REFERENCES public.students(school_id, id) ON DELETE CASCADE,
  UNIQUE (school_id, storage_path)
);

CREATE TABLE public.student_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id uuid NOT NULL,
  from_enrollment_id uuid REFERENCES public.enrollments(id),
  to_enrollment_id uuid REFERENCES public.enrollments(id),
  transfer_type text NOT NULL CHECK (transfer_type IN ('promotion', 'class_transfer', 'campus_transfer', 'withdrawal')),
  notes text,
  actor_user_id uuid REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (school_id, student_id) REFERENCES public.students(school_id, id) ON DELETE CASCADE
);

CREATE INDEX students_school_name_idx ON public.students(school_id, last_name, first_name);
CREATE INDEX student_guardians_guardian_idx ON public.student_guardians(school_id, guardian_id);
CREATE INDEX enrollments_student_idx ON public.enrollments(school_id, student_id, academic_session_id);
CREATE INDEX admissions_status_idx ON public.admissions(school_id, status, submitted_at);
CREATE INDEX teacher_assignments_staff_idx ON public.teacher_assignments(school_id, staff_profile_id);
CREATE INDEX staff_profiles_school_status_idx ON public.staff_profiles(school_id, status);
CREATE INDEX audit_logs_school_created_idx ON public.audit_logs(school_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.can_manage_academics(p_school_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.can_manage_school(p_school_id)
    OR public.has_school_role(p_school_id, 'academic_admin');
$$;

CREATE OR REPLACE FUNCTION public.can_view_student(p_school_id uuid, p_student_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_school_member(p_school_id)
    AND (
      public.can_manage_academics(p_school_id)
      OR EXISTS (
        SELECT 1 FROM public.student_guardians sg
        JOIN public.guardians g ON g.id = sg.guardian_id AND g.school_id = sg.school_id
        JOIN public.school_memberships pm ON pm.school_id = sg.school_id AND pm.user_id = public.current_user_id()
        WHERE sg.school_id = p_school_id
          AND sg.student_id = p_student_id
          AND g.user_id = public.current_user_id()
          AND pm.role = 'parent' AND pm.is_active
      )
      OR EXISTS (
        SELECT 1 FROM public.school_memberships sm
        WHERE sm.school_id = p_school_id AND sm.user_id = public.current_user_id()
          AND sm.role = 'teacher' AND sm.is_active
          AND (EXISTS (
            SELECT 1 FROM public.enrollments e
            JOIN public.teacher_assignments ta
              ON ta.school_id = e.school_id AND ta.class_section_id = e.class_section_id
            JOIN public.staff_profiles sp ON sp.id = ta.staff_profile_id
            WHERE e.school_id = p_school_id AND e.student_id = p_student_id
              AND e.status = 'active' AND sp.user_id = public.current_user_id()
          ) OR EXISTS (
            SELECT 1 FROM public.enrollments e
            JOIN public.class_sections cs ON cs.school_id = e.school_id AND cs.id = e.class_section_id
            JOIN public.staff_profiles sp ON sp.school_id = cs.school_id AND sp.id = cs.class_teacher_id
            WHERE e.school_id = p_school_id AND e.student_id = p_student_id
              AND e.status = 'active' AND sp.user_id = public.current_user_id()
          ))
      )
    );
$$;

REVOKE EXECUTE ON FUNCTION public.can_manage_academics(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_view_student(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_academics(uuid), public.can_view_student(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.can_manage_school_folder(p_folder text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE WHEN p_folder ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    THEN public.can_manage_academics(p_folder::uuid) ELSE false END;
$$;
REVOKE EXECUTE ON FUNCTION public.can_manage_school_folder(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_school_folder(text) TO authenticated;

-- Tenant-scoped RLS. Parents get linked student rows only; health records and
-- administrative workflows remain restricted to school managers/academic staff.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'academic_sessions', 'departments', 'grade_levels', 'classes', 'class_sections',
    'subjects', 'class_subjects', 'guardians', 'students', 'student_medical_records',
    'student_guardians', 'teacher_assignments', 'admissions', 'admission_documents',
    'admission_history', 'enrollments', 'student_documents', 'student_transfers'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
  END LOOP;
END $$;
GRANT SELECT, INSERT, UPDATE ON public.staff_profiles TO authenticated;

CREATE POLICY academic_sessions_read ON public.academic_sessions FOR SELECT TO authenticated
  USING (public.is_school_member(school_id));
CREATE POLICY academic_sessions_manage ON public.academic_sessions FOR ALL TO authenticated
  USING (public.can_manage_academics(school_id)) WITH CHECK (public.can_manage_academics(school_id));

CREATE POLICY departments_read ON public.departments FOR SELECT TO authenticated
  USING (public.is_school_member(school_id));
CREATE POLICY departments_manage ON public.departments FOR ALL TO authenticated
  USING (public.can_manage_school(school_id)) WITH CHECK (public.can_manage_school(school_id));

CREATE POLICY grade_levels_read ON public.grade_levels FOR SELECT TO authenticated
  USING (public.is_school_member(school_id));
CREATE POLICY grade_levels_manage ON public.grade_levels FOR ALL TO authenticated
  USING (public.can_manage_academics(school_id)) WITH CHECK (public.can_manage_academics(school_id));

CREATE POLICY classes_read ON public.classes FOR SELECT TO authenticated
  USING (public.can_manage_academics(school_id) OR EXISTS (
    SELECT 1 FROM public.teacher_assignments ta
    JOIN public.class_sections cs ON cs.school_id = ta.school_id AND cs.id = ta.class_section_id
    JOIN public.staff_profiles sp ON sp.school_id = ta.school_id AND sp.id = ta.staff_profile_id
    WHERE ta.school_id = classes.school_id AND cs.class_id = classes.id AND sp.user_id = public.current_user_id()
  ) OR EXISTS (
    SELECT 1 FROM public.class_sections cs
    JOIN public.staff_profiles sp ON sp.school_id = cs.school_id AND sp.id = cs.class_teacher_id
    WHERE cs.school_id = classes.school_id AND cs.class_id = classes.id AND sp.user_id = public.current_user_id()
  ) OR EXISTS (
    SELECT 1 FROM public.enrollments e JOIN public.student_guardians sg
      ON sg.school_id = e.school_id AND sg.student_id = e.student_id
    JOIN public.guardians g ON g.school_id = sg.school_id AND g.id = sg.guardian_id
    WHERE e.school_id = classes.school_id AND e.class_id = classes.id AND e.status = 'active'
      AND g.user_id = public.current_user_id() AND public.has_school_role(classes.school_id, 'parent')
  ));
CREATE POLICY classes_manage ON public.classes FOR ALL TO authenticated
  USING (public.can_manage_academics(school_id)) WITH CHECK (public.can_manage_academics(school_id));

CREATE POLICY class_sections_read ON public.class_sections FOR SELECT TO authenticated
  USING (public.can_manage_academics(school_id) OR EXISTS (
    SELECT 1 FROM public.teacher_assignments ta
    JOIN public.staff_profiles sp ON sp.school_id = ta.school_id AND sp.id = ta.staff_profile_id
    WHERE ta.school_id = class_sections.school_id AND ta.class_section_id = class_sections.id
      AND sp.user_id = public.current_user_id()
  ) OR EXISTS (
    SELECT 1 FROM public.staff_profiles sp WHERE sp.id = class_sections.class_teacher_id
      AND sp.school_id = class_sections.school_id AND sp.user_id = public.current_user_id()
  ) OR EXISTS (
    SELECT 1 FROM public.enrollments e JOIN public.student_guardians sg
      ON sg.school_id = e.school_id AND sg.student_id = e.student_id
    JOIN public.guardians g ON g.school_id = sg.school_id AND g.id = sg.guardian_id
    WHERE e.school_id = class_sections.school_id AND e.class_section_id = class_sections.id
      AND e.status = 'active' AND g.user_id = public.current_user_id()
      AND public.has_school_role(class_sections.school_id, 'parent')
  ));
CREATE POLICY class_sections_manage ON public.class_sections FOR ALL TO authenticated
  USING (public.can_manage_academics(school_id)) WITH CHECK (public.can_manage_academics(school_id));

CREATE POLICY subjects_read ON public.subjects FOR SELECT TO authenticated
  USING (public.can_manage_academics(school_id) OR EXISTS (
    SELECT 1 FROM public.teacher_assignments ta
    JOIN public.staff_profiles sp ON sp.school_id = ta.school_id AND sp.id = ta.staff_profile_id
    WHERE ta.school_id = subjects.school_id AND ta.subject_id = subjects.id AND sp.user_id = public.current_user_id()
  ) OR EXISTS (
    SELECT 1 FROM public.class_sections cs
    JOIN public.classes c ON c.school_id = cs.school_id AND c.id = cs.class_id
    JOIN public.class_subjects csub ON csub.school_id = c.school_id AND csub.class_id = c.id
    JOIN public.staff_profiles sp ON sp.school_id = cs.school_id AND sp.id = cs.class_teacher_id
    WHERE cs.school_id = subjects.school_id AND csub.subject_id = subjects.id AND sp.user_id = public.current_user_id()
  ) OR EXISTS (
    SELECT 1 FROM public.class_subjects cs
    JOIN public.enrollments e ON e.school_id = cs.school_id AND e.class_id = cs.class_id
    JOIN public.student_guardians sg ON sg.school_id = e.school_id AND sg.student_id = e.student_id
    JOIN public.guardians g ON g.school_id = sg.school_id AND g.id = sg.guardian_id
    WHERE cs.school_id = subjects.school_id AND cs.subject_id = subjects.id
      AND e.status = 'active' AND g.user_id = public.current_user_id()
      AND public.has_school_role(subjects.school_id, 'parent')
  ));
CREATE POLICY subjects_manage ON public.subjects FOR ALL TO authenticated
  USING (public.can_manage_academics(school_id)) WITH CHECK (public.can_manage_academics(school_id));

CREATE POLICY class_subjects_read ON public.class_subjects FOR SELECT TO authenticated
  USING (public.can_manage_academics(school_id) OR EXISTS (
    SELECT 1 FROM public.teacher_assignments ta
    JOIN public.staff_profiles sp ON sp.school_id = ta.school_id AND sp.id = ta.staff_profile_id
    WHERE ta.school_id = class_subjects.school_id AND ta.class_section_id IN (
      SELECT id FROM public.class_sections WHERE school_id = class_subjects.school_id AND class_id = class_subjects.class_id
    ) AND sp.user_id = public.current_user_id()
  ) OR EXISTS (
    SELECT 1 FROM public.enrollments e JOIN public.student_guardians sg
      ON sg.school_id = e.school_id AND sg.student_id = e.student_id
    JOIN public.guardians g ON g.school_id = sg.school_id AND g.id = sg.guardian_id
    WHERE e.school_id = class_subjects.school_id AND e.class_id = class_subjects.class_id
      AND e.status = 'active' AND g.user_id = public.current_user_id()
      AND public.has_school_role(class_subjects.school_id, 'parent')
  ));
CREATE POLICY class_subjects_manage ON public.class_subjects FOR ALL TO authenticated
  USING (public.can_manage_academics(school_id)) WITH CHECK (public.can_manage_academics(school_id));

CREATE POLICY guardians_read ON public.guardians FOR SELECT TO authenticated
  USING (public.is_school_member(school_id) AND (
    public.can_manage_academics(school_id) OR (
      user_id = public.current_user_id() AND public.has_school_role(school_id, 'parent')
    )
  ));
CREATE POLICY guardians_manage ON public.guardians FOR ALL TO authenticated
  USING (public.can_manage_academics(school_id)) WITH CHECK (public.can_manage_academics(school_id));

CREATE POLICY students_read ON public.students FOR SELECT TO authenticated
  USING (public.can_view_student(school_id, id));

CREATE POLICY student_medical_read ON public.student_medical_records FOR SELECT TO authenticated
  USING (public.can_manage_school(school_id));
CREATE POLICY student_medical_manage ON public.student_medical_records FOR ALL TO authenticated
  USING (public.can_manage_school(school_id)) WITH CHECK (public.can_manage_school(school_id));

CREATE POLICY student_guardians_read ON public.student_guardians FOR SELECT TO authenticated
  USING (public.can_manage_academics(school_id) OR EXISTS (
    SELECT 1 FROM public.guardians g WHERE g.id = student_guardians.guardian_id
      AND g.school_id = student_guardians.school_id AND g.user_id = public.current_user_id()
      AND public.has_school_role(student_guardians.school_id, 'parent')
  ));
CREATE POLICY student_guardians_manage ON public.student_guardians FOR ALL TO authenticated
  USING (public.can_manage_academics(school_id)) WITH CHECK (public.can_manage_academics(school_id));

CREATE POLICY staff_profiles_operations_read ON public.staff_profiles FOR SELECT TO authenticated
  USING (public.is_school_member(school_id));
CREATE POLICY staff_profiles_operations_insert ON public.staff_profiles FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_school(school_id));
CREATE POLICY staff_profiles_operations_update ON public.staff_profiles FOR UPDATE TO authenticated
  USING (public.can_manage_school(school_id)) WITH CHECK (public.can_manage_school(school_id));
CREATE POLICY staff_profiles_manager_only_update ON public.staff_profiles AS RESTRICTIVE
  FOR UPDATE TO authenticated USING (public.can_manage_school(school_id))
  WITH CHECK (public.can_manage_school(school_id));

CREATE POLICY teacher_assignments_read ON public.teacher_assignments FOR SELECT TO authenticated
  USING (public.can_manage_academics(school_id) OR EXISTS (
    SELECT 1 FROM public.staff_profiles sp WHERE sp.id = teacher_assignments.staff_profile_id
      AND sp.school_id = teacher_assignments.school_id AND sp.user_id = public.current_user_id()
  ));
CREATE POLICY teacher_assignments_manage ON public.teacher_assignments FOR ALL TO authenticated
  USING (public.can_manage_academics(school_id)) WITH CHECK (public.can_manage_academics(school_id));

CREATE POLICY admissions_read ON public.admissions FOR SELECT TO authenticated
  USING (public.can_manage_school(school_id));
CREATE POLICY admissions_insert ON public.admissions FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_school(school_id) AND status = 'pending' AND linked_student_id IS NULL);
CREATE POLICY admission_documents_read ON public.admission_documents FOR SELECT TO authenticated
  USING (public.can_manage_school(school_id));
CREATE POLICY admission_documents_manage ON public.admission_documents FOR ALL TO authenticated
  USING (public.can_manage_school(school_id)) WITH CHECK (public.can_manage_school(school_id));
CREATE POLICY admission_history_read ON public.admission_history FOR SELECT TO authenticated
  USING (public.can_manage_school(school_id));

CREATE POLICY enrollments_read ON public.enrollments FOR SELECT TO authenticated
  USING (public.can_view_student(school_id, student_id));
CREATE POLICY student_documents_read ON public.student_documents FOR SELECT TO authenticated
  USING (public.can_manage_school(school_id));
CREATE POLICY student_documents_manage ON public.student_documents FOR ALL TO authenticated
  USING (public.can_manage_school(school_id)) WITH CHECK (public.can_manage_school(school_id));
CREATE POLICY student_transfers_read ON public.student_transfers FOR SELECT TO authenticated
  USING (public.can_manage_academics(school_id));

-- A school row lock serializes ID generation; registration + guardian links +
-- optional medical data commit atomically.
CREATE OR REPLACE FUNCTION public.register_student(p_school_id uuid, p_student jsonb, p_guardians jsonb DEFAULT '[]'::jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_id uuid;
  v_school_prefix text;
  v_next integer;
  v_guardian jsonb;
  v_guardian_id uuid;
  v_class_id uuid;
  v_class_session_id uuid;
  v_section_capacity integer;
  v_section_count integer;
BEGIN
  IF public.current_user_id() IS NULL OR NOT public.can_manage_academics(p_school_id) THEN
    RAISE EXCEPTION 'Not authorised to register students';
  END IF;
  IF COALESCE(p_student->>'first_name', '') = ''
     OR COALESCE(p_student->>'last_name', '') = ''
     OR COALESCE(p_student->>'date_of_birth', '') = ''
     OR COALESCE(p_student->>'gender', '') NOT IN ('female', 'male', 'other') THEN
    RAISE EXCEPTION 'Required student details are missing';
  END IF;
  IF (p_student ? 'medical_notes' OR p_student ? 'blood_group' OR p_student ? 'allergies')
     AND NOT public.can_manage_school(p_school_id) THEN
    RAISE EXCEPTION 'Not authorised to record restricted medical information';
  END IF;
  IF p_student->>'status' = 'withdrawn' THEN
    RAISE EXCEPTION 'Use the enrolment withdrawal workflow to withdraw a student';
  END IF;
  IF jsonb_typeof(COALESCE(p_guardians, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'At least one guardian is required';
  END IF;
  IF jsonb_array_length(COALESCE(p_guardians, '[]'::jsonb)) = 0 THEN
    RAISE EXCEPTION 'At least one guardian is required';
  END IF;

  PERFORM 1 FROM public.schools WHERE id = p_school_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'School not found'; END IF;
  SELECT COALESCE(NULLIF(upper(regexp_replace(short_name, '[^A-Za-z0-9]', '', 'g')), ''), 'CED')
    INTO v_school_prefix FROM public.schools WHERE id = p_school_id;
  SELECT COALESCE(MAX(NULLIF(regexp_replace(student_id, '^[^-]+-', ''), '')::integer), 0) + 1
    INTO v_next FROM public.students WHERE school_id = p_school_id
      AND student_id ~ ('^' || v_school_prefix || '-[0-9]+$');

  INSERT INTO public.students (
    school_id, student_id, first_name, middle_name, last_name, date_of_birth,
    gender, nationality, state_of_origin, residential_address, admission_date,
    admission_type, previous_school, status, emergency_contact_name, emergency_contact_phone
  ) VALUES (
    p_school_id,
    COALESCE(NULLIF(p_student->>'student_id', ''), v_school_prefix || '-' || lpad(v_next::text, 5, '0')),
    p_student->>'first_name', NULLIF(p_student->>'middle_name', ''), p_student->>'last_name',
    (p_student->>'date_of_birth')::date, (p_student->>'gender')::public.student_gender,
    NULLIF(p_student->>'nationality', ''), NULLIF(p_student->>'state_of_origin', ''),
    NULLIF(p_student->>'residential_address', ''),
    COALESCE(NULLIF(p_student->>'admission_date', '')::date, CURRENT_DATE),
    NULLIF(p_student->>'admission_type', ''), NULLIF(p_student->>'previous_school', ''),
    COALESCE(NULLIF(p_student->>'status', '')::public.student_status, 'active'),
    NULLIF(p_student->>'emergency_contact_name', ''), NULLIF(p_student->>'emergency_contact_phone', '')
  ) RETURNING id INTO v_student_id;

  IF NULLIF(p_student->>'academic_session_id', '') IS NOT NULL
     OR NULLIF(p_student->>'class_section_id', '') IS NOT NULL THEN
    IF NULLIF(p_student->>'academic_session_id', '') IS NULL
       OR NULLIF(p_student->>'class_section_id', '') IS NULL THEN
      RAISE EXCEPTION 'Choose both an academic session and a class section';
    END IF;
    IF COALESCE(NULLIF(p_student->>'status', ''), 'active') <> 'active' THEN
      RAISE EXCEPTION 'Only active students may be initially enrolled';
    END IF;
    SELECT cs.class_id, cs.academic_session_id, cs.capacity
      INTO v_class_id, v_class_session_id, v_section_capacity
    FROM public.class_sections cs
    WHERE cs.school_id = p_school_id AND cs.id = (p_student->>'class_section_id')::uuid
      AND cs.status = 'active';
    IF NOT FOUND OR v_class_session_id <> (p_student->>'academic_session_id')::uuid THEN
      RAISE EXCEPTION 'Selected class section does not belong to the academic session';
    END IF;
    SELECT count(*) INTO v_section_count FROM public.enrollments
      WHERE school_id = p_school_id AND class_section_id = (p_student->>'class_section_id')::uuid
        AND status = 'active';
    IF v_section_capacity IS NOT NULL AND v_section_count >= v_section_capacity THEN
      RAISE EXCEPTION 'Selected class section is at capacity';
    END IF;
    INSERT INTO public.enrollments(school_id, student_id, academic_session_id, class_id, class_section_id)
    VALUES (p_school_id, v_student_id, v_class_session_id, v_class_id, (p_student->>'class_section_id')::uuid);
  END IF;

  IF p_student ? 'medical_notes' OR p_student ? 'blood_group' OR p_student ? 'allergies' THEN
    INSERT INTO public.student_medical_records(school_id, student_id, medical_notes, blood_group, allergies)
    VALUES (p_school_id, v_student_id, p_student->>'medical_notes', p_student->>'blood_group', p_student->>'allergies');
  END IF;

  FOR v_guardian IN SELECT value FROM jsonb_array_elements(COALESCE(p_guardians, '[]'::jsonb))
  LOOP
    IF COALESCE(v_guardian->>'full_name', '') = '' OR COALESCE(v_guardian->>'phone', '') = '' THEN
      RAISE EXCEPTION 'Each guardian needs a name and phone number';
    END IF;
    SELECT id INTO v_guardian_id FROM public.guardians
      WHERE school_id = p_school_id
        AND lower(full_name) = lower(v_guardian->>'full_name')
        AND phone = v_guardian->>'phone'
      LIMIT 1;
    IF v_guardian_id IS NULL THEN
      INSERT INTO public.guardians(school_id, full_name, email, phone, address)
      VALUES (p_school_id, v_guardian->>'full_name', NULLIF(v_guardian->>'email', ''),
        v_guardian->>'phone', NULLIF(v_guardian->>'address', ''))
      RETURNING id INTO v_guardian_id;
    END IF;
    INSERT INTO public.student_guardians(school_id, student_id, guardian_id, relationship, is_primary, is_emergency_contact)
    VALUES (p_school_id, v_student_id, v_guardian_id, COALESCE(NULLIF(v_guardian->>'relationship', ''), 'Guardian'),
      COALESCE((v_guardian->>'is_primary')::boolean, false),
      COALESCE((v_guardian->>'is_emergency_contact')::boolean, false));
    v_guardian_id := NULL;
  END LOOP;

  INSERT INTO public.audit_logs(school_id, actor_user_id, action, entity_type, entity_id, details)
  VALUES (p_school_id, public.current_user_id(), 'student_registered', 'students', v_student_id,
    jsonb_build_object('student_id', COALESCE(p_student->>'student_id', v_school_prefix || '-' || lpad(v_next::text, 5, '0'))));
  RETURN v_student_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_student(p_school_id uuid, p_student_id uuid, p_student jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.current_user_id() IS NULL OR NOT public.can_manage_academics(p_school_id) THEN
    RAISE EXCEPTION 'Not authorised to update students';
  END IF;
  IF (p_student ? 'medical_notes' OR p_student ? 'blood_group' OR p_student ? 'allergies')
     AND NOT public.can_manage_school(p_school_id) THEN
    RAISE EXCEPTION 'Not authorised to update restricted medical information';
  END IF;
  IF p_student->>'status' = 'withdrawn' THEN
    RAISE EXCEPTION 'Use the enrolment withdrawal workflow to withdraw a student';
  END IF;

  UPDATE public.students SET
    first_name = COALESCE(p_student->>'first_name', first_name),
    middle_name = CASE WHEN p_student ? 'middle_name' THEN NULLIF(p_student->>'middle_name', '') ELSE middle_name END,
    last_name = COALESCE(p_student->>'last_name', last_name),
    date_of_birth = COALESCE(NULLIF(p_student->>'date_of_birth', '')::date, date_of_birth),
    gender = COALESCE(NULLIF(p_student->>'gender', '')::public.student_gender, gender),
    residential_address = CASE WHEN p_student ? 'residential_address' THEN NULLIF(p_student->>'residential_address', '') ELSE residential_address END,
    nationality = CASE WHEN p_student ? 'nationality' THEN NULLIF(p_student->>'nationality', '') ELSE nationality END,
    state_of_origin = CASE WHEN p_student ? 'state_of_origin' THEN NULLIF(p_student->>'state_of_origin', '') ELSE state_of_origin END,
    admission_date = COALESCE(NULLIF(p_student->>'admission_date', '')::date, admission_date),
    admission_type = CASE WHEN p_student ? 'admission_type' THEN NULLIF(p_student->>'admission_type', '') ELSE admission_type END,
    previous_school = CASE WHEN p_student ? 'previous_school' THEN NULLIF(p_student->>'previous_school', '') ELSE previous_school END,
    status = COALESCE(NULLIF(p_student->>'status', '')::public.student_status, status),
    photo_url = CASE WHEN p_student ? 'photo_url' THEN NULLIF(p_student->>'photo_url', '') ELSE photo_url END,
    emergency_contact_name = CASE WHEN p_student ? 'emergency_contact_name' THEN NULLIF(p_student->>'emergency_contact_name', '') ELSE emergency_contact_name END,
    emergency_contact_phone = CASE WHEN p_student ? 'emergency_contact_phone' THEN NULLIF(p_student->>'emergency_contact_phone', '') ELSE emergency_contact_phone END,
    updated_at = now()
  WHERE school_id = p_school_id AND id = p_student_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Student not found'; END IF;

  IF p_student ? 'medical_notes' OR p_student ? 'blood_group' OR p_student ? 'allergies' THEN
    INSERT INTO public.student_medical_records(school_id, student_id, medical_notes, blood_group, allergies)
    VALUES (p_school_id, p_student_id, p_student->>'medical_notes', p_student->>'blood_group', p_student->>'allergies')
    ON CONFLICT (student_id) DO UPDATE SET
      medical_notes = EXCLUDED.medical_notes,
      blood_group = EXCLUDED.blood_group,
      allergies = EXCLUDED.allergies,
      updated_at = now();
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.accept_admission(p_admission_id uuid, p_class_section_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admission public.admissions%ROWTYPE;
  v_class_id uuid;
  v_student_id uuid;
  v_guardian_id uuid;
  v_prefix text;
  v_next integer;
  v_section_capacity integer;
  v_section_count integer;
BEGIN
  SELECT * INTO v_admission FROM public.admissions WHERE id = p_admission_id FOR UPDATE;
  IF NOT FOUND OR NOT public.can_manage_school(v_admission.school_id) THEN
    RAISE EXCEPTION 'Admission not found or not authorised';
  END IF;
  IF v_admission.linked_student_id IS NOT NULL THEN
    RETURN v_admission.linked_student_id;
  END IF;
  IF v_admission.status NOT IN ('pending', 'under_review') THEN
    RAISE EXCEPTION 'Only pending or under-review applications can be accepted';
  END IF;
  PERFORM 1 FROM public.schools WHERE id = v_admission.school_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'School not found'; END IF;

  SELECT cs.class_id INTO v_class_id FROM public.class_sections cs
    JOIN public.classes c ON c.school_id = cs.school_id AND c.id = cs.class_id
    WHERE cs.id = p_class_section_id AND cs.school_id = v_admission.school_id
      AND cs.academic_session_id = v_admission.academic_session_id AND cs.status = 'active'
      AND c.grade_level_id = v_admission.intended_grade_level_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Selected class section is not valid for this session'; END IF;
  SELECT capacity INTO v_section_capacity FROM public.class_sections
    WHERE id = p_class_section_id AND school_id = v_admission.school_id;
  SELECT count(*) INTO v_section_count FROM public.enrollments
    WHERE school_id = v_admission.school_id AND class_section_id = p_class_section_id AND status = 'active';
  IF v_section_capacity IS NOT NULL AND v_section_count >= v_section_capacity THEN
    RAISE EXCEPTION 'Selected class section is at capacity';
  END IF;

  SELECT COALESCE(NULLIF(upper(regexp_replace(short_name, '[^A-Za-z0-9]', '', 'g')), ''), 'CED')
    INTO v_prefix FROM public.schools WHERE id = v_admission.school_id;
  SELECT COALESCE(MAX(NULLIF(regexp_replace(student_id, '^[^-]+-', ''), '')::integer), 0) + 1
    INTO v_next FROM public.students WHERE school_id = v_admission.school_id
      AND student_id ~ ('^' || v_prefix || '-[0-9]+$');

  INSERT INTO public.students(
    school_id, student_id, first_name, middle_name, last_name, date_of_birth, gender,
    admission_date, admission_type, previous_school, residential_address
  ) VALUES (
    v_admission.school_id, v_prefix || '-' || lpad(v_next::text, 5, '0'),
    v_admission.applicant_first_name, v_admission.applicant_middle_name,
    v_admission.applicant_last_name, v_admission.date_of_birth, v_admission.gender,
    CURRENT_DATE, 'new', v_admission.previous_school, v_admission.residential_address
  ) RETURNING id INTO v_student_id;

  SELECT id INTO v_guardian_id FROM public.guardians
    WHERE school_id = v_admission.school_id AND lower(full_name) = lower(v_admission.parent_name)
      AND phone = v_admission.parent_phone LIMIT 1;
  IF v_guardian_id IS NULL THEN
    INSERT INTO public.guardians(school_id, full_name, email, phone, address)
    VALUES (v_admission.school_id, v_admission.parent_name, v_admission.parent_email,
      v_admission.parent_phone, v_admission.parent_address) RETURNING id INTO v_guardian_id;
  END IF;
  INSERT INTO public.student_guardians(school_id, student_id, guardian_id, relationship, is_primary, is_emergency_contact)
  VALUES (v_admission.school_id, v_student_id, v_guardian_id, v_admission.parent_relationship, true, true);

  INSERT INTO public.enrollments(school_id, student_id, academic_session_id, class_id, class_section_id)
  VALUES (v_admission.school_id, v_student_id, v_admission.academic_session_id, v_class_id, p_class_section_id);

  UPDATE public.admissions SET status = 'accepted', linked_student_id = v_student_id,
    reviewed_at = now(), reviewed_by = public.current_user_id(), updated_at = now()
  WHERE id = p_admission_id;
  INSERT INTO public.admission_history(school_id, admission_id, actor_user_id, action)
  VALUES (v_admission.school_id, p_admission_id, public.current_user_id(), 'accepted');
  INSERT INTO public.audit_logs(school_id, actor_user_id, action, entity_type, entity_id, details)
  VALUES (v_admission.school_id, public.current_user_id(), 'admission_accepted', 'admissions', p_admission_id,
    jsonb_build_object('student_id', v_student_id));
  RETURN v_student_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.review_admission(
  p_admission_id uuid,
  p_status public.admission_status,
  p_notes text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_school_id uuid;
  v_old_status public.admission_status;
BEGIN
  SELECT school_id, status INTO v_school_id, v_old_status
  FROM public.admissions WHERE id = p_admission_id FOR UPDATE;
  IF NOT FOUND OR NOT public.can_manage_school(v_school_id) THEN
    RAISE EXCEPTION 'Admission not found or not authorised';
  END IF;
  IF p_status NOT IN ('pending', 'under_review', 'rejected', 'withdrawn') THEN
    RAISE EXCEPTION 'Use the acceptance workflow to accept an application';
  END IF;
  IF v_old_status = 'accepted' THEN RAISE EXCEPTION 'Accepted applications cannot be changed'; END IF;

  UPDATE public.admissions SET status = p_status, reviewed_at = now(),
    reviewed_by = public.current_user_id(), requested_information = CASE
      WHEN p_status = 'under_review' THEN p_notes ELSE requested_information END,
    updated_at = now()
  WHERE id = p_admission_id;
  INSERT INTO public.admission_history(school_id, admission_id, actor_user_id, action, notes)
  VALUES (v_school_id, p_admission_id, public.current_user_id(), p_status::text, p_notes);
  INSERT INTO public.audit_logs(school_id, actor_user_id, action, entity_type, entity_id, details)
  VALUES (v_school_id, public.current_user_id(), 'admission_' || p_status::text, 'admissions', p_admission_id,
    jsonb_build_object('previous_status', v_old_status, 'notes', p_notes));
END;
$$;

CREATE OR REPLACE FUNCTION public.create_enrollment(
  p_school_id uuid,
  p_student_id uuid,
  p_class_section_id uuid,
  p_enrolment_date date DEFAULT CURRENT_DATE
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_class_id uuid;
  v_session_id uuid;
  v_section_capacity integer;
  v_section_count integer;
  v_enrollment_id uuid;
BEGIN
  IF public.current_user_id() IS NULL OR NOT public.can_manage_academics(p_school_id) THEN
    RAISE EXCEPTION 'Not authorised to enrol students';
  END IF;
  PERFORM 1 FROM public.schools WHERE id = p_school_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'School not found'; END IF;
  SELECT class_id, academic_session_id, capacity INTO v_class_id, v_session_id, v_section_capacity
  FROM public.class_sections
  WHERE id = p_class_section_id AND school_id = p_school_id AND status = 'active';
  IF NOT FOUND THEN RAISE EXCEPTION 'Class section not found or inactive'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.students WHERE school_id = p_school_id AND id = p_student_id AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'Only active students may be enrolled';
  END IF;
  SELECT count(*) INTO v_section_count FROM public.enrollments
    WHERE school_id = p_school_id AND class_section_id = p_class_section_id AND status = 'active';
  IF v_section_capacity IS NOT NULL AND v_section_count >= v_section_capacity THEN
    RAISE EXCEPTION 'Selected class section is at capacity';
  END IF;

  INSERT INTO public.enrollments(school_id, student_id, academic_session_id, class_id, class_section_id, enrolment_date)
  VALUES (p_school_id, p_student_id, v_session_id, v_class_id, p_class_section_id, p_enrolment_date)
  RETURNING id INTO v_enrollment_id;
  INSERT INTO public.audit_logs(school_id, actor_user_id, action, entity_type, entity_id, details)
  VALUES (p_school_id, public.current_user_id(), 'enrollment_created', 'students', p_student_id,
    jsonb_build_object('enrollment_id', v_enrollment_id, 'class_section_id', p_class_section_id));
  RETURN v_enrollment_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.transfer_student(
  p_school_id uuid,
  p_student_id uuid,
  p_new_class_section_id uuid,
  p_transfer_type text,
  p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_enrollment public.enrollments%ROWTYPE;
  v_new_enrollment_id uuid;
  v_class_id uuid;
  v_session_id uuid;
  v_old_campus_id uuid;
  v_new_campus_id uuid;
  v_section_capacity integer;
  v_section_count integer;
  v_old_grade_order integer;
  v_new_grade_order integer;
BEGIN
  IF public.current_user_id() IS NULL OR NOT public.can_manage_academics(p_school_id) THEN
    RAISE EXCEPTION 'Not authorised to transfer students';
  END IF;
  IF p_transfer_type NOT IN ('promotion', 'class_transfer', 'campus_transfer', 'withdrawal') THEN
    RAISE EXCEPTION 'Invalid transfer type';
  END IF;
  PERFORM 1 FROM public.schools WHERE id = p_school_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'School not found'; END IF;
  SELECT * INTO v_old_enrollment FROM public.enrollments
    WHERE school_id = p_school_id AND student_id = p_student_id AND status = 'active'
    ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'No active enrolment found'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.students WHERE school_id = p_school_id AND id = p_student_id AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'Only active students may be transferred';
  END IF;

  IF p_transfer_type = 'withdrawal' THEN
    UPDATE public.enrollments SET status = 'withdrawn', updated_at = now() WHERE id = v_old_enrollment.id;
    UPDATE public.students SET status = 'withdrawn', updated_at = now() WHERE id = p_student_id AND school_id = p_school_id;
  ELSE
    SELECT cs.class_id, cs.academic_session_id, c.campus_id, cs.capacity
      INTO v_class_id, v_session_id, v_new_campus_id, v_section_capacity
    FROM public.class_sections cs JOIN public.classes c
      ON c.school_id = cs.school_id AND c.id = cs.class_id
    WHERE cs.id = p_new_class_section_id AND cs.school_id = p_school_id AND cs.status = 'active';
    IF NOT FOUND THEN RAISE EXCEPTION 'Destination class section not found or inactive'; END IF;
    IF p_new_class_section_id = v_old_enrollment.class_section_id THEN
      RAISE EXCEPTION 'Choose a different class section';
    END IF;
    SELECT campus_id INTO v_old_campus_id FROM public.classes
      WHERE school_id = p_school_id AND id = v_old_enrollment.class_id;
    SELECT gl.sort_order INTO v_old_grade_order
    FROM public.classes c JOIN public.grade_levels gl
      ON gl.school_id = c.school_id AND gl.id = c.grade_level_id
    WHERE c.school_id = p_school_id AND c.id = v_old_enrollment.class_id;
    SELECT gl.sort_order INTO v_new_grade_order
    FROM public.classes c JOIN public.grade_levels gl
      ON gl.school_id = c.school_id AND gl.id = c.grade_level_id
    WHERE c.school_id = p_school_id AND c.id = v_class_id;
    IF p_transfer_type = 'promotion' AND v_session_id = v_old_enrollment.academic_session_id THEN
      RAISE EXCEPTION 'Promotion must target a different academic session';
    ELSIF p_transfer_type = 'promotion' AND v_new_grade_order <= v_old_grade_order THEN
      RAISE EXCEPTION 'Promotion must target a higher grade level';
    ELSIF p_transfer_type IN ('class_transfer', 'campus_transfer')
      AND v_session_id <> v_old_enrollment.academic_session_id THEN
      RAISE EXCEPTION 'Use promotion to move a student to a different academic session';
    ELSIF p_transfer_type = 'campus_transfer'
      AND (v_old_campus_id IS NULL OR v_new_campus_id IS NULL OR v_old_campus_id = v_new_campus_id) THEN
      RAISE EXCEPTION 'Campus transfer requires a different destination campus';
    END IF;
    SELECT count(*) INTO v_section_count FROM public.enrollments
      WHERE school_id = p_school_id AND class_section_id = p_new_class_section_id AND status = 'active';
    IF v_section_capacity IS NOT NULL AND v_section_count >= v_section_capacity THEN
      RAISE EXCEPTION 'Selected class section is at capacity';
    END IF;
    UPDATE public.enrollments SET status = CASE
      WHEN p_transfer_type = 'promotion' THEN 'completed'::public.enrolment_status
      ELSE 'transferred'::public.enrolment_status
    END, updated_at = now() WHERE id = v_old_enrollment.id;
    INSERT INTO public.enrollments(school_id, student_id, academic_session_id, class_id, class_section_id)
    VALUES (p_school_id, p_student_id, v_session_id, v_class_id, p_new_class_section_id)
    RETURNING id INTO v_new_enrollment_id;
  END IF;
  INSERT INTO public.student_transfers(school_id, student_id, from_enrollment_id, to_enrollment_id,
    transfer_type, notes, actor_user_id)
  VALUES (p_school_id, p_student_id, v_old_enrollment.id, v_new_enrollment_id,
    p_transfer_type, p_notes, public.current_user_id());
  INSERT INTO public.audit_logs(school_id, actor_user_id, action, entity_type, entity_id, details)
  VALUES (p_school_id, public.current_user_id(), p_transfer_type, 'students', p_student_id,
    jsonb_build_object('from_enrollment_id', v_old_enrollment.id, 'to_enrollment_id', v_new_enrollment_id, 'notes', p_notes));
  RETURN v_new_enrollment_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.promote_class_students(
  p_school_id uuid,
  p_student_ids uuid[],
  p_destination_section_id uuid,
  p_notes text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_source_class_id uuid;
  v_source_session_id uuid;
  v_student_id uuid;
  v_count integer := 0;
BEGIN
  IF public.current_user_id() IS NULL OR NOT public.can_manage_academics(p_school_id) THEN
    RAISE EXCEPTION 'Not authorised to promote students';
  END IF;
  IF p_student_ids IS NULL OR cardinality(p_student_ids) = 0 THEN
    RAISE EXCEPTION 'Select at least one student';
  END IF;
  PERFORM 1 FROM public.schools WHERE id = p_school_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'School not found'; END IF;

  SELECT e.class_id, e.academic_session_id INTO v_source_class_id, v_source_session_id
  FROM public.enrollments e
  WHERE e.school_id = p_school_id AND e.student_id = p_student_ids[1] AND e.status = 'active'
  LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'Selected students must have active enrolments'; END IF;

  SELECT count(*) INTO v_count FROM public.enrollments e
  WHERE e.school_id = p_school_id AND e.student_id = ANY(p_student_ids)
    AND e.class_id = v_source_class_id
    AND e.academic_session_id = v_source_session_id
    AND e.status = 'active';
  IF v_count <> cardinality(p_student_ids) THEN
    RAISE EXCEPTION 'All selected students must be actively enrolled in the same class and session';
  END IF;

  FOREACH v_student_id IN ARRAY p_student_ids LOOP
    PERFORM public.transfer_student(p_school_id, v_student_id, p_destination_section_id, 'promotion', p_notes);
  END LOOP;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.audit_school_operation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_school_id uuid;
  v_entity_id uuid;
  v_details jsonb := '{}'::jsonb;
BEGIN
  v_school_id := COALESCE(NEW.school_id, OLD.school_id);
  v_entity_id := COALESCE(NEW.id, OLD.id);
  IF TG_TABLE_NAME = 'student_guardians' THEN
    v_entity_id := COALESCE(NEW.student_id, OLD.student_id);
    v_details := jsonb_build_object('guardian_id', COALESCE(NEW.guardian_id, OLD.guardian_id));
  END IF;
  INSERT INTO public.audit_logs(school_id, actor_user_id, action, entity_type, entity_id, details)
  VALUES (v_school_id, public.current_user_id(), TG_TABLE_NAME || '_' || lower(TG_OP), TG_TABLE_NAME, v_entity_id, v_details);
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER audit_students AFTER INSERT OR UPDATE ON public.students
  FOR EACH ROW EXECUTE FUNCTION public.audit_school_operation();
CREATE TRIGGER audit_student_guardians AFTER INSERT OR UPDATE OR DELETE ON public.student_guardians
  FOR EACH ROW EXECUTE FUNCTION public.audit_school_operation();
CREATE TRIGGER audit_staff_profiles AFTER INSERT OR UPDATE ON public.staff_profiles
  FOR EACH ROW EXECUTE FUNCTION public.audit_school_operation();
CREATE TRIGGER audit_enrollments AFTER INSERT OR UPDATE ON public.enrollments
  FOR EACH ROW EXECUTE FUNCTION public.audit_school_operation();
CREATE TRIGGER audit_admissions AFTER INSERT OR UPDATE ON public.admissions
  FOR EACH ROW EXECUTE FUNCTION public.audit_school_operation();

CREATE OR REPLACE FUNCTION public.record_admission_submission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.admission_history(school_id, admission_id, actor_user_id, action)
  VALUES (NEW.school_id, NEW.id, public.current_user_id(), 'submitted');
  RETURN NEW;
END;
$$;
CREATE TRIGGER admission_submission_history AFTER INSERT ON public.admissions
  FOR EACH ROW EXECUTE FUNCTION public.record_admission_submission();

CREATE TRIGGER academic_sessions_updated_at BEFORE UPDATE ON public.academic_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER departments_updated_at BEFORE UPDATE ON public.departments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER classes_updated_at BEFORE UPDATE ON public.classes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER class_sections_updated_at BEFORE UPDATE ON public.class_sections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER subjects_updated_at BEFORE UPDATE ON public.subjects
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER guardians_updated_at BEFORE UPDATE ON public.guardians
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER students_updated_at BEFORE UPDATE ON public.students
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER staff_profiles_updated_at BEFORE UPDATE ON public.staff_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

REVOKE EXECUTE ON FUNCTION public.register_student(uuid, jsonb, jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.update_student(uuid, uuid, jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.accept_admission(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.review_admission(uuid, public.admission_status, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.create_enrollment(uuid, uuid, uuid, date) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.transfer_student(uuid, uuid, uuid, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.promote_class_students(uuid, uuid[], uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.audit_school_operation() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_student(uuid, jsonb, jsonb),
  public.update_student(uuid, uuid, jsonb),
  public.accept_admission(uuid, uuid),
  public.review_admission(uuid, public.admission_status, text),
  public.create_enrollment(uuid, uuid, uuid, date),
  public.transfer_student(uuid, uuid, uuid, text, text),
  public.promote_class_students(uuid, uuid[], uuid, text) TO authenticated;

-- LOCAL PORT NOTE: Supabase Storage section removed. The school-documents
-- bucket and its four storage.objects policies do not exist in plain Postgres.
-- Document storage will be re-implemented in a later step as local-disk or
-- S3-backed storage behind Fastify endpoints, keeping the same rule (only
-- authorized school staff may read/write paths prefixed with the school UUID).
