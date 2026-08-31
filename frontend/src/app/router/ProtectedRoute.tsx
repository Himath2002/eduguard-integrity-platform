import { Navigate } from "react-router-dom";
import type { ReactElement } from "react";
import { useAppSelector } from "@/app/store/hooks";
import type { Role } from "@/shared/types/auth";

export default function ProtectedRoute({
  children,
  allow,
}: {
  children: ReactElement;
  allow: Role[];
}) {
  const { isAuthed, role } = useAppSelector((s) => s.auth);

  if (!isAuthed || !role || !allow.includes(role)) {
    return <Navigate to="/login" replace />;
  }

  return children;
}