import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface DemoUser {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: string;
  employeeId?: string;
  designation?: string;
  department?: string;
  createStaff: boolean;
}

const DEMO_PASSWORD = "cedarfield2026";

const DEMO_USERS: DemoUser[] = [
  {
    email: "platform@cedarfield.edu.ng",
    password: DEMO_PASSWORD,
    firstName: "Ngozi",
    lastName: "Adeyemi",
    role: "platform_admin",
    employeeId: "CFA-PLT",
    designation: "Platform Super Administrator",
    department: "CampusOS",
    createStaff: true,
  },
  {
    email: "owner@cedarfield.edu.ng",
    password: DEMO_PASSWORD,
    firstName: "Emeka",
    lastName: "Cedar",
    role: "school_owner",
    employeeId: "CFA-000",
    designation: "Proprietor",
    department: "Administration",
    createStaff: true,
  },
  {
    email: "admin@cedarfield.edu.ng",
    password: DEMO_PASSWORD,
    firstName: "Adaeze",
    lastName: "Okwu",
    role: "school_admin",
    employeeId: "CFA-001",
    designation: "School Administrator",
    department: "Administration",
    createStaff: true,
  },
  {
    email: "academic@cedarfield.edu.ng",
    password: DEMO_PASSWORD,
    firstName: "Chinedu",
    lastName: "Ibe",
    role: "academic_admin",
    employeeId: "CFA-002",
    designation: "Academic Administrator",
    department: "Academics",
    createStaff: true,
  },
  {
    email: "bursar@cedarfield.edu.ng",
    password: DEMO_PASSWORD,
    firstName: "Folake",
    lastName: "Adebayo",
    role: "bursar",
    employeeId: "CFA-003",
    designation: "Bursar",
    department: "Finance",
    createStaff: true,
  },
  {
    email: "teacher@cedarfield.edu.ng",
    password: DEMO_PASSWORD,
    firstName: "Grace",
    lastName: "Bello",
    role: "teacher",
    employeeId: "CFA-010",
    designation: "Mathematics Teacher",
    department: "Mathematics",
    createStaff: true,
  },
  {
    email: "parent@cedarfield.edu.ng",
    password: DEMO_PASSWORD,
    firstName: "Ibrahim",
    lastName: "Suleiman",
    role: "parent",
    createStaff: false,
  },
  {
    email: "student@cedarfield.edu.ng",
    password: DEMO_PASSWORD,
    firstName: "Amara",
    lastName: "Okonkwo",
    role: "student",
    createStaff: false,
  },
];

const SCHOOL_ID = "c0000000-0000-0000-0000-000000000001";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const results: { email: string; status: string; error?: string }[] = [];

    // 1. Ensure school exists
    const { data: existingSchool } = await adminClient
      .from("schools")
      .select("id")
      .eq("id", SCHOOL_ID)
      .maybeSingle();

    if (!existingSchool) {
      const { error: schoolErr } = await adminClient.from("schools").insert({
        id: SCHOOL_ID,
        name: "Cedarfield Academy",
        short_name: "CFA",
        type: "both",
        country: "Nigeria",
        currency: "NGN",
        timezone: "Africa/Lagos",
        phone_country_code: "+234",
        address: "12 Cedar Road, GRA, Enugu, Nigeria",
        is_active: true,
      });
      if (schoolErr) {
        return new Response(
          JSON.stringify({ error: "Failed to create school: " + schoolErr.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      await adminClient.from("campuses").insert({
        school_id: SCHOOL_ID,
        name: "Main Campus",
        address: "12 Cedar Road, GRA, Enugu, Nigeria",
        is_active: true,
      });

      await adminClient.from("school_settings").insert({
        school_id: SCHOOL_ID,
        settings: {
          academic_structure: "custom",
          grading_type: "weighted",
          default_currency: "NGN",
          enable_ai_features: true,
          notification_channels: ["in_app", "email"],
        },
      });
    }

    // 2. Create each demo user
    for (const user of DEMO_USERS) {
      try {
        // Check if user already exists
        const { data: existingUsers } = await adminClient.auth.admin.listUsers();
        const existing = existingUsers?.users?.find((u) => u.email === user.email);

        let authUserId: string;

        if (existing) {
          authUserId = existing.id;
          results.push({ email: user.email, status: "already_exists" });
        } else {
          // Create user via Admin API
          const { data: newUser, error: createErr } = await adminClient.auth.admin.createUser({
            email: user.email,
            password: user.password,
            email_confirm: true,
            user_metadata: {
              first_name: user.firstName,
              last_name: user.lastName,
            },
          });

          if (createErr) {
            results.push({ email: user.email, status: "failed", error: createErr.message });
            continue;
          }

          authUserId = newUser.user.id;
          results.push({ email: user.email, status: "created" });
        }

        // 3. Ensure user profile exists
        await adminClient.from("user_profiles").upsert({
          id: authUserId,
          first_name: user.firstName,
          last_name: user.lastName,
          email: user.email,
          is_active: true,
        }, { onConflict: "id" });

        // 4. Ensure membership exists
        const { data: existingMembership } = await adminClient
          .from("school_memberships")
          .select("id")
          .eq("school_id", SCHOOL_ID)
          .eq("user_id", authUserId)
          .maybeSingle();

        if (!existingMembership) {
          await adminClient.from("school_memberships").insert({
            school_id: SCHOOL_ID,
            user_id: authUserId,
            role: user.role,
            is_active: true,
          });
        }

        if (user.createStaff) {
          const { data: existingStaff } = await adminClient
            .from("staff_profiles")
            .select("id")
            .eq("school_id", SCHOOL_ID)
            .eq("user_id", authUserId)
            .maybeSingle();

          if (!existingStaff) {
            await adminClient.from("staff_profiles").insert({
              school_id: SCHOOL_ID,
              user_id: authUserId,
              employee_id: user.employeeId,
              designation: user.designation,
              department: user.department,
              employment_type: "full_time",
              joined_on: "2024-09-01",
              is_active: true,
            });
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        results.push({ email: user.email, status: "error", error: msg });
      }
    }

    // 6. Audit log
    await adminClient.from("audit_logs").upsert({
      school_id: SCHOOL_ID,
      actor_user_id: null,
      action: "seeded demo data",
      entity_type: "schools",
      details: { results },
    }, { onConflict: "id" });

    return new Response(
      JSON.stringify({ success: true, results }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
