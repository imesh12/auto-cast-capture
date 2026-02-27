// src/components/CameraAdminDashboard.jsx
import React, { useEffect, useMemo, useState, useCallback } from "react";
import { DateTime } from "luxon";

import Sidebar from "./Sidebar.jsx";
import Navbar from "./Navbar";
import DashboardCards from "./DashboardCards";
import CameraTable from "./CameraTable";
import CameraMap from "./CameraMap";
import AddCameraModal from "./AddCameraModal";
import ViewCameraModal from "./ViewCameraModal";
import DeleteConfirmModal from "./DeleteConfirmModal";

import CameraStatus from "../pages/CameraStatus";
import FramesPage from "../pages/FramesPage";
import QRCodes from "../pages/QRCodes";
import SettingsPage from "../pages/SettingsPage";
import ReportPage from "../pages/ReportPage.jsx";

import { db } from "../firebase";
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
} from "firebase/firestore";
import { useAuth } from "../context/AuthContext";

/**
 * NOTE ABOUT CAPTURE COUNTS
 * Your Firestore currently stores daily counts as a FLAT field:
 *   "dailyCaptures.2026-01-28": 5
 * (NOT as a map: dailyCaptures: { "2026-01-28": 5 })
 *
 * This component supports BOTH:
 *  - cam.dailyCaptures?.[todayKey]
 *  - cam[`dailyCaptures.${todayKey}`]
 */

function CameraAdminDashboard() {
  const { user, clientId } = useAuth();

  const [isDark, setIsDark] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [activeMenu, setActiveMenu] = useState("dashboard");

  const [cameras, setCameras] = useState([]);

  const [showAddModal, setShowAddModal] = useState(false);
  const [editingCamera, setEditingCamera] = useState(null);

  const [showViewModal, setShowViewModal] = useState(false);
  const [viewCamera, setViewCamera] = useState(null);

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const DEFAULT_PRICE_ID = process.env.REACT_APP_DEFAULT_STRIPE_PRICE_ID;
  if (!DEFAULT_PRICE_ID) {
    throw new Error("REACT_APP_DEFAULT_STRIPE_PRICE_ID is not set");
  }

  // =========================================================
  // Time key (JST) - updates every minute (safe around midnight)
  // =========================================================
  const [todayKey, setTodayKey] = useState(() =>
    DateTime.now().setZone("Asia/Tokyo").toFormat("yyyy-LL-dd")
  );

  useEffect(() => {
    const timer = setInterval(() => {
      setTodayKey(DateTime.now().setZone("Asia/Tokyo").toFormat("yyyy-LL-dd"));
    }, 60 * 1000);
    return () => clearInterval(timer);
  }, []);

  // =========================================================
  // Helpers (production-safe)
  // =========================================================
  const getTodayCountForCam = useCallback(
    (cam) => {
      // A) preferred map format
      const a = cam?.dailyCaptures?.[todayKey];

      // B) current schema: flat field "dailyCaptures.YYYY-MM-DD"
      const b = cam?.[`dailyCaptures.${todayKey}`];

      const v = Number(a ?? b ?? 0);
      return Number.isFinite(v) ? v : 0;
    },
    [todayKey]
  );

  // Payment UI override helpers
  const computeDisplayStatus = useCallback((cam) => {
    if (cam?.paymentStatus !== "active") return "Payment Issue";
    return cam?.status || "Inactive";
  }, []);

  const statusBadgeClass = useCallback((cam) => {
    if (cam?.paymentStatus !== "active") return "bg-red-100 text-red-700";

    switch (cam?.status) {
      case "Active":
        return "bg-green-100 text-green-700";
      case "Offline":
        return "bg-gray-100 text-gray-700";
      case "Maintenance":
        return "bg-yellow-100 text-yellow-700";
      default:
        return "bg-slate-200 text-slate-600";
    }
  }, []);

  // =========================================================
  // Firestore: cameras live list (tenant safe)
  // =========================================================
  useEffect(() => {
    if (!user || !clientId) return;

    const ref = collection(db, "clients", clientId, "cameras");
    const unsub = onSnapshot(
      ref,
      (snapshot) => {
        const list = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
        setCameras(list);
      },
      (err) => console.error("Camera snapshot error:", err)
    );

    return () => unsub();
  }, [user, clientId]);

  // =========================================================
  // Derived camera list (todayCaptures is computed here)
  // =========================================================
  const camerasWithDerivedToday = useMemo(() => {
    return cameras.map((cam) => ({
      ...cam,
      todayCaptures: getTodayCountForCam(cam),
      totalCaptures: Number(cam?.totalCaptures ?? 0) || 0,
      paidCaptures: Number(cam?.paidCaptures ?? 0) || 0,
    }));
  }, [cameras, getTodayCountForCam]);

  // =========================================================
  // Dashboard stats
  // =========================================================
  const stats = useMemo(() => {
    const totalCameras = camerasWithDerivedToday.length;

    const totalCapturesToday = camerasWithDerivedToday.reduce(
      (sum, cam) => sum + (Number(cam?.todayCaptures) || 0),
      0
    );

    const totalRevenue = camerasWithDerivedToday.reduce((sum, cam) => {
      const v = Number(cam?.totalRevenueYen ?? 0);
      return sum + (Number.isFinite(v) ? v : 0);
    }, 0);

    return { totalCameras, totalCapturesToday, totalRevenue };
  }, [camerasWithDerivedToday]);

  // =========================================================
  // CRUD
  // =========================================================
  const handleAddCamera = async (form) => {
    if (!clientId) return;

    try {
      await addDoc(collection(db, "clients", clientId, "cameras"), {
        ...form,

        // Stripe
        priceId: DEFAULT_PRICE_ID,

        // Payment defaults
        paymentStatus: "inactive",
        subscriptionId: null,
        customerId: null,
        cancelAtPeriodEnd: false,

        // Stats defaults
        status: "Inactive",
        todayCaptures: 0, // UI does NOT rely on this
        paidCaptures: 0,
        canceledCaptures: 0,
        totalCaptures: 0,
        totalRevenueYen: 0,
        lastCaptureAt: null,

        createdAt: serverTimestamp(),
      });

      setShowAddModal(false);
    } catch (err) {
      console.error("Add camera failed:", err);
      alert("Failed to add camera");
    }
  };

  const handleUpdateCamera = async (form) => {
    if (!clientId || !editingCamera) return;

    if (editingCamera?.paymentStatus !== "active") {
      alert(
        "Payment not active. Please activate the subscription first.\nお支払い状態がアクティブではありません。"
      );
      return;
    }

    try {
      const ref = doc(db, "clients", clientId, "cameras", editingCamera.id);
      await updateDoc(ref, form);
      setEditingCamera(null);
      setShowAddModal(false);
    } catch (err) {
      console.error("Update failed:", err);
      alert("Update failed");
    }
  };

  const handleConfirmDelete = async () => {
    if (!clientId || !deleteTarget) return;

    try {
      const ref = doc(db, "clients", clientId, "cameras", deleteTarget.id);
      await deleteDoc(ref);
      setDeleteTarget(null);
      setShowDeleteModal(false);
    } catch (err) {
      console.error("Delete failed:", err);
      alert("Delete failed");
    }
  };

  // =========================================================
  // UI handlers
  // =========================================================
  const openAddModal = () => {
    setEditingCamera(null);
    setShowAddModal(true);
  };

  const openEditModal = (cam) => {
    setEditingCamera(cam);
    setShowAddModal(true);
  };

  const openViewModal = (cam) => {
    setViewCamera(cam);
    setShowViewModal(true);
  };

  const openDeleteConfirm = (cam) => {
    setDeleteTarget(cam);
    setShowDeleteModal(true);
  };

  const rootClasses = isDark
    ? "min-h-screen bg-slate-950 text-slate-100"
    : "min-h-screen bg-slate-100 text-slate-900";

  return (
    <div className={rootClasses}>
      <div className="flex min-h-screen">
        <Sidebar
          collapsed={sidebarCollapsed}
          activeMenu={activeMenu}
          onChangeMenu={setActiveMenu}
          isDark={isDark}
        />

        <div className="flex-1 flex flex-col">
          <Navbar
            isDark={isDark}
            setIsDark={setIsDark}
            sidebarCollapsed={sidebarCollapsed}
            setSidebarCollapsed={setSidebarCollapsed}
          />

          <main className="flex-1 px-4 sm:px-6 py-6 overflow-y-auto">
            {activeMenu === "dashboard" && (
              <>
                <DashboardCards stats={stats} />

                <div className="mt-6 flex flex-col lg:flex-row gap-4">
                  <div className="flex-1">
                    <CameraMap cameras={camerasWithDerivedToday} />
                  </div>
                </div>
              </>
            )}

            {activeMenu === "cameras" && (
              <CameraTable
                cameras={camerasWithDerivedToday}
                onOpenAdd={openAddModal}
                onOpenEdit={openEditModal}
                onOpenView={openViewModal}
                onRequestDelete={openDeleteConfirm}
                canEdit={(cam) => cam?.paymentStatus === "active"}
                compact={false}
              />
            )}

            {activeMenu === "camera-status" && <CameraStatus />}
            {activeMenu === "frames" && <FramesPage />}
            {activeMenu === "qr" && <QRCodes />}
            {activeMenu === "settings" && <SettingsPage isDark={isDark} />}
             {activeMenu === "report" && <ReportPage />}

          </main>
        </div>
      </div>

      {/* Modals */}
      {showAddModal && (
        <AddCameraModal
          editing={editingCamera}
          onClose={() => setShowAddModal(false)}
          onSubmit={editingCamera ? handleUpdateCamera : handleAddCamera}
        />
      )}

      {showViewModal && viewCamera && (
        <ViewCameraModal camera={viewCamera} onClose={() => setShowViewModal(false)} />
      )}

      {showDeleteModal && deleteTarget && (
        <DeleteConfirmModal
          camera={deleteTarget}
          onCancel={() => setShowDeleteModal(false)}
          onConfirm={handleConfirmDelete}
        />
      )}
    </div>
  );
}

export default CameraAdminDashboard;
