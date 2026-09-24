import type { Metadata } from "next";
import { MultiScreen } from "@/components/screens/multi-screen";

export const metadata: Metadata = { title: "Multi-écran" };

/** Espace vidéo : 1 à 4 lecteurs YouTube côte à côte. */
export default function ScreensPage() {
  return <MultiScreen />;
}
