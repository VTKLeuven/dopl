import { Suspense } from "react";
import { ResetPasswordForm } from "./reset-password-form";

export const metadata = { title: "Reset password" };

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  );
}
