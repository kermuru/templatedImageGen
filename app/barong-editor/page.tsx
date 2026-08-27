import type { Metadata } from "next";
import { BarongEditorDashboard } from "@/domain/barong-editor/components/barong-editor-dashboard";

export const metadata: Metadata = {
  title: "Barong Image Editor — Renaissance Park and Chapels",
};

export default function BarongEditorPage() {
  return <BarongEditorDashboard />;
}
