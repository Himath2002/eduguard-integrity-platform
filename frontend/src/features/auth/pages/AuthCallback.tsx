// src/pages/AuthCallback.tsx
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { fetchMe } from "@/features/auth/api/session";
import { useDispatch } from "react-redux";
import { setSession } from "@/app/store/authSlice";

type Role = "student" | "lecturer" | "admin";
const routeFor = (r: Role) => (r === "student" ? "/student" : r === "lecturer" ? "/lecturer" : "/admin");

export default function AuthCallback() {
  const nav = useNavigate();
  const dispatch = useDispatch();

  useEffect(() => {
    (async () => {
      try {
        const me = await fetchMe(); // should succeed once backend set cookie
        const profileName = me.name || me.username || (me.email ? me.email.split("@")[0] : "");
        if (profileName) localStorage.setItem("eduguard.name", profileName);

        dispatch(
          setSession({
            userId: me.userId,
            role: me.role as Role,
            name: me.name,
            username: me.username,
            email: me.email,
          })
        );

        // If opened in a popup, just close it — the opener is polling /auth/me
        const isPopup = !!(window.opener && window.opener !== window);
        if (isPopup) {
          try { window.close(); } catch { /* empty */ }
          return;
        }

        // Same-window OAuth: send user to their dashboard
        nav(routeFor(me.role as Role), { replace: true });
      } catch {
        // On failure: close popup or return to the normal login
        const isPopup = !!(window.opener && window.opener !== window);
        if (isPopup) {
          try { window.close(); } catch { /* empty */ }
        } else {
          nav("/login", { replace: true });
        }
      }
    })();
  }, [dispatch, nav]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="rounded-[28px] border border-white/40 bg-white/70 backdrop-blur-xl p-8 shadow-[0_18px_60px_rgba(0,0,0,0.06)]">
        Finishing sign-in…
      </div>
    </div>
  );
}
