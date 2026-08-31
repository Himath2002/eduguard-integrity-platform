import { useEffect, useMemo, useState } from "react";
import { useSelector } from "react-redux";
import type { RootState } from "@/app/store";
import { useNavigate } from "react-router-dom";
import { api } from "@/shared/lib/api";
import PortalModal from "@/shared/components/PortalModal";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { resolveAuthIdent } from "@/shared/lib/authIdentity";

type Props = {
  open: boolean;
  onClose: () => void;
};

export default function JoinClassModal({ open, onClose }: Props) {
  const navigate = useNavigate();

  const auth = useSelector((s: RootState) => s.auth) as {
    userId?: string | null;
    username?: string | null;
    email?: string | null;
    role?: string | null;
  };

  const ident = resolveAuthIdent(auth);

  const [classCode, setClassCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);

  const canSubmit = useMemo(() => classCode.trim().length >= 3, [classCode]);

  useEffect(() => {
    if (!open) return;
    setClassCode("");
    setError(null);
    setJoining(false);
  }, [open]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (open) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const submit = async () => {
    setError(null);

    if (!ident) {
      setError("Not logged in");
      return;
    }

    const code = classCode.trim();
    if (code.length < 3) {
      setError("Please enter a valid class code.");
      return;
    }

    setJoining(true);
    try {
      await api(`/student/${encodeURIComponent(ident)}/classes/join`, {
        method: "POST",
        body: { classCode: code },
      });

      onClose();
      navigate("/student/classes", { replace: true });
    } catch (e: any) {
      setError(e?.message || "Failed to join class");
    } finally {
      setJoining(false);
    }
  };

  return (
    <PortalModal
      open={open}
      title="Join a class"
      onClose={onClose}
      widthClass="max-w-lg"
      topClass="mt-24"
    >
      <p className="text-sm text-slate-600">
        Enter the class code provided by your lecturer.
      </p>

      <div className="mt-5 space-y-3">
        <div>
          <Label htmlFor="classCode">Class Code</Label>
          <Input
            id="classCode"
            value={classCode}
            onChange={(e) => setClassCode(e.target.value)}
            placeholder="e.g. ENG-101"
            autoFocus
          />
        </div>

        {error && <div className="text-sm text-red-600">{error}</div>}

        <div className="pt-2 flex items-center justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={joining}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!canSubmit || joining}>
            {joining ? "Joining..." : "Join"}
          </Button>
        </div>
      </div>
    </PortalModal>
  );
}