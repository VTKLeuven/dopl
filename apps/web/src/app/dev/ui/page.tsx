import { notFound } from "next/navigation";
import { Gallery } from "./gallery";

export const metadata = { title: "UI gallery" };

export default function DevUiPage() {
  if (process.env.NODE_ENV === "production" && process.env.DOPL_DEV_UI !== "1") notFound();
  return <Gallery />;
}
