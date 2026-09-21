"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const VIDEO_URL = "/media/game-over/zdr-stamina-game-over-v1.mp4";

export function GameOverVideo({ onComplete }: { onComplete: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const completedRef = useRef(false);
  const startedRef = useRef(false);
  const [needsGesture, setNeedsGesture] = useState(false);
  const [muted, setMuted] = useState(false);

  const complete = useCallback(() => {
    if (completedRef.current) return;
    completedRef.current = true;
    onComplete();
  }, [onComplete]);

  const play = useCallback(async (withSound: boolean) => {
    const video = videoRef.current;
    if (!video || completedRef.current || document.visibilityState !== "visible") return;
    video.muted = !withSound;
    setMuted(!withSound);
    try {
      await video.play();
      setNeedsGesture(false);
    } catch {
      if (withSound) {
        video.muted = true;
        setMuted(true);
        try {
          await video.play();
          setNeedsGesture(false);
          return;
        } catch {
          // A visible user action can retry playback.
        }
      }
      setNeedsGesture(true);
    }
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    headingRef.current?.focus({ preventScroll: true });
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void play(!videoRef.current?.muted);
      else videoRef.current?.pause();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      video?.pause();
    };
  }, [play]);

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
        onCanPlay={() => {
          if (startedRef.current) return;
          startedRef.current = true;
          void play(true);
        }}
        onEnded={complete}
        onError={complete}
      />
      {muted && !needsGesture && <button className="zdr-game-over-sound" type="button" onClick={() => void play(true)}>音声ON</button>}
      {needsGesture && (
        <div className="zdr-game-over-fallback" role="status">
          <p>動画の再生を開始できませんでした。</p>
          <button type="button" onClick={() => void play(true)}>動画を再生</button>
          <button type="button" onClick={complete}>結果へ進む</button>
        </div>
      )}
    </section>
  );
}
