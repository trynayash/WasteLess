import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, Camera, LoaderCircle, SwitchCamera, X } from 'lucide-react';
import { resizeImageFromSource, type MediaType } from '@/lib/image';

type FacingMode = 'environment' | 'user';

type CameraCaptureProps = {
  open: boolean;
  onClose: () => void;
  onCapture: (payload: { image: string; media_type: MediaType; filename: string }) => void;
  onError: (message: string) => void;
};

function cameraErrorMessage(error: unknown): string {
  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
      return 'Camera access was blocked. Allow camera permission in your browser settings, or upload an image instead.';
    }
    if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
      return 'No camera was found on this device. Upload an image instead.';
    }
    if (error.name === 'NotReadableError') {
      return 'The camera is already in use by another app. Close it and try again.';
    }
    if (error.name === 'SecurityError') {
      return 'Camera access needs a secure connection (HTTPS). Upload an image instead.';
    }
  }
  return 'The camera could not be opened. Upload an image instead.';
}

export function CameraCapture({ open, onClose, onCapture, onError }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [facingMode, setFacingMode] = useState<FacingMode>('environment');
  const [status, setStatus] = useState<'idle' | 'starting' | 'ready' | 'capturing'>('idle');
  const [error, setError] = useState<string | null>(null);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const startCamera = useCallback(async (facing: FacingMode) => {
    if (!navigator.mediaDevices?.getUserMedia) {
      const message = 'This browser does not support live camera capture. Upload an image instead.';
      setError(message);
      onError(message);
      return;
    }

    stopStream();
    setStatus('starting');
    setError(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: facing },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) {
        stopStream();
        return;
      }
      video.srcObject = stream;
      await video.play();
      setStatus('ready');
    } catch (err) {
      const message = cameraErrorMessage(err);
      setError(message);
      setStatus('idle');
      onError(message);
    }
  }, [onError, stopStream]);

  useEffect(() => {
    if (!open) {
      stopStream();
      setStatus('idle');
      setError(null);
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    void startCamera(facingMode);

    return () => {
      document.body.style.overflow = previousOverflow;
      stopStream();
    };
  }, [open, facingMode, startCamera, stopStream]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  const flipCamera = () => {
    setFacingMode((current) => (current === 'environment' ? 'user' : 'environment'));
  };

  const capturePhoto = async () => {
    const video = videoRef.current;
    if (!video || status !== 'ready' || video.videoWidth === 0) return;

    setStatus('capturing');
    try {
      const prepared = resizeImageFromSource(video, video.videoWidth, video.videoHeight);
      onCapture({
        ...prepared,
        filename: `camera-${new Date().toISOString().replace(/[:.]/g, '-')}.jpg`,
      });
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'The photo could not be captured.';
      setError(message);
      onError(message);
      setStatus('ready');
    }
  };

  if (!open) return null;

  return (
    <div
      className="camera-overlay fixed inset-0 z-50 flex flex-col bg-black/95 text-white"
      role="dialog"
      aria-modal="true"
      aria-labelledby="camera-title"
      data-testid="camera-overlay"
    >
      <header className="safe-top flex items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <div>
          <p id="camera-title" className="text-sm font-semibold">
            Take a photo
          </p>
          <p className="text-xs text-white/70">Allow camera access when your browser asks.</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close camera"
          className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-white/10 transition-colors hover:bg-white/20"
        >
          <X size={20} />
        </button>
      </header>

      <div className="relative mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 pb-4 sm:px-6">
        <div className="relative flex min-h-[45dvh] flex-1 items-center justify-center overflow-hidden rounded-2xl bg-black sm:min-h-[52dvh]">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="max-h-full w-full object-contain"
            data-testid="camera-preview"
          />

          {status === 'starting' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/60">
              <LoaderCircle size={28} className="animate-spin" />
              <p className="text-sm text-white/80">Opening camera…</p>
            </div>
          )}

          {error && (
            <div className="absolute inset-x-4 bottom-4 flex items-start gap-2 rounded-xl border border-red-400/40 bg-red-950/80 px-3 py-3 text-sm">
              <AlertCircle size={16} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        <div className="safe-bottom mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            onClick={flipCamera}
            disabled={status === 'starting' || status === 'capturing'}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/20 px-4 text-sm font-semibold transition-colors hover:bg-white/10 disabled:opacity-50"
          >
            <SwitchCamera size={18} /> Flip camera
          </button>

          <button
            type="button"
            onClick={() => void capturePhoto()}
            disabled={status !== 'ready'}
            data-testid="button-capture-photo"
            className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-6 text-base font-semibold text-primary-foreground shadow-lg disabled:cursor-not-allowed disabled:opacity-50 sm:max-w-xs sm:flex-none"
          >
            {status === 'capturing' ? (
              <>
                <LoaderCircle size={18} className="animate-spin" /> Saving
              </>
            ) : (
              <>
                <Camera size={18} /> Capture photo
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
