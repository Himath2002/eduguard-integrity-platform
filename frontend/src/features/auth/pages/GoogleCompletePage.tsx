import { useEffect, useState } from "react";
import { useDispatch } from "react-redux";
import { useNavigate } from "react-router-dom";

import { completeGoogleSignup, type GoogleCompleteResp } from "@/features/auth/api/auth.api";
import { setSession } from "@/app/store/authSlice";
import { Input } from "@/shared/components/ui/input";
import { Button } from "@/shared/components/ui/button";

type Role = "student" | "lecturer";

function routeForRole(role: Role | "admin") {
  if (role === "student") return "/student/dashboard";
  if (role === "lecturer") return "/lecturer/dashboard";
  return "/admin/dashboard";
}

export default function GoogleCompletePage() {
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const [token] = useState(() => sessionStorage.getItem("google_signup_token") || "");
  const [email] = useState(() => sessionStorage.getItem("google_email") || "");
  const [name] = useState(() => sessionStorage.getItem("google_name") || "");
  const [suggestedUsername] = useState(
    () => sessionStorage.getItem("google_suggested_username") || ""
  );

  const [username, setUsername] = useState("");
  const [role, setRole] = useState<Role>("student");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      navigate("/login", { replace: true });
      return;
    }

    const derived =
      suggestedUsername ||
      (name || email.split("@")[0] || "user")
        .toLowerCase()
        .replace(/[^a-z0-9_.]/g, "")
        .slice(0, 50);

    if (derived) {
      setUsername((current) => current || derived);
    }
  }, [email, name, navigate, suggestedUsername, token]);

  const submit = async () => {
    if (!token || loading) return;

    if (!username.trim() || username.trim().length < 3) {
      setErr("Username must be at least 3 characters");
      return;
    }

    setLoading(true);
    setErr(null);

    try {
      const data: GoogleCompleteResp = await completeGoogleSignup({
        signup_token: token,
        username: username.trim(),
        role,
      });

      dispatch(
        setSession({
          userId: data.userId,
          role: data.role,
          name: data.name || name || undefined,
          username: data.username || username.trim(),
          email: data.email || email || undefined,
        })
      );

      sessionStorage.removeItem("google_signup_token");
      sessionStorage.removeItem("google_email");
      sessionStorage.removeItem("google_name");
      sessionStorage.removeItem("google_suggested_username");

      navigate(routeForRole(data.role), { replace: true });
    } catch (e: any) {
      setErr(e?.message || "Failed to complete Google signup");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="mx-auto w-full max-w-3xl px-6 py-10 relative">
        <div className="flex items-center gap-4 mb-10">
          <div
            className="grid h-14 w-14 place-items-center rounded-2xl text-white shadow-[0_10px_26px_rgba(140,90,255,0.45)]"
            style={{
              background: "linear-gradient(135deg, rgb(140,90,255), rgb(66,130,255))",
            }}
          >
            EG
          </div>
          <div className="text-2xl font-semibold tracking-tight">EduGuard</div>
        </div>

        <div className="flex justify-center">
          <section className="w-full rounded-[28px] border border-white/40 bg-white/70 backdrop-blur-xl shadow-[0_18px_60px_rgba(0,0,0,0.06)] p-8 sm:p-10">
            <h1 className="text-[28px] sm:text-[32px] font-semibold tracking-tight">
              Complete your account
            </h1>
            <p className="text-sm text-gray-600 mt-1">
              Signed in with Google as {email || "..."}. Choose your role and username.
            </p>

            {(name || email) && (
              <div className="mt-4 text-sm text-gray-700 space-y-1">
                {name ? <div>{`Signed in as: ${name}`}</div> : null}
                {email ? <div>{`Email: ${email}`}</div> : null}
              </div>
            )}

            <div className="mt-6 space-y-4">
              <div>
                <label className="text-sm text-gray-700">Username</label>
                <Input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="e.g., jayith"
                  className="rounded-2xl mt-1"
                />
              </div>

              <div>
                <label className="text-sm text-gray-700">Role</label>
                <select
                  className="mt-1 w-full rounded-2xl border px-4 py-2 bg-white"
                  value={role}
                  onChange={(e) => setRole(e.target.value as Role)}
                >
                  <option value="student">Student</option>
                  <option value="lecturer">Lecturer</option>
                </select>
              </div>

              {err && <p className="text-sm text-red-600">{err}</p>}

              <div className="flex justify-end">
                <Button onClick={submit} disabled={loading}>
                  {loading ? "Creating..." : "Continue"}
                </Button>
              </div>

              <button
                type="button"
                onClick={() => navigate("/login")}
                className="text-sm text-gray-600 hover:underline"
              >
                Back to login
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
