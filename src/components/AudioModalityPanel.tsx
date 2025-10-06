import { useMemo } from 'react';

const DEFAULT_AUDIO_MODALITY_URL = 'https://voxa-pages.pages.dev/';

export function AudioModalityPanel() {
  const targetUrl = useMemo(() => {
    const envValue = import.meta.env?.VITE_AUDIO_MODALITY_URL;
    return typeof envValue === 'string' && envValue.trim().length > 0 ? envValue : DEFAULT_AUDIO_MODALITY_URL;
  }, []);

  return (
    <section className="audio-modality" aria-label="Audio Modality">
      <div className="audio-modality__frame" role="presentation">
        <iframe
          src={targetUrl}
          title="Audio Modality workspace"
          allow="microphone; clipboard-write; autoplay"
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
        >
          Your browser does not support embedded iframes. Open the audio workspace in a new tab:
          <a href={targetUrl}>Open Audio Modality</a>
        </iframe>
      </div>
      <footer className="audio-modality__footer">
        <a className="button secondary" href={targetUrl} target="_blank" rel="noreferrer">
          Open in new tab
        </a>
      </footer>
    </section>
  );
}

export default AudioModalityPanel;
