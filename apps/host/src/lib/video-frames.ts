/**
 * Extracts representative keyframes from a video File as JPEG Files.
 * Operates client-side via native HTML5 <video> and <canvas>, requiring no external binaries.
 */
export async function extractVideoFrames(
  file: File,
  frameCount = 3,
  maxSide = 1280
): Promise<File[]> {
  return new Promise((resolve, reject) => {
    if (typeof document === 'undefined') {
      return reject(new Error('Video frame extraction requires a browser/DOM environment.'));
    }

    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'auto';
    video.muted = true;
    video.playsInline = true;
    video.src = url;

    let cleaned = false;
    const cleanUp = () => {
      if (cleaned) return;
      cleaned = true;
      URL.revokeObjectURL(url);
      video.removeAttribute('src');
      video.load();
      video.remove();
    };

    const timeout = setTimeout(() => {
      cleanUp();
      reject(new Error('Video frame extraction timed out after 30 seconds.'));
    }, 30000);

    video.onerror = () => {
      clearTimeout(timeout);
      cleanUp();
      reject(new Error('Could not read video file. Format may not be supported by the browser engine.'));
    };

    video.onloadedmetadata = async () => {
      try {
        const duration = video.duration;
        if (!Number.isFinite(duration) || duration <= 0) {
          clearTimeout(timeout);
          cleanUp();
          throw new Error('Video duration could not be determined.');
        }

        const count = Math.min(Math.max(1, frameCount), 4);
        const timestamps: number[] = [];
        for (let i = 0; i < count; i++) {
          const frac = (i + 0.5) / count;
          timestamps.push(Math.max(0.1, Math.min(duration - 0.1, duration * frac)));
        }

        const canvas = document.createElement('canvas');
        const origW = video.videoWidth || 640;
        const origH = video.videoHeight || 360;
        const scale = Math.min(1, maxSide / Math.max(origW, origH));
        canvas.width = Math.max(1, Math.round(origW * scale));
        canvas.height = Math.max(1, Math.round(origH * scale));
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          clearTimeout(timeout);
          cleanUp();
          throw new Error('Canvas 2D context unavailable.');
        }

        const frames: File[] = [];
        const baseName = file.name.replace(/\.[^.]+$/, '');

        for (let i = 0; i < timestamps.length; i++) {
          const time = timestamps[i];
          await new Promise<void>((resSeek) => {
            const onSeek = () => {
              video.removeEventListener('seeked', onSeek);
              resSeek();
            };
            video.addEventListener('seeked', onSeek);
            video.currentTime = time;
          });

          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const blob = await new Promise<Blob | null>((resBlob) =>
            canvas.toBlob(resBlob, 'image/jpeg', 0.85)
          );

          if (blob) {
            const mm = Math.floor(time / 60);
            const ss = Math.floor(time % 60);
            const stamp = `${mm}m${ss < 10 ? '0' : ''}${ss}s`;
            const frameFile = new File([blob], `${baseName}_${stamp}.jpg`, {
              type: 'image/jpeg',
            });
            frames.push(frameFile);
          }
        }

        clearTimeout(timeout);
        cleanUp();
        resolve(frames);
      } catch (err) {
        clearTimeout(timeout);
        cleanUp();
        reject(err);
      }
    };
  });
}
