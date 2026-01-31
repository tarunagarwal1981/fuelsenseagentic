// app/compare/page.tsx - Redirect to home (root app)
import { redirect } from "next/navigation";

export default function CompareRedirect() {
  redirect("/");
}
