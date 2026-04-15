import TGSidebar from "@/components/truly-govern/shared/TGSidebar";
import TGTopbar from "@/components/truly-govern/shared/TGTopbar";

export default function TrulyGovernLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden bg-neutral-50">
      <TGSidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <TGTopbar />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
