// src/components/Sidebar.jsx
import React from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

function Sidebar({ collapsed, activeMenu, onChangeMenu, isDark }) {
  const bg =
    isDark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200";

  return (
    <aside
      className={`${bg} hidden sm:flex flex-col border-r transition-all duration-200 ${
        collapsed ? "w-18 md:w-20" : "w-60"
      }`}
    >
      {/* Logo */}
      <div className="flex items-center gap-2 px-4 py-4 border-b border-slate-700/20">
        <i className="bx bxs-smile bx-md text-blue-500" />
        {!collapsed && (
          <span className="font-bold text-lg tracking-tight">AutoCaster - View</span>
        )}
      </div>

      {/* Menu */}
      <nav className="flex-1 flex flex-col justify-between py-4">
        {/* MAIN */}
        <ul className="space-y-1">
          <SidebarItem
            icon="bxs-dashboard"
            label="ダッシュボード"
            menuKey="dashboard"
            activeMenu={activeMenu}
            collapsed={collapsed}
            onChangeMenu={onChangeMenu}
          />

          <SidebarItem
            icon="bxs-camera"
            label="カメラ 追加"
            menuKey="cameras"
            activeMenu={activeMenu}
            collapsed={collapsed}
            onChangeMenu={onChangeMenu}
          />

          <SidebarItem
            icon="bx-credit-card"
            label="カメラ ステータス"
            menuKey="camera-status"
            activeMenu={activeMenu}
            collapsed={collapsed}
            onChangeMenu={onChangeMenu}
          />

          {/* FRAMES */}
          <SidebarItem
            icon="bx-image"
            label="フレーム 管理"
            menuKey="frames"
            activeMenu={activeMenu}
            collapsed={collapsed}
            onChangeMenu={onChangeMenu}
          />

          {/* ✅ NEW: QR CODES */}
          <SidebarItem
            icon="bx-qr"
            label="QR コード"
            menuKey="qr"
            activeMenu={activeMenu}
            collapsed={collapsed}
            onChangeMenu={onChangeMenu}
          />

          {/* ✅ NEW: report */}
          <SidebarItem
            icon="bx-report"
            label="レポート"
            menuKey="report"
            activeMenu={activeMenu}
            collapsed={collapsed}
            onChangeMenu={onChangeMenu}
          />
        </ul>

        {/* BOTTOM */}
        <ul className="space-y-1 border-t border-slate-700/20 pt-4 mt-4">
          <SidebarItem
            icon="bxs-cog"
            label="設定"
            menuKey="settings"
            activeMenu={activeMenu}
            collapsed={collapsed}
            onChangeMenu={onChangeMenu}
          />

          {/* Logout */}
          <SidebarItem
            icon="bx-power-off"
            label="Logout"
            menuKey="logout"
            collapsed={collapsed}
            danger
            logoutButton
          />
        </ul>
      </nav>
    </aside>
  );
}

function SidebarItem({
  icon,
  label,
  menuKey,
  activeMenu,
  collapsed,
  onChangeMenu,
  danger,
  logoutButton,
}) {
  const isActive = activeMenu === menuKey;
  const { logout } = useAuth();
  const navigate = useNavigate();
  const clientId = localStorage.getItem("clientId");

  const handleClick = async () => {
    if (logoutButton) {
      try {
        await logout();
      } finally {
        navigate(`/${clientId}/login`);
      }
    } else {
      onChangeMenu(menuKey);
    }
  };

  return (
    <li>
      <button
        onClick={handleClick}
        className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl transition-colors ${
          isActive
            ? "bg-blue-50 text-blue-600 dark:bg-blue-900/40 dark:text-blue-300"
            : danger
            ? "text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30"
            : "hover:bg-slate-100 dark:hover:bg-slate-800"
        }`}
      >
        <i className={`bx ${icon} text-xl min-w-[1.75rem]`} />
        {!collapsed && <span className="text-sm">{label}</span>}
      </button>
    </li>
  );
}

export default Sidebar;
