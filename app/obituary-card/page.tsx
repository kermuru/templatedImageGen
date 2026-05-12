import type { Metadata } from "next";
import { ObituaryCardForm } from "@/domain/obituary-card/components/obituary-card-form";

export const metadata: Metadata = {
  title: "Obituary Card Generator — Renaissance Park and Chapels",
};

export default function ObituaryCardPage() {
  return <ObituaryCardForm />;
}
