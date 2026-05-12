import type { Metadata } from "next";
import { LotAvailabilityForm } from "@/domain/lot-availability/components/lot-availability-form";

export const metadata: Metadata = {
  title: "Lot Availability Generator — Renaissance Park and Chapels",
};

export default function LotAvailabilityPage() {
  return <LotAvailabilityForm />;
}
