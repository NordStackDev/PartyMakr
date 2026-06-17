"use client";

import { useEffect } from "react";

import { markNotificationsRead } from "@/lib/notifications/actions";

/** Marks the user's notifications as read once the list is viewed. */
export function MarkRead() {
  useEffect(() => {
    markNotificationsRead();
  }, []);
  return null;
}
