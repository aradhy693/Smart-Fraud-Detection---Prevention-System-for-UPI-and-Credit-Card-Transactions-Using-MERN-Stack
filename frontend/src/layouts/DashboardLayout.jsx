import {
  Bell,
  CreditCard,
  LayoutDashboard,
  LogOut,
  Menu,
  MonitorSmartphone,
  Moon,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Siren,
  UserCircle,
  X
} from "lucide-react";
import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { IconButton } from "../components/ui.jsx";
import { useAuth } from "../context/AuthContext.jsx";

const navItems = [
  {
    label: "Command Center",
    to: "/dashboard",
    icon: Siren
  },
  {
    label: "Admin Dashboard",
    to: "/admin",
    icon: LayoutDashboard
  },
  {
    label: "Transactions",
    to: "/transactions",
    icon: CreditCard
  },
  {
    label: "Trusted Devices",
    to: "/trusted-devices",
    icon: MonitorSmartphone
  },
  {
    label: "Security Events",
    to: "/security-events",
    icon: ShieldAlert
  },
  {
    label: "Profile",
    to: "/profile",
    icon: UserCircle
  },
  {
    label: "Settings",
    to: "/settings",
    icon: Settings
  }
];

export default function DashboardLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const { logout, user } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  const sidebar = (
    <aside className="flex h-full flex-col border-r border-[#2A2A2E] bg-[#09090B]/92 px-4 py-5 shadow-[20px_0_80px_rgba(0,0,0,0.22)] backdrop-blur-xl lg:sticky lg:top-0 lg:h-screen">
      <div className="flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-2xl border border-violet-400/30 bg-violet-500/10 text-violet-200 shadow-[0_0_34px_rgba(124,58,237,0.22)]">
          <ShieldCheck className="h-5 w-5" />
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-violet-300">Fraud SOC</p>
          <h1 className="text-base font-black text-white">Admin Console</h1>
        </div>
      </div>
      <nav className="mt-8 space-y-2">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            onClick={() => setMobileOpen(false)}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition duration-200 ${
                isActive
                  ? "border border-violet-400/30 bg-violet-500/12 text-violet-100 shadow-[0_10px_34px_rgba(124,58,237,0.12)]"
                  : "text-zinc-400 hover:bg-white/[0.055] hover:text-zinc-100"
              }`
            }
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </NavLink>
        ))}
      </nav>
      <div className="mt-auto rounded-2xl border border-[#2A2A2E] bg-[#18181B]/80 p-3 shadow-soft backdrop-blur">
        <p className="text-xs uppercase tracking-[0.16em] text-zinc-500">Signed in</p>
        <p className="mt-1 truncate text-sm font-bold text-zinc-100">{user?.name || user?.email}</p>
        <p className="truncate text-xs text-zinc-500">{user?.email}</p>
        <button
          type="button"
          onClick={handleLogout}
          className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-[#2A2A2E] px-3 py-2 text-sm font-semibold text-zinc-300 transition hover:border-red-400/40 hover:bg-red-500/10 hover:text-red-100"
        >
          <LogOut className="h-4 w-4" />
          Logout
        </button>
      </div>
    </aside>
  );

  return (
    <div className="min-h-screen bg-[#09090B] text-zinc-100">
      <div className="fixed inset-0 -z-10 bg-[radial-gradient(circle_at_18%_8%,rgba(124,58,237,0.16),transparent_28%),radial-gradient(circle_at_92%_10%,rgba(59,130,246,0.12),transparent_28%),linear-gradient(135deg,#09090B,#111111_48%,#18181B)]" />
      <div className="lg:grid lg:min-h-screen lg:grid-cols-[280px_1fr]">
        <div className="hidden lg:block">{sidebar}</div>
          <div className="lg:hidden">
            <header className="flex items-center justify-between border-b border-[#2A2A2E] bg-[#09090B]/92 px-4 py-3 backdrop-blur-xl">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-violet-300" />
              <span className="font-black">Fraud SOC</span>
            </div>
            <button
              type="button"
              onClick={() => setMobileOpen((current) => !current)}
              className="grid h-9 w-9 place-items-center rounded-xl border border-[#2A2A2E] text-zinc-200"
              aria-label="Toggle navigation"
            >
              {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </button>
          </header>
          {mobileOpen ? (
            <div className="fixed inset-0 z-30 bg-black/55 backdrop-blur-sm" onClick={() => setMobileOpen(false)}>
              <div className="absolute inset-y-0 left-0 w-[280px] shadow-2xl" onClick={(event) => event.stopPropagation()}>
                {sidebar}
              </div>
            </div>
          ) : null}
        </div>
        <main className="min-w-0">
          <div className="sticky top-0 z-20 hidden border-b border-[#2A2A2E] bg-[#09090B]/75 px-6 py-3 backdrop-blur-xl lg:flex lg:items-center lg:justify-end">
            <div className="relative flex items-center gap-2">
              <IconButton label="Dark mode locked">
                <Moon className="h-4 w-4" />
              </IconButton>
              <IconButton label="Open notifications" onClick={() => setNotificationsOpen((current) => !current)}>
                <Bell className="h-4 w-4" />
              </IconButton>
              {notificationsOpen ? (
                <div className="absolute right-0 top-12 w-80 rounded-2xl border border-[#2A2A2E] bg-[#18181B] p-3 shadow-2xl">
                  <p className="text-sm font-black text-white">Notifications</p>
                  <div className="mt-3 space-y-2">
                    {["High-risk card transaction queued", "MFA policy active", "Device trust review pending"].map((item) => (
                      <div key={item} className="rounded-xl border border-[#2A2A2E] bg-[#111111] p-3 text-sm text-zinc-300">
                        {item}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
