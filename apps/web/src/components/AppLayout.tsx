"use client";

import { TopBar } from "./TopBar";
import { Sidebar } from "./Sidebar";

export function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <TopBar />
      <Sidebar />
      <main className="pt-14 pl-48 min-h-screen transition-all duration-200">
        <div className="p-6 max-w-[1400px]">
          {children}
        </div>
      </main>
    </>
  );
}
