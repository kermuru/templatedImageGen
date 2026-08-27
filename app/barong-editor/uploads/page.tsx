import type { Metadata } from "next";
import { BarongUploadsPanel } from "@/domain/barong-editor/components/barong-uploads-panel";

export const metadata: Metadata = {
  title: "Portal Uploads — Barong Image Editor",
};

export default function BarongUploadsPage() {
  return <BarongUploadsPanel />;
}
