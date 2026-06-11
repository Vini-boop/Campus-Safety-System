/**
 * SidebarShell
 *
 * Shared responsive wrapper used by all three dashboards.
 * - Mobile (< md): sidebar hidden by default, slides in over content via overlay
 * - Desktop (≥ md): sidebar always visible, pushes content
 *
 * Usage:
 *   <SidebarShell sidebar={<MySidebar onClose={() => setSidebarOpen(false)} />} sidebarOpen={open} onOverlayClick={() => setSidebarOpen(false)}>
 *     {mainContent}
 *   </SidebarShell>
 */
import React from 'react';

export default function SidebarShell({ sidebar, sidebarOpen, onOverlayClick, children }) {
    return (
        <div className="flex h-screen w-screen overflow-hidden">
            {/* ── Mobile overlay ──────────────────────────────────────── */}
            {sidebarOpen && (
                <div
                    className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden"
                    onClick={onOverlayClick}
                />
            )}

            {/* ── Sidebar ─────────────────────────────────────────────── */}
            <div
                className={`
          fixed inset-y-0 left-0 z-50 flex flex-col
          transition-transform duration-300 ease-in-out
          md:static md:translate-x-0 md:z-auto md:flex
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
            >
                {sidebar}
            </div>

            {/* ── Main area ───────────────────────────────────────────── */}
            <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
                {children}
            </div>
        </div>
    );
}
