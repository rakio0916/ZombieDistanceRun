"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { GameClient } from "./game-client";

const TITLE_VIDEO = "/media/title/zdr-title-loop-v1.mp4";
const TITLE_POSTER = "/media/title/zdr-title-poster-v1.webp";

export function GameEntry({
  signedIn,
  displayName,
  signInHref,
  startInSelection,
}: {
  signedIn: boolean;
  displayName: string | null;
  signInHref: string;
  startInSelection: boolean;
}) {
  const [entered, setEntered] = useState(startInSelection);
  const enteredRef = useRef(startInSelection);

  const enterGame = useCallback(() => {
    if (enteredRef.current) return;
    enteredRef.current = true;
    setEntered(true);
  }, []);

  if (!entered) return <VideoTitleScreen onEnter={enterGame} />;

  return (
    <>
      <header className="zdr-topbar">
        <Link href="/" className="zdr-logo">ZDR <span>01</span></Link>
        {signedIn
          ? <span>{displayName}で参加中</span>
          : <a className="zdr-signin" href={signInHref} target="_top">サインインしてランキングに参加</a>}
      </header>
      <GameClient signedIn={signedIn} />
    </>
  );
}

function VideoTitleScreen({ onEnter }: { onEnter: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);
  const showPoster = reduceMotion || videoFailed;

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updateMotion = () => setReduceMotion(media.matches);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Enter" || event.repeat) return;
      event.preventDefault();
      onEnter();
    };
    updateMotion();
    media.addEventListener("change", updateMotion);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      media.removeEventListener("change", updateMotion);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onEnter]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || showPoster) return;
    const play = () => {
      if (document.visibilityState !== "visible") return;
      void video.play().catch(() => setVideoFailed(true));
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") play();
      else video.pause();
    };
    play();
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      video.pause();
    };
  }, [showPoster]);

  return (
    <main className="zdr-title-screen" style={{ "--zdr-title-poster": `url(${TITLE_POSTER})` } as CSSProperties}>
      {showPoster ? (
        <div className="zdr-title-poster" aria-hidden="true" />
      ) : (
        <video
          ref={videoRef}
          className="zdr-title-video"
          src={TITLE_VIDEO}
          poster={TITLE_POSTER}
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          disablePictureInPicture
          aria-hidden="true"
          onCanPlay={() => {
            if (document.visibilityState === "visible") void videoRef.current?.play().catch(() => setVideoFailed(true));
          }}
          onError={() => setVideoFailed(true)}
        />
      )}
      <button className="zdr-title-enter" type="button" onClick={onEnter} aria-label="ゲームスタート">
        <span className="zdr-title-video-frame">
          <strong className="zdr-title-cta">ゲームスタート</strong>
        </span>
      </button>
    </main>
  );
}
