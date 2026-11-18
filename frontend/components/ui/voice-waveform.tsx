'use client';

import { useEffect, useRef } from 'react';

const barHeights = [
  5, 8, 12, 16, 20, 14, 9, 17, 23, 18, 12, 7, 5, 9, 14, 19,
  15, 10, 6, 9, 17, 22, 16, 11, 7, 5, 8, 14, 19, 13, 8, 4,
];

interface VoiceWaveformProps {
  className?: string;
}

export function VoiceWaveform({ className = '' }: VoiceWaveformProps) {
  const waveformRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const waveform = waveformRef.current;
    if (!waveform || !('IntersectionObserver' in window)) {
      return;
    }

    let isIntersecting = false;
    const updatePlayback = () => {
      waveform.classList.toggle('is-active', isIntersecting && document.visibilityState === 'visible');
    };
    const observer = new IntersectionObserver(([entry]) => {
      isIntersecting = entry.isIntersecting;
      updatePlayback();
    });

    observer.observe(waveform);
    document.addEventListener('visibilitychange', updatePlayback);

    return () => {
      observer.disconnect();
      document.removeEventListener('visibilitychange', updatePlayback);
    };
  }, []);

  return (
    <div ref={waveformRef} aria-hidden="true" className={`voice-waveform ${className}`.trim()}>
      {barHeights.map((height, index) => (
        <span
          key={index}
          className={`voice-waveform__bar ${index % 8 === 2 || index % 8 === 6 ? 'voice-waveform__bar--accent' : ''}`}
          style={{
            height,
            animationDelay: `-${(index % 12) * 0.12}s`,
          }}
        />
      ))}
    </div>
  );
}
