import { useSelector } from "react-redux";
import type { RootState } from "@/app/store";
import CommunicationWorkspace from "@/shared/components/CommunicationWorkspace";
import { resolveAuthIdent } from "@/shared/lib/authIdentity";

export default function LecturerMessagesPage() {
  const auth = useSelector((s: RootState) => s.auth) as { userId?: string; username?: string; email?: string };
  const ident = resolveAuthIdent(auth);

  return (
    <CommunicationWorkspace
      role="lecturer"
      ident={ident}
      title="Messages"
      subtitle="Reply to student appeals and comment discussions in real time while reviewing the linked submission context."
    />
  );
}
