import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/user";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  return <>{children}</>;
}
