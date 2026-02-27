import React, { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";

function Navbar({
  isDark,
  setIsDark,
  sidebarCollapsed,
  setSidebarCollapsed,

  // ✅ add these (default true)
  showSearch = true,
  showDarkMode = true,
  showNotification = true,
  showProfile = true,
}) {
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const navigate = useNavigate();

  const notificationRef = useRef(null);
  const profileRef = useRef(null);

  const bg = isDark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200";

  useEffect(() => {
    function handleClickOutside(e) {
      if (notificationRef.current && !notificationRef.current.contains(e.target)) {
        setNotificationOpen(false);
      }
      if (profileRef.current && !profileRef.current.contains(e.target)) {
        setProfileOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <header className={`${bg} sticky top-0 z-20 border-b flex items-center gap-4 px-4 sm:px-6 h-14`}>
      {/* sidebar toggle */}
      <button
        type="button"
        className="inline-flex items-center justify-center rounded-md p-2 hover:bg-slate-200/60 dark:hover:bg-slate-800/80"
        onClick={() => setSidebarCollapsed((prev) => !prev)}
      >
        <i className="bx bx-menu text-xl" />
      </button>

      {/* categories link */}
      <a
        href="#"
        className={`hidden md:inline text-sm font-medium ${
          isDark ? "text-slate-200" : "text-slate-700"
        } hover:text-blue-500`}
      >
        Categories
      </a>

      {/* ✅ search (hidden if showSearch is false) */}
      
      {/* ✅ if search is hidden, keep spacing nice */}
      {!showSearch && <div className="ml-auto" />}

      {/* ✅ dark mode toggle */}
     

      {/* ✅ notification */}
     

      {/* ✅ profile */}
      
    </header>
  );
}

export default Navbar;
