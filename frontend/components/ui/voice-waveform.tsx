'use client';

import { useEffect, useRef } from 'react';

const barHeights = [
  5, 8, 12, 16, 20, 14, 9, 17, 23, 18, 12, 7, 5, 9, 14, 19,
  15, 10, 6, 9, 17, 22, 16, 11, 7, 5, 8, 14, 19, 13, 8, 4,
];

interface VoiceWaveformProps {
  className?: string;
  animate?: boolean;
}

export function VoiceWaveform({ className = '', animate = false }: VoiceWaveformProps) {
  const waveformRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const waveform = waveformRef.current;
    if (!animate || !waveform || !('IntersectionObserver' in window)) {
      return;
    }

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let observer: IntersectionObserver | undefined;
    let isIntersecting = false;
    const updatePlayback = () => {
      waveform.classList.toggle('is-active', !reducedMotion.matches && isIntersecting && document.visibilityState === 'visible');
    };
    const stopObserving = () => {
      observer?.disconnect();
      observer = undefined;
      isIntersecting = false;
      document.removeEventListener('visibilitychange', updatePlayback);
      waveform.classList.remove('is-active');
    };
    const syncPreference = () => {
      if (reducedMotion.matches) {
        stopObserving();
        return;
      }

      observer = new IntersectionObserver(([entry], source) => {
        if (source !== observer) return;
        isIntersecting = entry.isIntersecting;
        updatePlayback();
      });
      observer.observe(waveform);
      document.addEventListener('visibilitychange', updatePlayback);
    };

    syncPreference();
    reducedMotion.addEventListener('change', syncPreference);

    return () => {
      reducedMotion.removeEventListener('change', syncPreference);
      stopObserving();
    };
  }, [animate]);

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
