import type { Metadata } from "next";
import { MemorialCardV3Form } from "@/domain/memorial-card-v3/components/memorial-card-v3-form";

export const metadata: Metadata = {
  title: "Memorial Card Generator — V3 Green",
  description: "Generate a personalized memorial card image (green botanical template, left column + arch portrait).",
};

export default function MemorialCardV3Page() {
  return <MemorialCardV3Form />;
}
