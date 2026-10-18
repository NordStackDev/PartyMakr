"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";

import { isConsumerRoute } from "@/lib/routes";

const BottomNav = dynamic(() =>
  import("@/components/nav/bottom-nav").then((module) => module.BottomNav),
);
const HelpGuide = dynamic(() =>
  import("@/components/help/help-guide").then((module) => module.HelpGuide),
);
const RealtimeProvider = dynamic(() =>
  import("@/components/realtime/realtime-provider").then(
    (module) => module.RealtimeProvider,
  ),
);
const PushNotificationPrompt = dynamic(() =>
  import("@/components/notifications/push-notification-prompt").then(
    (module) => module.PushNotificationPrompt,
  ),
);

export function AppChrome() {
  const pathname = usePathname();
  if (!isConsumerRoute(pathname)) return null;

  return (
    <>
      <BottomNav />
      <HelpGuide />
      <RealtimeProvider />
      <PushNotificationPrompt />
    </>
  );
}
