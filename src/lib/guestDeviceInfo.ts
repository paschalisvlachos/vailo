export type GuestDeviceType = 'mobile' | 'tablet' | 'desktop';

export type GuestClientDevice = {
  deviceType: GuestDeviceType;
  osName: string;
  deviceLabel: string;
};

function detectIos(ua: string): boolean {
  return (
    /iPad|iPhone|iPod/.test(ua) ||
    (typeof navigator !== 'undefined' &&
      navigator.platform === 'MacIntel' &&
      navigator.maxTouchPoints > 1)
  );
}

function detectOs(ua: string): string {
  if (detectIos(ua)) return 'iOS';
  if (/Android/.test(ua)) return 'Android';
  if (/Windows/.test(ua)) return 'Windows';
  if (/CrOS/.test(ua)) return 'ChromeOS';
  if (/Mac OS X|Macintosh/.test(ua)) return 'macOS';
  if (/Linux/.test(ua)) return 'Linux';
  return 'Unknown';
}

function detectDeviceType(ua: string): GuestDeviceType {
  if (/iPad|Tablet|PlayBook|Silk/.test(ua)) return 'tablet';
  if (detectIos(ua) && !/iPhone|iPod/.test(ua)) return 'tablet';
  if (/Android/.test(ua) && !/Mobile/.test(ua)) return 'tablet';
  if (/Mobi|iPhone|iPod|Android.*Mobile|Windows Phone/.test(ua)) return 'mobile';
  return 'desktop';
}

function deviceTypeLabel(deviceType: GuestDeviceType): string {
  switch (deviceType) {
    case 'mobile':
      return 'Mobile';
    case 'tablet':
      return 'Tablet';
    default:
      return 'Desktop';
  }
}

export function formatGuestDeviceLabel(deviceType: GuestDeviceType, osName: string): string {
  return `${deviceTypeLabel(deviceType)} · ${osName}`;
}

/** Best-effort device + OS from the browser (sent with guest analytics). */
export function getGuestClientDevice(): GuestClientDevice {
  if (typeof navigator === 'undefined') {
    return {
      deviceType: 'desktop',
      osName: 'Unknown',
      deviceLabel: 'Unknown device',
    };
  }

  const ua = navigator.userAgent;
  const osName = detectOs(ua);
  const deviceType = detectDeviceType(ua);
  return {
    deviceType,
    osName,
    deviceLabel: formatGuestDeviceLabel(deviceType, osName),
  };
}

export type GuestAnalyticsDeviceFields = {
  firstDeviceType?: GuestDeviceType;
  firstOsName?: string;
  firstDeviceLabel?: string;
  lastDeviceType?: GuestDeviceType;
  lastOsName?: string;
  lastDeviceLabel?: string;
};
