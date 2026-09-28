const CONSUMER_PREFIXES = [
  "/dashboard",
  "/parties",
  "/settings",
  "/notifications",
  "/friends",
  "/messages",
  "/profile",
];

export function isConsumerRoute(pathname: string): boolean {
  return CONSUMER_PREFIXES.some(
    (prefix) =>
      pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}
