// src/pages/MFAPage.tsx
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { api } from "@/shared/lib/api";
import { useDispatch } from "react-redux";
import { setSession } from "@/app/store/authSlice";
import { Input } from "@/shared/components/ui/input";
import { Button } from "@/shared/components/ui/button";
import { useLocation, useNavigate } from "react-router-dom";

type Role = "student" | "lecturer" | "admin";
const schema = z.object({ code: z.string().length(6, "Enter the 6-digit code") });

function routeFor(role: Role) {
  return role === "student" ? "/student" : role === "lecturer" ? "/lecturer" : "/admin";
}

type Resp = { userId: string; role: Role };

export default function MFAPage() {
  const { register, handleSubmit, formState: { errors } } = useForm<{ code: string }>({
    resolver: zodResolver(schema),
  });

  const dispatch = useDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const routeState = location.state as { ticket?: string; email?: string } | null;
  const ticket = routeState?.ticket || "";
  const mfaEmail = routeState?.email;

  useEffect(() => {
    if (!ticket) navigate("/login", { replace: true });
  }, [ticket, navigate]);

  const verify = useMutation({
    mutationFn: (body: { code: string }) =>
      api<Resp>("/auth/mfa/verify", {
        method: "POST",
        body: { ...body, ticket },
      }),
    onSuccess: (d) => {
      dispatch(
        setSession({
          userId: d.userId,
          role: d.role,
          email: mfaEmail,
        })
      );
      navigate(routeFor(d.role));
    },
  });

  return (
    <div className="min-h-screen grid place-items-center p-6 relative overflow-hidden">
      <form
        onSubmit={handleSubmit((v) => verify.mutate(v))}
        className="max-w-sm w-full space-y-4 rounded-[28px] border border-white/40 bg-white/70 backdrop-blur-xl p-6 shadow-[0_18px_60px_rgba(0,0,0,0.06)]"
      >
        <h1 className="text-xl font-semibold">Multi-Factor Authentication</h1>
        <p className="text-sm text-slate-600">Enter the 6-digit code from your authenticator.</p>

        <Input
          placeholder="6-digit code"
          inputMode="numeric"
          maxLength={6}
          {...register("code")}
          className="rounded-2xl bg-white tracking-widest text-center"
        />
        {errors.code && <p className="text-sm text-red-600">{errors.code.message}</p>}

        <Button type="submit" disabled={verify.isPending} className="w-full rounded-2xl">
          {verify.isPending ? "Verifying…" : "Verify"}
        </Button>

        <button
          type="button"
          onClick={() => navigate("/login")}
          className="w-full text-sm text-indigo-700 hover:underline mt-2"
        >
          Back to sign in
        </button>

        {verify.isError && (
          <p className="text-sm text-red-600">
            {(verify.error as Error).message || "Verification failed"}
          </p>
        )}
      </form>
    </div>
  );
}
