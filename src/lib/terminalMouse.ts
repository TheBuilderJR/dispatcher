function getPlatform(platform?: string): string {
  if (platform !== undefined) {
    return platform;
  }
  if (typeof navigator === "undefined") {
    return "";
  }
  return navigator.platform;
}

export function isLinkOpenModifierPressed(
  event: Pick<MouseEvent, "metaKey" | "ctrlKey">,
  platform?: string
): boolean {
  const resolvedPlatform = getPlatform(platform);
  return resolvedPlatform.startsWith("Mac") ? event.metaKey : event.ctrlKey;
}

export function shouldSyncTmuxFocusOnMouseDown(
  event: Pick<MouseEvent, "button" | "metaKey" | "ctrlKey">,
  platform?: string
): boolean {
  return event.button === 0 && !isLinkOpenModifierPressed(event, platform);
}
