import { useDispatch } from "react-redux";
import { useNavigate } from "react-router-dom";
import { clearSession } from "@/app/store/authSlice";

export default function LogoutButton({ className }: { className?: string }) {
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const onLogout = () => {
    dispatch(clearSession());
    navigate("/login");
  };

  return (
    <button
      onClick={onLogout}
      className={
        className ??
        "px-4 py-2 rounded-full bg-slate-900 text-white shadow hover:bg-slate-800 transition"
      }
    >
      Logout
    </button>
  );
}
