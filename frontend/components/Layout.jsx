import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import {
  LayoutDashboard,
  Rocket,
  Megaphone,
  Activity,
  Database,
  BarChart3,
  Settings as SettingsIcon,
  Menu,
  X,
} from "lucide-react";
import { api } from "../services/api";
import { useTranslation } from "../lib/i18n/context";
import LanguageSwitcher from "./LanguageSwitcher";

const NAV_KEYS = [
  { code: "00", href: "/dashboard", icon: LayoutDashboard, labelKey: "nav.dashboard", titleKey: "nav.dashboard" },
  { code: "01", href: "/create-event", icon: Rocket, labelKey: "nav.newLaunch", titleKey: "nav.newLaunch" },
  { code: "02", href: "/campaign-builder", icon: Megaphone, labelKey: "nav.campaignBuilder", titleKey: "nav.campaignBuilder" },
  { code: "03", href: "/agent-monitor", icon: Activity, labelKey: "nav.agentMonitor", titleKey: "nav.agentMonitor" },
  { code: "04", href: "/memory-explorer", icon: Database, labelKey: "nav.memoryExplorer", titleKey: "nav.memoryExplorer" },
  { code: "05", href: "/analytics", icon: BarChart3, labelKey: "nav.analytics", titleKey: "nav.analytics" },
  { code: "06", href: "/settings", icon: SettingsIcon, labelKey: "nav.settings", titleKey: "nav.settings" },
];

export default function Layout({ children }) {
  const router = useRouter();
  const { t } = useTranslation();
  const [online, setOnline] = useState(null);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    let mounted = true;
    async function ping() {
      const ok = await api.checkHealth();
      if (mounted) setOnline(ok);
    }
    ping();
    const id = setInterval(ping, 15000);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [router.pathname]);

  const activeItem = NAV_KEYS.find((n) => n.href === router.pathname);

  return (
    <div className="shell">
      <aside className={`sidebar ${mobileOpen ? "open" : ""}`}>
        <div className="brand">
          <div className="brand-mark">
            <Rocket size={18} strokeWidth={2.4} />
          </div>
          <div className="brand-text">
            <span className="brand-title">{t("layout.brandTitle")}</span>
            <span className="brand-sub">{t("layout.brandSub")}</span>
          </div>
        </div>

        <nav className="nav">
          {NAV_KEYS.map((item) => {
            const Icon = item.icon;
            const active = router.pathname === item.href;
            return (
              <Link key={item.href} href={item.href} className={`nav-item ${active ? "active" : ""}`}>
                <span className="nav-code">{item.code}</span>
                <Icon className="nav-icon" strokeWidth={2} />
                <span>{t(item.labelKey)}</span>
              </Link>
            );
          })}
        </nav>

        <div className="sidebar-foot">
          <LanguageSwitcher />
          <div className="system-status">
            <span
              className={`status-dot ${online === null ? "" : online ? "ok" : "error"}`}
            />
            {online === null ? t("layout.checking") : online ? t("layout.backendOnline") : t("layout.backendUnreachable")}
          </div>
        </div>
      </aside>

      {mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 20 }}
        />
      )}

      <div className="main">
        <header className="topbar">
          <div className="row" style={{ gap: 14 }}>
            <button
              className="btn btn-ghost btn-sm mobile-menu-btn"
              onClick={() => setMobileOpen((v) => !v)}
              aria-label="Toggle navigation"
            >
              {mobileOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
            <div>
              <div className="topbar-eyebrow">
                {activeItem ? `${t("layout.step")} ${activeItem.code}` : t("layout.launchControl")}
              </div>
              <div className="topbar-title">{activeItem ? t(activeItem.titleKey) : t("layout.launchControl")}</div>
            </div>
          </div>
          <div className="topbar-actions">
            <LanguageSwitcher />
            <span className={`badge ${online === false ? "error" : "ok"}`}>
              <span className={`status-dot ${online === false ? "error" : "ok"}`} />
              {online === false ? t("layout.systemHold") : t("layout.systemNominal")}
            </span>
          </div>
        </header>
        <main className="content">{children}</main>
      </div>
    </div>
  );
}
