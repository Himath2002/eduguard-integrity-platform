// src/pages/ForgotPassword.tsx
import { useState } from "react";
import { Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { api } from "@/shared/lib/api";
import { Input } from "@/shared/components/ui/input";
import { Button } from "@/shared/components/ui/button";

const schema = z.object({
  email: z.string().email("Enter a valid email"),
});
type FormData = z.infer<typeof schema>;

export default function ForgotPassword() {
  const [submitted, setSubmitted] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { email: "" },
  });

  const requestReset = useMutation({
    mutationFn: (body: FormData) =>
      api("/auth/password/forgot", {
        method: "POST",
        body, //no JSON.stringify
      }),
    onSuccess: () => setSubmitted(true),
  });

  return (
    <div className="min-h-screen grid place-items-center p-6 relative overflow-hidden">
      <section className="w-full max-w-md rounded-[28px] border border-white/40 bg-white/70 backdrop-blur-xl p-8 shadow-[0_18px_60px_rgba(0,0,0,0.06)]">
        <h1 className="text-[26px] sm:text-[30px] font-semibold tracking-tight mb-2">
          Reset password
        </h1>
        <p className="text-sm text-gray-600 mb-6">
          Enter your email and we’ll send you a reset link.
        </p>

        {submitted ? (
          <div className="text-sm text-gray-700">
            If an account exists for that email, a reset link has been sent. Please check your inbox.
          </div>
        ) : (
          <form className="space-y-4" onSubmit={handleSubmit((v) => requestReset.mutate(v))}>
            <label htmlFor="email" className="sr-only">Email</label>
            <Input
              id="email"
              type="email"
              placeholder="you@university.edu"
              {...register("email")}
              className="rounded-2xl bg-white transition-all duration-200 hover:bg-white/90"
            />
            {errors.email && <p className="text-sm text-red-600">{errors.email.message}</p>}

            <Button type="submit" disabled={requestReset.isPending} className="w-full rounded-2xl">
              {requestReset.isPending ? "Sending…" : "Send reset link"}
            </Button>

            {requestReset.isError && (
              <p className="text-sm text-red-600">
                {(requestReset.error as Error).message || "Unable to send reset link"}
              </p>
            )}
          </form>
        )}

        <div className="mt-6 text-sm">
          <Link to="/login" className="text-indigo-700 hover:underline">
            Back to sign in
          </Link>
        </div>
      </section>
    </div>
  );
}
