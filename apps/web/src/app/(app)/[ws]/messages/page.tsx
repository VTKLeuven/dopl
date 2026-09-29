import { Suspense } from "react";
import { MessagesHome } from "@/features/messages/messages-home";

export const metadata = { title: "Messages" };

/** Nothing open yet: a short welcome with the ways to start talking. */
export default function MessagesPage() {
  return (
    <Suspense fallback={null}>
      <MessagesHome />
    </Suspense>
  );
}
