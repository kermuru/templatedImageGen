import type { Metadata } from "next";
import { MemorialCardForm } from "@/domain/memorial-card/components/memorial-card-form";

export const metadata: Metadata = {
  title: "Memorial Card Generator",
  description: "Generate a personalized memorial card image.",
};

export default function MemorialCardPage() {
  return <MemorialCardForm />;
}
