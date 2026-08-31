import { useSelector } from "react-redux";
import type { RootState } from "@/app/store";
import CommunicationWorkspace from "@/shared/components/CommunicationWorkspace";
import { resolveAuthIdent } from "@/shared/lib/authIdentity";

export default function StudentMessagesPage() {
  const auth = useSelector((s: RootState) => s.auth) as { userId?: string; username?: string; email?: string };
  const ident = resolveAuthIdent(auth);

  return (
    <CommunicationWorkspace
      role="student"
      ident={ident}
      title="Messages"
      subtitle="Discuss lecturer comments, ask for clarification, or submit an appeal about a marked comment."
    />
  );
}
