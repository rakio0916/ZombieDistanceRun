"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const VIDEO_URL = "/media/game-over/zdr-stamina-game-over-v1.mp4";
const START_TIMEOUT_MS = 4000;

export function GameOverVideo({ onComplete }: { onComplete: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const completedRef = useRef(false);
  const playRequestRef = useRef(0);
  const startTimeoutRef = useRef<number | null>(null);
  const [needsGesture, setNeedsGesture] = useState(false);
  const [muted, setMuted] = useState(false);

  const clearStartTimeout = useCallback(() => {
    if (startTimeoutRef.current === null) return;
    window.clearTimeout(startTimeoutRef.current);
    startTimeoutRef.current = null;
  }, []);

  const complete = useCallback(() => {
    if (completedRef.current) return;
    completedRef.current = true;
    playRequestRef.current += 1;
    clearStartTimeout();
    onComplete();
  }, [clearStartTimeout, onComplete]);

  const play = useCallback(async (withSound: boolean) => {
    const video = videoRef.current;
    if (!video || completedRef.current || document.visibilityState !== "visible") return;
    const request = ++playRequestRef.current;
    clearStartTimeout();
    startTimeoutRef.current = window.setTimeout(() => {
      if (request === playRequestRef.current && !completedRef.current &&
          document.visibilityState === "visible" && video.currentTime === 0) {
        setNeedsGesture(true);
      }
    }, START_TIMEOUT_MS);
    video.muted = !withSound;
    setMuted(!withSound);
    try {
      await video.play();
      if (request === playRequestRef.current) {
        clearStartTimeout();
        setNeedsGesture(false);
      }
    } catch {
      if (request !== playRequestRef.current || document.visibilityState !== "visible") return;
      if (withSound) {
        video.muted = true;
        setMuted(true);
        try {
          await video.play();
          if (request === playRequestRef.current) {
            clearStartTimeout();
            setNeedsGesture(false);
          }
          return;
        } catch {
          // A visible user action can retry playback.
        }
      }
      if (request === playRequestRef.current) {
        clearStartTimeout();
        setNeedsGesture(true);
      }
    }
  }, [clearStartTimeout]);

  useEffect(() => {
    const video = videoRef.current;
    headingRef.current?.focus({ preventScroll: true });
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void play(!videoRef.current?.muted);
      else {
        playRequestRef.current += 1;
        clearStartTimeout();
        videoRef.current?.pause();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    const initialPlayTimer = window.setTimeout(() => { void play(true); }, 0);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.clearTimeout(initialPlayTimer);
      playRequestRef.current += 1;
      clearStartTimeout();
      video?.pause();
    };
  }, [clearStartTimeout, play]);

  return (
    <section className="zdr-game-over" aria-labelledby="zdr-game-over-title">
      <h2 id="zdr-game-over-title" ref={headingRef} tabIndex={-1} className="zdr-visually-hidden">スタミナ切れ。ゲームオーバーの動画を再生します。</h2>
      <video
        ref={videoRef}
        src={VIDEO_URL}
        playsInline
        preload="auto"
        disablePictureInPicture
        aria-label="スタミナ切れのゲームオーバー映像"
        onPlaying={() => {
          clearStartTimeout();
          setNeedsGesture(false);
        }}
        onEnded={complete}
        onError={complete}
      />
      {muted && !needsGesture && <button className="zdr-game-over-sound" type="button" onClick={() => void play(true)}>音声ON</button>}
      {needsGesture && (
        <div className="zdr-game-over-fallback" role="status">
          <p>動画がまだ始まっていません。</p>
          <button type="button" onClick={() => void play(true)}>動画を再生</button>
          <button type="button" onClick={complete}>結果へ進む</button>
        </div>
      )}
    </section>
  );
}
