import { NavLink } from "react-router-dom";
import { useAdminTheme } from "@/shared/theme/adminTheme";

const tabs = [
  { label: "Dashboard", to: "/admin/dashboard" },
  { label: "Users", to: "/admin/users" },
  { label: "Classes", to: "/admin/classes" },
  { label: "Reports", to: "/admin/reports" },
  { label: "Communications", to: "/admin/communications" },
  { label: "Help", to: "/admin/help" },
  { label: "Settings", to: "/admin/settings" },
];

export default function AdminTopNav() {
  const { theme } = useAdminTheme();
  const isDark = theme === "dark";

  return (
    <nav className="w-full">
      <div className="flex flex-wrap items-center justify-center gap-6 md:gap-10">
        {tabs.map((tab) => (
          <NavLink key={tab.to} to={tab.to} end={tab.to.endsWith("/dashboard")}>
            {({ isActive }) => (
              <div className="relative px-4 py-2 text-sm font-medium transition">
                <span
                  className={
                    isActive
                      ? isDark
                        ? "text-cyan-300"
                        : "text-indigo-600"
                      : isDark
                      ? "text-slate-300 hover:text-cyan-200"
                      : "text-slate-600 hover:text-indigo-500"
                  }
                >
                  {tab.label}
                </span>

                {isActive && (
                  <span
                    className={
                      isDark
                        ? "absolute left-0 -bottom-1 h-[2px] w-full rounded-full bg-gradient-to-r from-cyan-400 via-indigo-400 to-fuchsia-400"
                        : "absolute left-0 -bottom-1 h-[2px] w-full rounded-full bg-indigo-600"
                    }
                  />
                )}
              </div>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}