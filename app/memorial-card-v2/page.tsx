import type { Metadata } from "next";
import { MemorialCardV2Form } from "@/domain/memorial-card-v2/components/memorial-card-v2-form";

export const metadata: Metadata = {
  title: "Memorial Card Generator — V2",
  description: "Generate a personalized memorial card image (portrait-in-arch template).",
};

export default function MemorialCardV2Page() {
  return <MemorialCardV2Form />;
}
