import { createClient } from "../../src/lib/supabase/server";

export default async function TestSupabasePage() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();

  return (
    <div style={{ padding: 24 }}>
      <h1>Supabase Test</h1>

      <p>
        URL موجود؟ <b>{process.env.NEXT_PUBLIC_SUPABASE_URL ? "نعم" : "لا"}</b>
      </p>

      <p>
        KEY موجود؟ <b>{process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? "نعم" : "لا"}</b>
      </p>

      <hr />

      <p>
        User:{" "}
        <b>{data?.user ? `Logged in (${data.user.email})` : "Not logged in"}</b>
      </p>

      {error && (
        <pre style={{ background: "#111", color: "#f88", padding: 12 }}>
          {error.message}
        </pre>
      )}
    </div>
  );
}