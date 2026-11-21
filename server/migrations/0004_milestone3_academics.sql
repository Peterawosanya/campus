-- Milestone 3 academic operations. Existing students, sessions, enrolments,
-- classes, sections, assignments, memberships, and audit logs remain canonical.

CREATE TYPE public.attendance_status AS ENUM ('present', 'absent', 'late', 'excused');
CREATE TYPE public.academic_workflow_status AS ENUM ('draft', 'submitted', 'reviewed', 'approved', 'published');

CREATE TABLE public.academic_terms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  academic_session_id uuid NOT NULL,
  name text NOT NULL,
  starts_on date NOT NULL,
  ends_on date NOT NULL,
  is_current boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, id),
  UNIQUE (school_id, academic_session_id, id),
  UNIQUE (school_id, academic_session_id, name),
  FOREIGN KEY (school_id, academic_session_id) REFERENCES public.academic_sessions(school_id, id),
  CHECK (ends_on >= starts_on)
);
CREATE UNIQUE INDEX academic_terms_one_current_per_session
  ON public.academic_terms(school_id, academic_session_id) WHERE is_current;
CREATE OR REPLACE FUNCTION public.validate_academic_term()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_session public.academic_sessions%ROWTYPE;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(NEW.school_id::text));
  SELECT * INTO v_session FROM public.academic_sessions
  WHERE school_id = NEW.school_id AND id = NEW.academic_session_id;
  IF NOT FOUND OR NEW.starts_on < v_session.starts_on OR NEW.ends_on > v_session.ends_on THEN
    RAISE EXCEPTION 'Term dates must fall within the selected academic session';
  END IF;
  IF EXISTS (SELECT 1 FROM public.academic_terms t
    WHERE t.school_id = NEW.school_id AND t.academic_session_id = NEW.academic_session_id
      AND t.id <> COALESCE(NEW.id, gen_random_uuid())
      AND NEW.starts_on <= t.ends_on AND NEW.ends_on >= t.starts_on) THEN
    RAISE EXCEPTION 'Academic terms in the same session cannot overlap';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER academic_terms_validate BEFORE INSERT OR UPDATE ON public.academic_terms
  FOR EACH ROW EXECUTE FUNCTION public.validate_academic_term();

CREATE TABLE public.school_days (
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  day_of_week smallint NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  is_school_day boolean NOT NULL DEFAULT true,
  PRIMARY KEY (school_id, day_of_week)
);
INSERT INTO public.school_days(school_id, day_of_week, is_school_day)
SELECT s.id, d.day_of_week, d.day_of_week BETWEEN 1 AND 5
FROM public.schools s CROSS JOIN generate_series(0, 6) AS d(day_of_week);

CREATE TABLE public.school_holidays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  name text NOT NULL,
  starts_on date NOT NULL,
  ends_on date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, id),
  CHECK (ends_on >= starts_on)
);

CREATE TABLE public.attendance_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id uuid NOT NULL,
  enrollment_id uuid NOT NULL,
  term_id uuid,
  attendance_date date NOT NULL,
  status public.attendance_status NOT NULL,
  remarks text,
  marked_by uuid REFERENCES public.users(id),
  modified_by uuid REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, id),
  UNIQUE (school_id, student_id, attendance_date),
  FOREIGN KEY (school_id, student_id) REFERENCES public.students(school_id, id),
  FOREIGN KEY (school_id, enrollment_id) REFERENCES public.enrollments(school_id, id),
  FOREIGN KEY (school_id, term_id) REFERENCES public.academic_terms(school_id, id)
);
CREATE INDEX attendance_school_date_idx ON public.attendance_records(school_id, attendance_date, status);
CREATE INDEX attendance_student_date_idx ON public.attendance_records(school_id, student_id, attendance_date DESC);

CREATE TABLE public.staff_attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  staff_profile_id uuid NOT NULL,
  attendance_date date NOT NULL,
  status public.attendance_status NOT NULL,
  remarks text,
  marked_by uuid REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, staff_profile_id, attendance_date),
  FOREIGN KEY (school_id, staff_profile_id) REFERENCES public.staff_profiles(school_id, id)
);

CREATE TABLE public.academic_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  recipient_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  student_id uuid NOT NULL,
  attendance_record_id uuid NOT NULL,
  notification_type text NOT NULL CHECK (notification_type IN ('absence', 'late')),
  message text NOT NULL,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, attendance_record_id, recipient_user_id),
  FOREIGN KEY (school_id, student_id) REFERENCES public.students(school_id, id) ON DELETE CASCADE,
  FOREIGN KEY (school_id, attendance_record_id) REFERENCES public.attendance_records(school_id, id) ON DELETE CASCADE
);

CREATE TABLE public.assessment_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, id),
  UNIQUE (school_id, name)
);

CREATE TABLE public.assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  academic_session_id uuid NOT NULL,
  term_id uuid NOT NULL,
  class_section_id uuid NOT NULL,
  subject_id uuid NOT NULL,
  assessment_type_id uuid NOT NULL,
  name text NOT NULL,
  max_score numeric(7,2) NOT NULL CHECK (max_score > 0),
  weighting numeric(5,2) NOT NULL CHECK (weighting > 0 AND weighting <= 100),
  starts_on date,
  ends_on date,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  created_by uuid REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, id),
  UNIQUE (school_id, class_section_id, subject_id, term_id, name),
  FOREIGN KEY (school_id, academic_session_id) REFERENCES public.academic_sessions(school_id, id),
  FOREIGN KEY (school_id, academic_session_id, term_id) REFERENCES public.academic_terms(school_id, academic_session_id, id),
  FOREIGN KEY (school_id, class_section_id) REFERENCES public.class_sections(school_id, id),
  FOREIGN KEY (school_id, subject_id) REFERENCES public.subjects(school_id, id),
  FOREIGN KEY (school_id, assessment_type_id) REFERENCES public.assessment_types(school_id, id),
  CHECK (ends_on IS NULL OR starts_on IS NULL OR ends_on >= starts_on)
);
CREATE INDEX assessments_term_section_idx ON public.assessments(school_id, term_id, class_section_id, subject_id);

CREATE TABLE public.assessment_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  assessment_id uuid NOT NULL,
  student_id uuid NOT NULL,
  score numeric(7,2) CHECK (score IS NULL OR score >= 0),
  status public.academic_workflow_status NOT NULL DEFAULT 'draft',
  entered_by uuid REFERENCES public.users(id),
  updated_by uuid REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, assessment_id, student_id),
  FOREIGN KEY (school_id, assessment_id) REFERENCES public.assessments(school_id, id) ON DELETE CASCADE,
  FOREIGN KEY (school_id, student_id) REFERENCES public.students(school_id, id)
);

CREATE TABLE public.grading_schemes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  name text NOT NULL,
  pass_mark numeric(5,2) NOT NULL DEFAULT 50 CHECK (pass_mark BETWEEN 0 AND 100),
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, id),
  UNIQUE (school_id, name)
);
CREATE UNIQUE INDEX grading_schemes_one_default ON public.grading_schemes(school_id) WHERE is_default;

CREATE TABLE public.grading_bands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  grading_scheme_id uuid NOT NULL,
  grade text NOT NULL,
  minimum_score numeric(5,2) NOT NULL CHECK (minimum_score BETWEEN 0 AND 100),
  maximum_score numeric(5,2) NOT NULL CHECK (maximum_score BETWEEN 0 AND 100),
  remark text,
  FOREIGN KEY (school_id, grading_scheme_id) REFERENCES public.grading_schemes(school_id, id) ON DELETE CASCADE,
  UNIQUE (school_id, grading_scheme_id, grade),
  CHECK (maximum_score >= minimum_score)
);
CREATE OR REPLACE FUNCTION public.validate_grading_band()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM 1 FROM public.grading_schemes
  WHERE school_id = NEW.school_id AND id = NEW.grading_scheme_id FOR UPDATE;
  IF EXISTS (
    SELECT 1 FROM public.grading_bands b
    WHERE b.school_id = NEW.school_id AND b.grading_scheme_id = NEW.grading_scheme_id
      AND b.id <> COALESCE(NEW.id, gen_random_uuid())
      AND NEW.minimum_score <= b.maximum_score AND NEW.maximum_score >= b.minimum_score
  ) THEN RAISE EXCEPTION 'Grade bands in a scheme cannot overlap'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER grading_bands_validate BEFORE INSERT OR UPDATE ON public.grading_bands
  FOR EACH ROW EXECUTE FUNCTION public.validate_grading_band();

CREATE OR REPLACE FUNCTION public.validate_timetable_period()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(NEW.school_id::text));
  IF NEW.ends_at <= NEW.starts_at THEN RAISE EXCEPTION 'A timetable period must end after it starts'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.timetable_periods p
    WHERE p.school_id = NEW.school_id AND p.id <> COALESCE(NEW.id, gen_random_uuid())
      AND NEW.starts_at < p.ends_at AND NEW.ends_at > p.starts_at
  ) THEN RAISE EXCEPTION 'Timetable periods cannot overlap'; END IF;
  RETURN NEW;
END;
$$;

CREATE TABLE public.term_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id uuid NOT NULL,
  academic_session_id uuid NOT NULL,
  term_id uuid NOT NULL,
  class_section_id uuid NOT NULL,
  subject_id uuid NOT NULL,
  grading_scheme_id uuid NOT NULL,
  weighted_score numeric(7,2) NOT NULL CHECK (weighted_score BETWEEN 0 AND 100),
  grade text NOT NULL,
  status public.academic_workflow_status NOT NULL DEFAULT 'draft',
  published_at timestamptz,
  created_by uuid REFERENCES public.users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, student_id, term_id, subject_id),
  UNIQUE (school_id, id),
  FOREIGN KEY (school_id, student_id) REFERENCES public.students(school_id, id),
  FOREIGN KEY (school_id, academic_session_id, term_id) REFERENCES public.academic_terms(school_id, academic_session_id, id),
  FOREIGN KEY (school_id, class_section_id) REFERENCES public.class_sections(school_id, id),
  FOREIGN KEY (school_id, subject_id) REFERENCES public.subjects(school_id, id),
  FOREIGN KEY (school_id, grading_scheme_id) REFERENCES public.grading_schemes(school_id, id)
);
CREATE INDEX term_results_section_idx ON public.term_results(school_id, term_id, class_section_id, status);

CREATE TABLE public.result_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  result_id uuid NOT NULL,
  actor_user_id uuid REFERENCES public.users(id),
  action text NOT NULL,
  reason text,
  snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (school_id, result_id) REFERENCES public.term_results(school_id, id) ON DELETE CASCADE
);

CREATE TABLE public.report_card_components (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  result_id uuid NOT NULL,
  assessment_id uuid NOT NULL,
  score numeric(7,2) NOT NULL,
  max_score numeric(7,2) NOT NULL,
  weighting numeric(5,2) NOT NULL,
  weighted_points numeric(7,2) NOT NULL,
  FOREIGN KEY (school_id, result_id) REFERENCES public.term_results(school_id, id) ON DELETE CASCADE,
  FOREIGN KEY (school_id, assessment_id) REFERENCES public.assessments(school_id, id),
  UNIQUE (school_id, result_id, assessment_id)
);

CREATE TABLE public.report_card_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id uuid NOT NULL,
  term_id uuid NOT NULL,
  comment_type text NOT NULL CHECK (comment_type IN ('subject_teacher', 'class_teacher', 'head_teacher')),
  comment text NOT NULL,
  author_user_id uuid REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, student_id, term_id, comment_type),
  FOREIGN KEY (school_id, student_id) REFERENCES public.students(school_id, id),
  FOREIGN KEY (school_id, term_id) REFERENCES public.academic_terms(school_id, id)
);

CREATE TABLE public.school_classrooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  campus_id uuid,
  name text NOT NULL,
  capacity integer CHECK (capacity IS NULL OR capacity > 0),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, id),
  UNIQUE (school_id, name),
  FOREIGN KEY (school_id, campus_id) REFERENCES public.campuses(school_id, id)
);

CREATE TABLE public.timetable_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  name text NOT NULL,
  starts_at time NOT NULL,
  ends_at time NOT NULL,
  is_break boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, id),
  UNIQUE (school_id, name),
  CHECK (ends_at > starts_at)
);
CREATE TRIGGER timetable_periods_validate BEFORE INSERT OR UPDATE ON public.timetable_periods
  FOR EACH ROW EXECUTE FUNCTION public.validate_timetable_period();

CREATE TABLE public.timetable_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  academic_session_id uuid NOT NULL,
  term_id uuid NOT NULL,
  class_section_id uuid NOT NULL,
  subject_id uuid NOT NULL,
  teacher_profile_id uuid NOT NULL,
  classroom_id uuid,
  day_of_week smallint NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  starts_at time NOT NULL,
  ends_at time NOT NULL,
  created_by uuid REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, id),
  FOREIGN KEY (school_id, academic_session_id, term_id) REFERENCES public.academic_terms(school_id, academic_session_id, id),
  FOREIGN KEY (school_id, class_section_id) REFERENCES public.class_sections(school_id, id),
  FOREIGN KEY (school_id, subject_id) REFERENCES public.subjects(school_id, id),
  FOREIGN KEY (school_id, teacher_profile_id) REFERENCES public.staff_profiles(school_id, id),
  FOREIGN KEY (school_id, classroom_id) REFERENCES public.school_classrooms(school_id, id),
  CHECK (ends_at > starts_at)
);
CREATE INDEX timetable_section_day_idx ON public.timetable_entries(school_id, class_section_id, day_of_week, starts_at);
CREATE INDEX timetable_teacher_day_idx ON public.timetable_entries(school_id, teacher_profile_id, day_of_week, starts_at);

ALTER TABLE public.students
  ADD COLUMN user_id uuid REFERENCES public.users(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX students_one_user_per_school ON public.students(school_id, user_id) WHERE user_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.can_view_academic_student(p_school_id uuid, p_student_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.can_view_student(p_school_id, p_student_id)
    OR EXISTS (
      SELECT 1 FROM public.students s
      JOIN public.school_memberships sm ON sm.school_id = s.school_id AND sm.user_id = s.user_id
      WHERE s.school_id = p_school_id AND s.id = p_student_id AND s.user_id = auth.uid()
        AND sm.role = 'student' AND sm.is_active
    );
$$;
REVOKE EXECUTE ON FUNCTION public.can_view_academic_student(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_view_academic_student(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.seed_academic_school_defaults()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.school_days(school_id, day_of_week, is_school_day)
  SELECT NEW.id, d.day_of_week, d.day_of_week BETWEEN 1 AND 5 FROM generate_series(0, 6) AS d(day_of_week)
  ON CONFLICT (school_id, day_of_week) DO NOTHING;
  RETURN NEW;
END;
$$;
CREATE TRIGGER schools_seed_academic_defaults AFTER INSERT ON public.schools
  FOR EACH ROW EXECUTE FUNCTION public.seed_academic_school_defaults();

CREATE OR REPLACE FUNCTION public.validate_student_academic_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.user_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.school_memberships sm
    WHERE sm.school_id = NEW.school_id AND sm.user_id = NEW.user_id
      AND sm.role = 'student' AND sm.is_active
  ) THEN
    RAISE EXCEPTION 'Linked student account must be an active student member of this school';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER students_validate_academic_user BEFORE INSERT OR UPDATE OF school_id, user_id
  ON public.students FOR EACH ROW EXECUTE FUNCTION public.validate_student_academic_user();

CREATE OR REPLACE FUNCTION public.validate_assessment_configuration()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_class_id uuid; v_term public.academic_terms%ROWTYPE;
BEGIN
  SELECT class_id INTO v_class_id FROM public.class_sections
  WHERE school_id = NEW.school_id AND id = NEW.class_section_id AND academic_session_id = NEW.academic_session_id;
  IF NOT FOUND OR NOT EXISTS (
    SELECT 1 FROM public.class_subjects cs
    WHERE cs.school_id = NEW.school_id AND cs.class_id = v_class_id AND cs.subject_id = NEW.subject_id
  ) THEN
    RAISE EXCEPTION 'Subject must be assigned to the selected class and session';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.academic_terms t
    WHERE t.school_id = NEW.school_id AND t.id = NEW.term_id
      AND t.academic_session_id = NEW.academic_session_id
  ) THEN RAISE EXCEPTION 'Term does not belong to the selected academic session'; END IF;
  SELECT * INTO v_term FROM public.academic_terms WHERE school_id = NEW.school_id AND id = NEW.term_id;
  IF NEW.starts_on IS NOT NULL AND NEW.starts_on < v_term.starts_on
     OR NEW.ends_on IS NOT NULL AND NEW.ends_on > v_term.ends_on THEN
    RAISE EXCEPTION 'Assessment dates must fall within the selected term';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER assessments_validate BEFORE INSERT OR UPDATE ON public.assessments
  FOR EACH ROW EXECUTE FUNCTION public.validate_assessment_configuration();

CREATE OR REPLACE FUNCTION public.guard_published_result()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.status = 'published' AND NEW IS DISTINCT FROM OLD THEN
    IF NOT public.can_manage_school(OLD.school_id)
       OR COALESCE(current_setting('app.result_correction_reason', true), '') = '' THEN
      RAISE EXCEPTION 'Published results require administrator authorization and a correction reason';
    END IF;
    INSERT INTO public.result_history(school_id, result_id, actor_user_id, action, reason, snapshot)
    VALUES (OLD.school_id, OLD.id, auth.uid(), 'published_result_updated',
      current_setting('app.result_correction_reason', true), to_jsonb(OLD));
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER term_results_guard_published BEFORE UPDATE ON public.term_results
  FOR EACH ROW EXECUTE FUNCTION public.guard_published_result();

CREATE OR REPLACE FUNCTION public.validate_timetable_entry()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_class_id uuid; v_class_campus uuid; v_room_campus uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(NEW.school_id::text));
  SELECT cs.class_id, c.campus_id INTO v_class_id, v_class_campus
  FROM public.class_sections cs JOIN public.classes c
    ON c.school_id = cs.school_id AND c.id = cs.class_id
  WHERE cs.school_id = NEW.school_id AND cs.id = NEW.class_section_id
    AND cs.academic_session_id = NEW.academic_session_id AND cs.status = 'active';
  IF NOT FOUND THEN RAISE EXCEPTION 'Class section is not active in the selected session'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.class_subjects cs
    WHERE cs.school_id = NEW.school_id AND cs.class_id = v_class_id AND cs.subject_id = NEW.subject_id
  ) THEN RAISE EXCEPTION 'Subject is not assigned to this class'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.teacher_assignments ta
    WHERE ta.school_id = NEW.school_id AND ta.class_section_id = NEW.class_section_id
      AND ta.staff_profile_id = NEW.teacher_profile_id
      AND (ta.subject_id = NEW.subject_id OR ta.subject_id IS NULL)
  ) THEN RAISE EXCEPTION 'Teacher is not assigned to this class and subject'; END IF;
  IF NEW.classroom_id IS NOT NULL THEN
    SELECT campus_id INTO v_room_campus FROM public.school_classrooms
    WHERE school_id = NEW.school_id AND id = NEW.classroom_id AND is_active;
    IF NOT FOUND OR (v_class_campus IS NOT NULL AND v_room_campus IS NOT NULL AND v_room_campus <> v_class_campus) THEN
      RAISE EXCEPTION 'Classroom must be active and belong to the class campus';
    END IF;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.school_days sd
    WHERE sd.school_id = NEW.school_id AND sd.day_of_week = NEW.day_of_week AND sd.is_school_day
  ) THEN RAISE EXCEPTION 'Timetable day is not an instructional day'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.timetable_entries e
    WHERE e.school_id = NEW.school_id AND e.id <> COALESCE(NEW.id, gen_random_uuid())
      AND e.academic_session_id = NEW.academic_session_id AND e.term_id = NEW.term_id
      AND e.day_of_week = NEW.day_of_week
      AND NEW.starts_at < e.ends_at AND NEW.ends_at > e.starts_at
      AND (e.class_section_id = NEW.class_section_id
        OR e.teacher_profile_id = NEW.teacher_profile_id
        OR (NEW.classroom_id IS NOT NULL AND e.classroom_id = NEW.classroom_id))
  ) THEN RAISE EXCEPTION 'Schedule conflict: class, teacher, or classroom is already booked'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER timetable_entries_validate BEFORE INSERT OR UPDATE ON public.timetable_entries
  FOR EACH ROW EXECUTE FUNCTION public.validate_timetable_entry();

CREATE OR REPLACE FUNCTION public.audit_m3_academic_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_school_id uuid; v_id uuid; v_action text;
BEGIN
  v_school_id := COALESCE(NEW.school_id, OLD.school_id);
  v_id := COALESCE(NEW.id, OLD.id);
  v_action := TG_TABLE_NAME || '_' || lower(TG_OP);
  INSERT INTO public.audit_logs(school_id, actor_user_id, action, entity_type, entity_id, details)
  VALUES (v_school_id, auth.uid(), v_action, TG_TABLE_NAME, v_id, '{}'::jsonb);
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.can_manage_assessment(p_school_id uuid, p_section_id uuid, p_subject_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.can_manage_academics(p_school_id) OR EXISTS (
    SELECT 1 FROM public.school_memberships sm
    JOIN public.staff_profiles sp ON sp.school_id = sm.school_id AND sp.user_id = sm.user_id
    JOIN public.teacher_assignments ta ON ta.school_id = sp.school_id AND ta.staff_profile_id = sp.id
    WHERE sm.school_id = p_school_id AND sm.user_id = auth.uid() AND sm.role = 'teacher' AND sm.is_active
      AND sp.status = 'active' AND ta.class_section_id = p_section_id
      AND (ta.subject_id = p_subject_id OR ta.subject_id IS NULL)
  );
$$;
REVOKE EXECUTE ON FUNCTION public.can_manage_assessment(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_assessment(uuid, uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.save_attendance(
  p_school_id uuid, p_class_section_id uuid, p_term_id uuid, p_date date, p_records jsonb
)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_record jsonb; v_enrollment public.enrollments%ROWTYPE; v_count integer := 0;
  v_is_manager boolean := public.can_manage_academics(p_school_id);
BEGIN
  IF auth.uid() IS NULL OR NOT v_is_manager AND NOT EXISTS (
    SELECT 1 FROM public.teacher_assignments ta JOIN public.staff_profiles sp
      ON sp.school_id = ta.school_id AND sp.id = ta.staff_profile_id
    JOIN public.school_memberships sm ON sm.school_id = sp.school_id AND sm.user_id = sp.user_id
    WHERE ta.school_id = p_school_id AND ta.class_section_id = p_class_section_id
      AND sp.user_id = auth.uid() AND sp.status = 'active' AND sm.role = 'teacher' AND sm.is_active
  ) AND NOT EXISTS (
    SELECT 1 FROM public.class_sections cs JOIN public.staff_profiles sp
      ON sp.school_id = cs.school_id AND sp.id = cs.class_teacher_id
    JOIN public.school_memberships sm ON sm.school_id = sp.school_id AND sm.user_id = sp.user_id
    WHERE cs.school_id = p_school_id AND cs.id = p_class_section_id
      AND sp.user_id = auth.uid() AND sp.status = 'active' AND sm.role = 'teacher' AND sm.is_active
  ) THEN RAISE EXCEPTION 'Not authorized for this class attendance register'; END IF;
  IF p_date > CURRENT_DATE OR (p_date < CURRENT_DATE AND NOT v_is_manager) THEN
    RAISE EXCEPTION 'Only administrators may enter backdated attendance';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.class_sections cs
    JOIN public.academic_terms t ON t.school_id = cs.school_id
      AND t.academic_session_id = cs.academic_session_id
    WHERE cs.school_id = p_school_id AND cs.id = p_class_section_id AND cs.status = 'active'
      AND p_date BETWEEN t.starts_on AND t.ends_on
      AND (p_term_id IS NULL OR t.id = p_term_id)) THEN
    RAISE EXCEPTION 'Attendance date must fall within a term for the selected class session';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.school_days WHERE school_id = p_school_id
    AND day_of_week = extract(dow FROM p_date)::smallint AND is_school_day)
    OR EXISTS (SELECT 1 FROM public.school_holidays WHERE school_id = p_school_id
      AND p_date BETWEEN starts_on AND ends_on) THEN
    RAISE EXCEPTION 'Attendance cannot be recorded on a weekend or configured school holiday';
  END IF;
  IF p_records IS NULL OR jsonb_typeof(p_records) <> 'array' OR jsonb_array_length(p_records) = 0 THEN
    RAISE EXCEPTION 'Attendance register must contain at least one student';
  END IF;
  FOR v_record IN SELECT value FROM jsonb_array_elements(p_records) LOOP
    SELECT e.* INTO v_enrollment FROM public.enrollments e
    WHERE e.school_id = p_school_id AND e.student_id = (v_record->>'student_id')::uuid
      AND e.class_section_id = p_class_section_id AND e.status = 'active'
      AND p_date >= e.enrolment_date
    ORDER BY e.created_at DESC LIMIT 1;
    IF NOT FOUND THEN RAISE EXCEPTION 'Student is not actively enrolled in this class on the selected date'; END IF;
    IF COALESCE(v_record->>'status', '') NOT IN ('present', 'absent', 'late', 'excused') THEN
      RAISE EXCEPTION 'Invalid attendance status';
    END IF;
    INSERT INTO public.attendance_records(
      school_id, student_id, enrollment_id, term_id, attendance_date, status, remarks, marked_by, modified_by
    ) VALUES (
      p_school_id, v_enrollment.student_id, v_enrollment.id,
      (SELECT t.id FROM public.academic_terms t WHERE t.school_id = p_school_id
        AND t.academic_session_id = v_enrollment.academic_session_id AND p_date BETWEEN t.starts_on AND t.ends_on
        AND (p_term_id IS NULL OR t.id = p_term_id) LIMIT 1),
      p_date, (v_record->>'status')::public.attendance_status, NULLIF(v_record->>'remarks', ''), auth.uid(), auth.uid()
    )
    ON CONFLICT (school_id, student_id, attendance_date) DO UPDATE SET
      enrollment_id = EXCLUDED.enrollment_id, term_id = EXCLUDED.term_id, status = EXCLUDED.status,
      remarks = EXCLUDED.remarks, modified_by = auth.uid(), updated_at = now();
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.save_staff_attendance(
  p_school_id uuid, p_date date, p_records jsonb
)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_record jsonb; v_count integer := 0;
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_manage_school(p_school_id) THEN
    RAISE EXCEPTION 'Not authorized to manage staff attendance';
  END IF;
  IF p_date > CURRENT_DATE OR p_records IS NULL OR jsonb_typeof(p_records) <> 'array' THEN
    RAISE EXCEPTION 'Provide a valid staff attendance register';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.school_days WHERE school_id = p_school_id
    AND day_of_week = extract(dow FROM p_date)::smallint AND is_school_day)
    OR EXISTS (SELECT 1 FROM public.school_holidays WHERE school_id = p_school_id
      AND p_date BETWEEN starts_on AND ends_on) THEN
    RAISE EXCEPTION 'Staff attendance cannot be recorded on a weekend or configured school holiday';
  END IF;
  FOR v_record IN SELECT value FROM jsonb_array_elements(p_records) LOOP
    IF COALESCE(v_record->>'status', '') NOT IN ('present', 'absent', 'late', 'excused') THEN
      RAISE EXCEPTION 'Invalid staff attendance status';
    END IF;
    INSERT INTO public.staff_attendance(school_id, staff_profile_id, attendance_date, status, remarks, marked_by)
    VALUES (p_school_id, (v_record->>'staff_profile_id')::uuid, p_date,
      (v_record->>'status')::public.attendance_status, NULLIF(v_record->>'remarks', ''), auth.uid())
    ON CONFLICT (school_id, staff_profile_id, attendance_date) DO UPDATE SET
      status = EXCLUDED.status, remarks = EXCLUDED.remarks, marked_by = auth.uid(), updated_at = now();
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.save_assessment_scores(p_assessment_id uuid, p_scores jsonb, p_submit boolean DEFAULT false)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_assessment public.assessments%ROWTYPE; v_item jsonb; v_count integer := 0;
BEGIN
  SELECT * INTO v_assessment FROM public.assessments WHERE id = p_assessment_id;
  IF NOT FOUND OR NOT public.can_manage_assessment(v_assessment.school_id, v_assessment.class_section_id, v_assessment.subject_id) THEN
    RAISE EXCEPTION 'Assessment not found or not authorized';
  END IF;
  IF v_assessment.status <> 'open' OR p_scores IS NULL OR jsonb_typeof(p_scores) <> 'array' THEN
    RAISE EXCEPTION 'Assessment is closed or score data is invalid';
  END IF;
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_scores) LOOP
    IF NOT EXISTS (SELECT 1 FROM public.enrollments e
      WHERE e.school_id = v_assessment.school_id AND e.student_id = (v_item->>'student_id')::uuid
        AND e.class_section_id = v_assessment.class_section_id AND e.status = 'active'
        AND e.academic_session_id = v_assessment.academic_session_id) THEN
      RAISE EXCEPTION 'Score student is not actively enrolled in this assessment class';
    END IF;
    IF NULLIF(v_item->>'score', '') IS NOT NULL
      AND ((v_item->>'score')::numeric < 0 OR (v_item->>'score')::numeric > v_assessment.max_score) THEN
      RAISE EXCEPTION 'Score must be between zero and the configured maximum';
    END IF;
    INSERT INTO public.assessment_scores(school_id, assessment_id, student_id, score, status, entered_by, updated_by)
    VALUES (v_assessment.school_id, p_assessment_id, (v_item->>'student_id')::uuid,
      NULLIF(v_item->>'score', '')::numeric, 'draft', auth.uid(), auth.uid())
    ON CONFLICT (school_id, assessment_id, student_id) DO UPDATE SET
      score = EXCLUDED.score, updated_by = auth.uid(), updated_at = now()
    WHERE assessment_scores.status = 'draft' OR public.can_manage_academics(v_assessment.school_id);
    IF NOT FOUND THEN RAISE EXCEPTION 'Submitted or approved scores cannot be edited without administrator authorization'; END IF;
    v_count := v_count + 1;
  END LOOP;
  IF p_submit THEN
    IF EXISTS (SELECT 1 FROM public.enrollments e
      LEFT JOIN public.assessment_scores s ON s.school_id = e.school_id AND s.assessment_id = p_assessment_id
        AND s.student_id = e.student_id
      WHERE e.school_id = v_assessment.school_id AND e.class_section_id = v_assessment.class_section_id
        AND e.academic_session_id = v_assessment.academic_session_id AND e.status = 'active'
        AND (s.id IS NULL OR s.score IS NULL)) THEN
      RAISE EXCEPTION 'Every enrolled student needs a score before submission; missing scores are not zero';
    END IF;
    UPDATE public.assessment_scores SET status = 'submitted', updated_by = auth.uid(), updated_at = now()
    WHERE school_id = v_assessment.school_id AND assessment_id = p_assessment_id AND status = 'draft';
  END IF;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.review_assessment_scores(p_assessment_id uuid, p_approve boolean)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_school_id uuid; v_count integer;
BEGIN
  SELECT school_id INTO v_school_id FROM public.assessments WHERE id = p_assessment_id;
  IF NOT FOUND OR auth.uid() IS NULL OR NOT public.can_manage_academics(v_school_id) THEN
    RAISE EXCEPTION 'Assessment not found or not authorized';
  END IF;
  UPDATE public.assessment_scores SET status = CASE WHEN p_approve THEN 'approved'::public.academic_workflow_status
    ELSE 'reviewed'::public.academic_workflow_status END, updated_by = auth.uid(), updated_at = now()
  WHERE school_id = v_school_id AND assessment_id = p_assessment_id
    AND status = CASE WHEN p_approve THEN 'reviewed'::public.academic_workflow_status
      ELSE 'submitted'::public.academic_workflow_status END;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count = 0 THEN RAISE EXCEPTION 'No submitted scores are awaiting review'; END IF;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.compute_term_results(
  p_school_id uuid, p_term_id uuid, p_class_section_id uuid, p_grading_scheme_id uuid
)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_subject uuid; v_student uuid; v_session uuid; v_total numeric; v_grade text; v_count integer := 0;
  v_result_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_manage_academics(p_school_id) THEN
    RAISE EXCEPTION 'Not authorized to compute results';
  END IF;
  SELECT academic_session_id INTO v_session FROM public.academic_terms
  WHERE school_id = p_school_id AND id = p_term_id;
  IF NOT FOUND OR NOT EXISTS (SELECT 1 FROM public.grading_schemes
    WHERE school_id = p_school_id AND id = p_grading_scheme_id) THEN
    RAISE EXCEPTION 'Term or grading scheme not found';
  END IF;
  FOR v_subject IN SELECT cs.subject_id FROM public.class_subjects cs
    JOIN public.class_sections sec ON sec.school_id = cs.school_id AND sec.class_id = cs.class_id
    WHERE cs.school_id = p_school_id AND sec.id = p_class_section_id
  LOOP
    IF NOT EXISTS (SELECT 1 FROM public.assessments a
      WHERE a.school_id = p_school_id AND a.term_id = p_term_id
        AND a.class_section_id = p_class_section_id AND a.subject_id = v_subject) THEN
      RAISE EXCEPTION 'A subject has no configured assessments';
    END IF;
    IF (SELECT COALESCE(sum(a.weighting), 0) FROM public.assessments a
      WHERE a.school_id = p_school_id AND a.term_id = p_term_id
        AND a.class_section_id = p_class_section_id AND a.subject_id = v_subject) <> 100 THEN
      RAISE EXCEPTION 'Assessment weightings for each subject must total exactly 100%%';
    END IF;
    IF EXISTS (SELECT 1 FROM public.assessments a JOIN public.enrollments e
      ON e.school_id = a.school_id AND e.class_section_id = a.class_section_id
      AND e.academic_session_id = a.academic_session_id AND e.status = 'active'
      LEFT JOIN public.assessment_scores s ON s.school_id = a.school_id
        AND s.assessment_id = a.id AND s.student_id = e.student_id
      WHERE a.school_id = p_school_id AND a.term_id = p_term_id
        AND a.class_section_id = p_class_section_id AND a.subject_id = v_subject
        AND (s.id IS NULL OR s.score IS NULL OR s.status <> 'approved')) THEN
      RAISE EXCEPTION 'Results are incomplete until every enrolled student has approved scores';
    END IF;
    FOR v_student IN SELECT e.student_id FROM public.enrollments e
      WHERE e.school_id = p_school_id AND e.class_section_id = p_class_section_id
        AND e.academic_session_id = v_session AND e.status = 'active'
    LOOP
      SELECT round(sum((s.score / a.max_score) * a.weighting), 2) INTO v_total
      FROM public.assessments a JOIN public.assessment_scores s
        ON s.school_id = a.school_id AND s.assessment_id = a.id
      WHERE a.school_id = p_school_id AND a.term_id = p_term_id
        AND a.class_section_id = p_class_section_id AND a.subject_id = v_subject
        AND s.student_id = v_student AND s.status = 'approved';
      SELECT grade INTO v_grade FROM public.grading_bands
      WHERE school_id = p_school_id AND grading_scheme_id = p_grading_scheme_id
        AND v_total BETWEEN minimum_score AND maximum_score
      ORDER BY minimum_score DESC LIMIT 1;
      IF v_grade IS NULL THEN RAISE EXCEPTION 'No grade band covers computed score %', v_total; END IF;
      INSERT INTO public.term_results(school_id, student_id, academic_session_id, term_id,
        class_section_id, subject_id, grading_scheme_id, weighted_score, grade, created_by)
      VALUES (p_school_id, v_student, v_session, p_term_id, p_class_section_id, v_subject,
        p_grading_scheme_id, v_total, v_grade, auth.uid())
      ON CONFLICT (school_id, student_id, term_id, subject_id) DO UPDATE SET
        weighted_score = EXCLUDED.weighted_score, grade = EXCLUDED.grade,
        grading_scheme_id = EXCLUDED.grading_scheme_id, updated_at = now()
      WHERE term_results.status IN ('draft', 'submitted', 'reviewed')
      RETURNING id INTO v_result_id;
      IF NOT FOUND THEN RAISE EXCEPTION 'Published result cannot be recomputed'; END IF;
      DELETE FROM public.report_card_components WHERE school_id = p_school_id AND result_id = v_result_id;
      INSERT INTO public.report_card_components(school_id, result_id, assessment_id, score, max_score, weighting, weighted_points)
      SELECT p_school_id, v_result_id, a.id, s.score, a.max_score, a.weighting,
        round((s.score / a.max_score) * a.weighting, 2)
      FROM public.assessments a JOIN public.assessment_scores s
        ON s.school_id = a.school_id AND s.assessment_id = a.id
      WHERE a.school_id = p_school_id AND a.term_id = p_term_id
        AND a.class_section_id = p_class_section_id AND a.subject_id = v_subject
        AND s.student_id = v_student AND s.status = 'approved';
      v_count := v_count + 1;
    END LOOP;
  END LOOP;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.transition_term_results(
  p_result_ids uuid[], p_status public.academic_workflow_status, p_reason text DEFAULT NULL
)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_school_id uuid; v_count integer;
BEGIN
  IF p_result_ids IS NULL OR cardinality(p_result_ids) = 0 THEN RAISE EXCEPTION 'Select results to update'; END IF;
  SELECT school_id INTO v_school_id FROM public.term_results WHERE id = p_result_ids[1];
  IF NOT FOUND OR auth.uid() IS NULL OR NOT public.can_manage_academics(v_school_id) THEN
    RAISE EXCEPTION 'Result not found or not authorized';
  END IF;
  IF p_status = 'published' AND NOT public.can_manage_school(v_school_id) THEN
    RAISE EXCEPTION 'Only school administrators may publish results';
  END IF;
  IF p_status = 'draft' AND NOT public.can_manage_school(v_school_id) THEN
    RAISE EXCEPTION 'Only school administrators may reopen results';
  END IF;
  IF EXISTS (SELECT 1 FROM public.term_results WHERE id = ANY(p_result_ids) AND school_id <> v_school_id) THEN
    RAISE EXCEPTION 'Selected results must belong to one school';
  END IF;
  IF EXISTS (SELECT 1 FROM public.term_results WHERE id = ANY(p_result_ids)
    AND status = 'published' AND p_status <> 'published' AND COALESCE(p_reason, '') = '') THEN
    RAISE EXCEPTION 'A reason is required to correct a published result';
  END IF;
  IF EXISTS (SELECT 1 FROM public.term_results WHERE id = ANY(p_result_ids) AND school_id = v_school_id
    AND NOT (
      (status = 'draft' AND p_status = 'submitted')
      OR (status = 'submitted' AND p_status = 'reviewed')
      OR (status = 'reviewed' AND p_status = 'approved')
      OR (status = 'approved' AND p_status = 'published')
    )) THEN
    RAISE EXCEPTION 'Results must follow the draft, submitted, reviewed, approved, published workflow';
  END IF;
  UPDATE public.term_results SET status = p_status, published_at = CASE WHEN p_status = 'published' THEN now() ELSE published_at END,
    updated_at = now()
  WHERE id = ANY(p_result_ids) AND school_id = v_school_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  INSERT INTO public.result_history(school_id, result_id, actor_user_id, action, reason, snapshot)
  SELECT r.school_id, r.id, auth.uid(), 'status_' || p_status::text, p_reason, to_jsonb(r)
  FROM public.term_results r WHERE r.id = ANY(p_result_ids) AND r.school_id = v_school_id;
  INSERT INTO public.audit_logs(school_id, actor_user_id, action, entity_type, entity_id, details)
  SELECT r.school_id, auth.uid(), 'result_' || p_status::text, 'term_results', r.id, '{}'::jsonb
  FROM public.term_results r WHERE r.id = ANY(p_result_ids) AND r.school_id = v_school_id;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.correct_published_result(
  p_result_id uuid, p_weighted_score numeric, p_reason text
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_result public.term_results%ROWTYPE; v_grade text;
BEGIN
  SELECT * INTO v_result FROM public.term_results WHERE id = p_result_id FOR UPDATE;
  IF NOT FOUND OR NOT public.can_manage_school(v_result.school_id) OR auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Result not found or not authorized';
  END IF;
  IF v_result.status <> 'published' OR COALESCE(trim(p_reason), '') = ''
     OR p_weighted_score < 0 OR p_weighted_score > 100 THEN
    RAISE EXCEPTION 'A published result correction requires a reason and a score from 0 to 100';
  END IF;
  SELECT grade INTO v_grade FROM public.grading_bands
  WHERE school_id = v_result.school_id AND grading_scheme_id = v_result.grading_scheme_id
    AND p_weighted_score BETWEEN minimum_score AND maximum_score
  ORDER BY minimum_score DESC LIMIT 1;
  IF v_grade IS NULL THEN RAISE EXCEPTION 'No grade band covers corrected score'; END IF;
  PERFORM set_config('app.result_correction_reason', trim(p_reason), true);
  UPDATE public.term_results SET weighted_score = p_weighted_score, grade = v_grade, updated_at = now()
  WHERE id = p_result_id;
  PERFORM set_config('app.result_correction_reason', '', true);
  INSERT INTO public.audit_logs(school_id, actor_user_id, action, entity_type, entity_id, details)
  VALUES (v_result.school_id, auth.uid(), 'published_result_corrected', 'term_results', p_result_id,
    jsonb_build_object('reason', trim(p_reason)));
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_academic_notification_read(p_notification_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.academic_notifications SET read_at = now()
  WHERE id = p_notification_id AND recipient_user_id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'Notification not found or not authorized'; END IF;
END;
$$;

-- Parent/teacher notification delivery is in-app only. No external messaging.
CREATE OR REPLACE FUNCTION public.notify_academic_absence()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_guardian record; v_student_name text;
BEGIN
  IF NEW.status NOT IN ('absent', 'late') THEN RETURN NEW; END IF;
  SELECT concat_ws(' ', first_name, last_name) INTO v_student_name FROM public.students
  WHERE school_id = NEW.school_id AND id = NEW.student_id;
  FOR v_guardian IN SELECT DISTINCT g.user_id FROM public.student_guardians sg
    JOIN public.guardians g ON g.school_id = sg.school_id AND g.id = sg.guardian_id
    JOIN public.school_memberships sm ON sm.school_id = g.school_id AND sm.user_id = g.user_id
    WHERE sg.school_id = NEW.school_id AND sg.student_id = NEW.student_id
      AND g.user_id IS NOT NULL AND sm.role = 'parent' AND sm.is_active
  LOOP
    INSERT INTO public.academic_notifications(school_id, recipient_user_id, student_id,
      attendance_record_id, notification_type, message)
    VALUES (NEW.school_id, v_guardian.user_id, NEW.student_id, NEW.id, NEW.status::text,
      v_student_name || CASE WHEN NEW.status = 'absent' THEN ' was marked absent.' ELSE ' was marked late.' END)
    ON CONFLICT DO NOTHING;
  END LOOP;
  RETURN NEW;
END;
$$;
CREATE TRIGGER attendance_notify_guardians AFTER INSERT OR UPDATE OF status ON public.attendance_records
  FOR EACH ROW EXECUTE FUNCTION public.notify_academic_absence();

-- RLS is enabled on all new tables; all direct write paths are role-scoped.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'academic_terms','school_days','school_holidays','attendance_records','staff_attendance',
    'academic_notifications','assessment_types','assessments','assessment_scores',
    'grading_schemes','grading_bands','term_results','result_history','report_card_components','report_card_comments',
    'school_classrooms','timetable_periods','timetable_entries'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
  END LOOP;
END $$;
GRANT SELECT, UPDATE ON public.students TO authenticated;

CREATE POLICY academic_terms_read ON public.academic_terms FOR SELECT TO authenticated
  USING (public.is_school_member(school_id));
CREATE POLICY academic_terms_manage ON public.academic_terms FOR ALL TO authenticated
  USING (public.can_manage_academics(school_id)) WITH CHECK (public.can_manage_academics(school_id));
CREATE POLICY school_days_read ON public.school_days FOR SELECT TO authenticated
  USING (public.is_school_member(school_id));
CREATE POLICY school_days_manage ON public.school_days FOR ALL TO authenticated
  USING (public.can_manage_school(school_id)) WITH CHECK (public.can_manage_school(school_id));
CREATE POLICY school_holidays_read ON public.school_holidays FOR SELECT TO authenticated
  USING (public.is_school_member(school_id));
CREATE POLICY school_holidays_manage ON public.school_holidays FOR ALL TO authenticated
  USING (public.can_manage_school(school_id)) WITH CHECK (public.can_manage_school(school_id));

CREATE POLICY attendance_records_read ON public.attendance_records FOR SELECT TO authenticated
  USING (public.can_view_academic_student(school_id, student_id));
CREATE POLICY students_academic_self_read ON public.students FOR SELECT TO authenticated
  USING (user_id = auth.uid() AND public.has_school_role(school_id, 'student'));
CREATE POLICY enrollments_academic_self_read ON public.enrollments FOR SELECT TO authenticated
  USING (public.can_view_academic_student(school_id, student_id));
CREATE POLICY class_sections_academic_student_read ON public.class_sections FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.enrollments e
    WHERE e.school_id = class_sections.school_id AND e.class_section_id = class_sections.id
      AND e.status = 'active' AND public.can_view_academic_student(e.school_id, e.student_id)));
CREATE POLICY classes_academic_student_read ON public.classes FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.enrollments e
    WHERE e.school_id = classes.school_id AND e.class_id = classes.id
      AND e.status = 'active' AND public.can_view_academic_student(e.school_id, e.student_id)));
CREATE POLICY subjects_academic_student_read ON public.subjects FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.class_subjects cs
    JOIN public.enrollments e ON e.school_id = cs.school_id AND e.class_id = cs.class_id
    WHERE cs.school_id = subjects.school_id AND cs.subject_id = subjects.id
      AND e.status = 'active' AND public.can_view_academic_student(e.school_id, e.student_id)));
CREATE POLICY class_subjects_academic_student_read ON public.class_subjects FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.enrollments e
    WHERE e.school_id = class_subjects.school_id AND e.class_id = class_subjects.class_id
      AND e.status = 'active' AND public.can_view_academic_student(e.school_id, e.student_id)));
CREATE POLICY staff_attendance_read ON public.staff_attendance FOR SELECT TO authenticated
  USING (public.can_manage_school(school_id));
CREATE POLICY staff_attendance_manage ON public.staff_attendance FOR ALL TO authenticated
  USING (public.can_manage_school(school_id)) WITH CHECK (public.can_manage_school(school_id));
CREATE POLICY academic_notifications_read ON public.academic_notifications FOR SELECT TO authenticated
  USING (recipient_user_id = auth.uid());
REVOKE INSERT, UPDATE, DELETE ON public.academic_notifications FROM authenticated;

CREATE POLICY assessment_types_read ON public.assessment_types FOR SELECT TO authenticated
  USING (public.is_school_member(school_id));
CREATE POLICY assessment_types_manage ON public.assessment_types FOR ALL TO authenticated
  USING (public.can_manage_academics(school_id)) WITH CHECK (public.can_manage_academics(school_id));
CREATE POLICY assessments_read ON public.assessments FOR SELECT TO authenticated
  USING (public.can_manage_academics(school_id) OR public.can_manage_assessment(school_id, class_section_id, subject_id));
CREATE POLICY assessments_manage ON public.assessments FOR ALL TO authenticated
  USING (public.can_manage_academics(school_id)) WITH CHECK (public.can_manage_academics(school_id));
CREATE POLICY assessment_scores_read ON public.assessment_scores FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.assessments a WHERE a.school_id = assessment_scores.school_id
    AND a.id = assessment_scores.assessment_id
    AND (public.can_manage_academics(a.school_id) OR public.can_manage_assessment(a.school_id, a.class_section_id, a.subject_id))));
CREATE POLICY grading_schemes_read ON public.grading_schemes FOR SELECT TO authenticated
  USING (public.is_school_member(school_id));
CREATE POLICY grading_schemes_manage ON public.grading_schemes FOR ALL TO authenticated
  USING (public.can_manage_academics(school_id)) WITH CHECK (public.can_manage_academics(school_id));
CREATE POLICY grading_bands_read ON public.grading_bands FOR SELECT TO authenticated
  USING (public.is_school_member(school_id));
CREATE POLICY grading_bands_manage ON public.grading_bands FOR ALL TO authenticated
  USING (public.can_manage_academics(school_id)) WITH CHECK (public.can_manage_academics(school_id));

CREATE POLICY term_results_read ON public.term_results FOR SELECT TO authenticated
  USING ((status = 'published' AND public.can_view_academic_student(school_id, student_id))
    OR public.can_manage_academics(school_id)
    OR EXISTS (SELECT 1 FROM public.assessments a WHERE a.school_id = term_results.school_id
      AND a.term_id = term_results.term_id AND a.class_section_id = term_results.class_section_id
      AND a.subject_id = term_results.subject_id
      AND public.can_manage_assessment(a.school_id, a.class_section_id, a.subject_id)));
CREATE POLICY result_history_read ON public.result_history FOR SELECT TO authenticated
  USING (public.can_manage_academics(school_id));
CREATE POLICY report_card_components_read ON public.report_card_components FOR SELECT TO authenticated
  USING (public.can_manage_academics(school_id)
    OR EXISTS (SELECT 1 FROM public.term_results r WHERE r.school_id = report_card_components.school_id
      AND r.id = report_card_components.result_id AND r.status = 'published'
      AND public.can_view_academic_student(r.school_id, r.student_id))
    OR EXISTS (SELECT 1 FROM public.term_results r JOIN public.assessments a
      ON a.school_id = r.school_id AND a.term_id = r.term_id
        AND a.class_section_id = r.class_section_id AND a.subject_id = r.subject_id
      WHERE r.school_id = report_card_components.school_id AND r.id = report_card_components.result_id
        AND public.can_manage_assessment(a.school_id, a.class_section_id, a.subject_id)));
CREATE POLICY report_card_comments_read ON public.report_card_comments FOR SELECT TO authenticated
  USING (public.can_manage_academics(school_id)
    OR EXISTS (SELECT 1 FROM public.term_results r WHERE r.school_id = report_card_comments.school_id
      AND r.student_id = report_card_comments.student_id AND r.term_id = report_card_comments.term_id
      AND r.status = 'published' AND public.can_view_academic_student(r.school_id, r.student_id)));
CREATE POLICY report_card_comments_manage ON public.report_card_comments FOR ALL TO authenticated
  USING (public.can_manage_academics(school_id)) WITH CHECK (public.can_manage_academics(school_id));

CREATE POLICY school_classrooms_read ON public.school_classrooms FOR SELECT TO authenticated
  USING (public.is_school_member(school_id));
CREATE POLICY school_classrooms_manage ON public.school_classrooms FOR ALL TO authenticated
  USING (public.can_manage_academics(school_id)) WITH CHECK (public.can_manage_academics(school_id));
CREATE POLICY timetable_periods_read ON public.timetable_periods FOR SELECT TO authenticated
  USING (public.is_school_member(school_id));
CREATE POLICY timetable_periods_manage ON public.timetable_periods FOR ALL TO authenticated
  USING (public.can_manage_academics(school_id)) WITH CHECK (public.can_manage_academics(school_id));
CREATE POLICY timetable_entries_read ON public.timetable_entries FOR SELECT TO authenticated
  USING (public.can_manage_academics(school_id)
    OR EXISTS (SELECT 1 FROM public.teacher_assignments ta
      JOIN public.staff_profiles sp ON sp.school_id = ta.school_id AND sp.id = ta.staff_profile_id
      WHERE ta.school_id = timetable_entries.school_id AND ta.class_section_id = timetable_entries.class_section_id
        AND sp.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.class_sections cs
      JOIN public.staff_profiles sp ON sp.school_id = cs.school_id AND sp.id = cs.class_teacher_id
      WHERE cs.school_id = timetable_entries.school_id AND cs.id = timetable_entries.class_section_id
        AND sp.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.enrollments e
      WHERE e.school_id = timetable_entries.school_id AND e.class_section_id = timetable_entries.class_section_id
        AND e.status = 'active' AND public.can_view_academic_student(e.school_id, e.student_id)));
CREATE POLICY timetable_entries_manage ON public.timetable_entries FOR ALL TO authenticated
  USING (public.can_manage_academics(school_id)) WITH CHECK (public.can_manage_academics(school_id));

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'attendance_records','staff_attendance','assessment_scores','term_results',
    'report_card_comments','timetable_entries'
  ] LOOP
    EXECUTE format('CREATE TRIGGER %I_audit AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.audit_m3_academic_change()', t, t);
  END LOOP;
END $$;

REVOKE EXECUTE ON FUNCTION public.save_attendance(uuid, uuid, uuid, date, jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.save_staff_attendance(uuid, date, jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.save_assessment_scores(uuid, jsonb, boolean) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.review_assessment_scores(uuid, boolean) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.compute_term_results(uuid, uuid, uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.transition_term_results(uuid[], public.academic_workflow_status, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.mark_academic_notification_read(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.correct_published_result(uuid, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_attendance(uuid, uuid, uuid, date, jsonb),
  public.save_staff_attendance(uuid, date, jsonb),
  public.save_assessment_scores(uuid, jsonb, boolean),
  public.review_assessment_scores(uuid, boolean),
  public.compute_term_results(uuid, uuid, uuid, uuid),
  public.transition_term_results(uuid[], public.academic_workflow_status, text),
  public.mark_academic_notification_read(uuid),
  public.correct_published_result(uuid, numeric, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.touch_m3_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END;
$$;
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'academic_terms','attendance_records','staff_attendance','assessments','assessment_scores',
    'term_results','report_card_comments','timetable_entries'
  ] LOOP
    EXECUTE format('CREATE TRIGGER %I_touch_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.touch_m3_updated_at()', t, t);
  END LOOP;
END $$;
