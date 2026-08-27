import type { Metadata } from "next";
import { MemorialCardV2CenterForm } from "@/domain/memorial-card-v2-center/components/memorial-card-v2-center-form";

export const metadata: Metadata = {
  title: "Memorial Card Generator — V2 Center",
  description: "Generate a personalized memorial card image (centered arch template).",
};

export default function MemorialCardV2CenterPage() {
  return <MemorialCardV2CenterForm />;
}
