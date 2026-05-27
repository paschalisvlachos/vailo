import { useEffect } from 'react';

/** Injects a page-specific web app manifest so “Add to Home Screen” uses this portal URL. */
export function useGuestPwaManifest(propertyName?: string, typeName?: string) {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const shortName = 'Vailo';
    const name =
      propertyName && typeName
        ? `Vailo — ${propertyName} · ${typeName}`
        : propertyName
          ? `Vailo — ${propertyName}`
          : 'Vailo Guest Portal';

    const manifest = {
      name,
      short_name: shortName,
      description: 'Your digital guest portal for a seamless stay.',
      start_url: window.location.href,
      scope: `${window.location.origin}/`,
      display: 'standalone',
      orientation: 'portrait',
      background_color: '#051F26',
      theme_color: '#0B4F5C',
      icons: [
        {
          src: '/vailoLogo.png',
          sizes: '512x512',
          type: 'image/png',
          purpose: 'any maskable',
        },
      ],
    };

    let link = document.querySelector<HTMLLinkElement>('link[data-vailo-manifest]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'manifest';
      link.setAttribute('data-vailo-manifest', 'true');
      document.head.appendChild(link);
    }

    const blob = new Blob([JSON.stringify(manifest)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    link.href = url;

    let appleIcon = document.querySelector<HTMLLinkElement>('link[data-vailo-apple-icon]');
    if (!appleIcon) {
      appleIcon = document.createElement('link');
      appleIcon.rel = 'apple-touch-icon';
      appleIcon.setAttribute('data-vailo-apple-icon', 'true');
      document.head.appendChild(appleIcon);
    }
    appleIcon.href = '/vailoLogo.png';

    let themeMeta = document.querySelector<HTMLMetaElement>('meta[data-vailo-theme]');
    if (!themeMeta) {
      themeMeta = document.createElement('meta');
      themeMeta.name = 'theme-color';
      themeMeta.setAttribute('data-vailo-theme', 'true');
      document.head.appendChild(themeMeta);
    }
    themeMeta.content = '#0B4F5C';

    let appleTitle = document.querySelector<HTMLMetaElement>('meta[data-vailo-apple-title]');
    if (!appleTitle) {
      appleTitle = document.createElement('meta');
      appleTitle.name = 'apple-mobile-web-app-title';
      appleTitle.setAttribute('data-vailo-apple-title', 'true');
      document.head.appendChild(appleTitle);
    }
    appleTitle.content = shortName;

    return () => URL.revokeObjectURL(url);
  }, [propertyName, typeName]);
}
