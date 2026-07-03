import { useCallback, useEffect, useState } from 'react';
import { Download, Loader2, QrCode } from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import {
  VAILO_MARKETING_SITE_URL,
  VAILO_QR_CENTER_LOGO_PATH,
  downloadVailoMarketingQrCode,
  generateQrCodePngDataUrl,
  resolvePublicAsset,
} from '../../lib/guestPortalQrCode';
import { AdminButton, AdminCard } from './AdminPageHeader';

const PREVIEW_SIZE = 280;

export default function PlatformMarketingQrPanel() {
  const toast = useToast();
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(true);
  const [downloading, setDownloading] = useState<'standard' | 'print' | null>(null);

  const logoUrl = resolvePublicAsset(VAILO_QR_CENTER_LOGO_PATH);

  const loadPreview = useCallback(async () => {
    setLoadingPreview(true);
    try {
      const dataUrl = await generateQrCodePngDataUrl(VAILO_MARKETING_SITE_URL, {
        width: PREVIEW_SIZE * 2,
        centerLogoUrl: logoUrl,
      });
      setPreviewUrl(dataUrl);
    } catch (error) {
      console.error(error);
      toast.error('Could not generate QR preview.');
      setPreviewUrl(null);
    } finally {
      setLoadingPreview(false);
    }
  }, [logoUrl, toast]);

  useEffect(() => {
    void loadPreview();
  }, [loadPreview]);

  const handleDownload = async (size: 'standard' | 'print') => {
    setDownloading(size);
    try {
      await downloadVailoMarketingQrCode({
        width: size === 'print' ? 2048 : 1024,
        centerLogoUrl: logoUrl,
      });
      toast.success('QR code downloaded.');
    } catch (error) {
      console.error(error);
      toast.error('Failed to download QR code.');
    } finally {
      setDownloading(null);
    }
  };

  return (
    <AdminCard className="overflow-hidden">
      <div className="p-6 sm:p-8">
        <div className="flex flex-col lg:flex-row gap-8 lg:gap-12">
          <div className="shrink-0 flex flex-col items-center">
            <div className="w-[280px] h-[280px] rounded-2xl border border-gray-100 bg-white shadow-sm flex items-center justify-center p-4">
              {loadingPreview ? (
                <Loader2 size={32} className="animate-spin text-vailo-teal" />
              ) : previewUrl ? (
                <img
                  src={previewUrl}
                  alt={`QR code for ${VAILO_MARKETING_SITE_URL}`}
                  className="w-full h-full object-contain"
                  width={PREVIEW_SIZE}
                  height={PREVIEW_SIZE}
                />
              ) : (
                <QrCode size={48} className="text-gray-300" />
              )}
            </div>
            <p className="text-xs text-gray-500 mt-3 text-center max-w-[280px]">
              Preview with Vailo mark centered (high error correction for reliable scanning).
            </p>
          </div>

          <div className="min-w-0 flex-1 space-y-5">
            <div>
              <h3 className="text-lg font-bold text-vailo-dark">Marketing QR code</h3>
              <p className="text-sm text-gray-600 mt-1 leading-relaxed">
                Download a print-ready QR code that links to{' '}
                <a
                  href={VAILO_MARKETING_SITE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-vailo-teal font-semibold hover:underline"
                >
                  {VAILO_MARKETING_SITE_URL}
                </a>
                . Use it on brochures, signage, or business cards.
              </p>
            </div>

            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div className="rounded-xl bg-vailo-surface-elevated/60 px-4 py-3">
                <dt className="text-xs font-bold uppercase tracking-wide text-gray-500">Target URL</dt>
                <dd className="mt-1 font-mono text-vailo-dark break-all">{VAILO_MARKETING_SITE_URL}</dd>
              </div>
              <div className="rounded-xl bg-vailo-surface-elevated/60 px-4 py-3">
                <dt className="text-xs font-bold uppercase tracking-wide text-gray-500">Center logo</dt>
                <dd className="mt-1 text-vailo-dark">V.png</dd>
              </div>
            </dl>

            <div className="flex flex-col sm:flex-row flex-wrap gap-3">
              <AdminButton
                type="button"
                onClick={() => void handleDownload('standard')}
                disabled={Boolean(downloading) || loadingPreview}
              >
                {downloading === 'standard' ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Download size={16} />
                )}
                Download PNG (1024px)
              </AdminButton>
              <AdminButton
                type="button"
                variant="secondary"
                onClick={() => void handleDownload('print')}
                disabled={Boolean(downloading) || loadingPreview}
              >
                {downloading === 'print' ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Download size={16} />
                )}
                Download print (2048px)
              </AdminButton>
            </div>
          </div>
        </div>
      </div>
    </AdminCard>
  );
}
