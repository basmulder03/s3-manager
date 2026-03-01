import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Maximize2, Pause, Play, SkipBack, SkipForward, Volume2, VolumeX } from 'lucide-react';
import styles from '@web/App.module.css';

const formatMediaTime = (seconds: number): string => {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return '0:00';
  }

  const totalSeconds = Math.floor(seconds);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const remainingSeconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
  }

  return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`;
};

interface MediaPreviewPlayerProps {
  mode: 'audio' | 'video';
  mediaUrl: string;
  path: string;
}

export const MediaPreviewPlayer = ({ mode, mediaUrl, path }: MediaPreviewPlayerProps) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const volumeId = useId();
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [paused, setPaused] = useState(true);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);

  const getMediaElement = useCallback(() => {
    return mode === 'audio' ? audioRef.current : videoRef.current;
  }, [mode]);

  useEffect(() => {
    setDuration(0);
    setCurrentTime(0);
    setPaused(true);
    setMuted(false);
    setVolume(1);
  }, [mediaUrl, mode]);

  const syncFromMediaElement = useCallback(() => {
    const mediaElement = getMediaElement();
    if (!mediaElement) {
      return;
    }

    setDuration(Number.isFinite(mediaElement.duration) ? mediaElement.duration : 0);
    setCurrentTime(mediaElement.currentTime);
    setPaused(mediaElement.paused);
    setMuted(mediaElement.muted);
    setVolume(mediaElement.volume);
  }, [getMediaElement]);

  const handlePlayToggle = async () => {
    const mediaElement = getMediaElement();
    if (!mediaElement) {
      return;
    }

    if (mediaElement.paused) {
      try {
        await mediaElement.play();
      } catch {
        setPaused(true);
      }
      return;
    }

    mediaElement.pause();
  };

  const handleSeek = (nextTime: number) => {
    const mediaElement = getMediaElement();
    if (!mediaElement) {
      return;
    }

    mediaElement.currentTime = nextTime;
    setCurrentTime(nextTime);
  };

  const handleToggleMute = () => {
    const mediaElement = getMediaElement();
    if (!mediaElement) {
      return;
    }

    mediaElement.muted = !mediaElement.muted;
    setMuted(mediaElement.muted);
  };

  const handleVolumeChange = (nextVolume: number) => {
    const mediaElement = getMediaElement();
    if (!mediaElement) {
      return;
    }

    mediaElement.volume = nextVolume;
    mediaElement.muted = nextVolume === 0;
    setVolume(nextVolume);
    setMuted(mediaElement.muted);
  };

  const handleFullscreenToggle = () => {
    if (mode !== 'video') {
      return;
    }

    const mediaElement = videoRef.current;
    if (!mediaElement) {
      return;
    }

    if (document.fullscreenElement === mediaElement) {
      void document.exitFullscreen();
      return;
    }

    void mediaElement.requestFullscreen();
  };

  const hasKnownDuration = duration > 0;
  const seekMax = hasKnownDuration ? duration : 100;
  const seekValue = hasKnownDuration ? Math.min(currentTime, duration) : 0;
  const controlsClassName =
    mode === 'video'
      ? `${styles.filePreviewMediaControls} ${styles.filePreviewMediaControlsOverlay}`
      : styles.filePreviewMediaControls;
  const controls = (
    <div className={controlsClassName}>
      <p className={styles.filePreviewMediaLabel}>{path}</p>
      <div className={styles.filePreviewMediaTimelineRow}>
        <span>{formatMediaTime(currentTime)}</span>
        <input
          className={styles.filePreviewMediaTimeline}
          type="range"
          min={0}
          max={seekMax}
          step={0.1}
          value={seekValue}
          onChange={(event) => handleSeek(Number(event.target.value))}
          disabled={!hasKnownDuration}
          aria-label="Playback position"
        />
        <span>{formatMediaTime(duration)}</span>
      </div>
      <div className={styles.filePreviewMediaControlsRow}>
        <div className={styles.filePreviewMediaControlGroup}>
          <button
            type="button"
            className={styles.filePreviewMediaButton}
            onClick={() => handleSeek(Math.max(0, currentTime - 10))}
            aria-label="Rewind 10 seconds"
            title="Rewind 10 seconds"
          >
            <SkipBack className={styles.filePreviewMediaButtonIcon} aria-hidden="true" />
          </button>
          <button
            type="button"
            className={`${styles.filePreviewMediaButton} ${styles.filePreviewMediaButtonPrimary}`}
            onClick={() => {
              void handlePlayToggle();
            }}
            aria-label={paused ? 'Play media' : 'Pause media'}
            title={paused ? 'Play' : 'Pause'}
          >
            {paused ? (
              <Play className={styles.filePreviewMediaButtonIcon} aria-hidden="true" />
            ) : (
              <Pause className={styles.filePreviewMediaButtonIcon} aria-hidden="true" />
            )}
          </button>
          <button
            type="button"
            className={styles.filePreviewMediaButton}
            onClick={() => handleSeek(Math.min(duration, currentTime + 10))}
            aria-label="Forward 10 seconds"
            disabled={!hasKnownDuration}
            title="Forward 10 seconds"
          >
            <SkipForward className={styles.filePreviewMediaButtonIcon} aria-hidden="true" />
          </button>
        </div>
        <div className={styles.filePreviewMediaControlGroup}>
          <button
            type="button"
            className={styles.filePreviewMediaButton}
            onClick={handleToggleMute}
            aria-label={muted ? 'Unmute media' : 'Mute media'}
            title={muted ? 'Unmute' : 'Mute'}
          >
            {muted ? (
              <VolumeX className={styles.filePreviewMediaButtonIcon} aria-hidden="true" />
            ) : (
              <Volume2 className={styles.filePreviewMediaButtonIcon} aria-hidden="true" />
            )}
          </button>
          <label className={styles.filePreviewMediaVolume} htmlFor={volumeId}>
            {muted || volume === 0 ? (
              <VolumeX className={styles.filePreviewMediaButtonIcon} aria-hidden="true" />
            ) : (
              <Volume2 className={styles.filePreviewMediaButtonIcon} aria-hidden="true" />
            )}
            <input
              id={volumeId}
              className={styles.filePreviewMediaVolumeInput}
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={volume}
              onChange={(event) => handleVolumeChange(Number(event.target.value))}
              aria-label="Volume"
            />
          </label>
          {mode === 'video' ? (
            <button
              type="button"
              className={styles.filePreviewMediaButton}
              onClick={handleFullscreenToggle}
              aria-label="Toggle fullscreen"
              title="Fullscreen"
            >
              <Maximize2 className={styles.filePreviewMediaButtonIcon} aria-hidden="true" />
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );

  return (
    <div className={styles.filePreviewMediaPlayer}>
      {mode === 'audio' ? (
        <>
          <audio
            ref={audioRef}
            className={`${styles.filePreviewMedia} ${styles.filePreviewMediaAudio}`}
            src={mediaUrl}
            preload="metadata"
            onLoadedMetadata={syncFromMediaElement}
            onTimeUpdate={syncFromMediaElement}
            onPlay={syncFromMediaElement}
            onPause={syncFromMediaElement}
            onVolumeChange={syncFromMediaElement}
            onEnded={syncFromMediaElement}
          >
            Your browser does not support audio playback.
          </audio>
          {controls}
        </>
      ) : (
        <div className={styles.filePreviewMediaFrame}>
          <video
            ref={videoRef}
            className={styles.filePreviewMedia}
            src={mediaUrl}
            preload="metadata"
            playsInline
            onLoadedMetadata={syncFromMediaElement}
            onTimeUpdate={syncFromMediaElement}
            onPlay={syncFromMediaElement}
            onPause={syncFromMediaElement}
            onVolumeChange={syncFromMediaElement}
            onEnded={syncFromMediaElement}
          >
            Your browser does not support video playback.
          </video>
          {controls}
        </div>
      )}
    </div>
  );
};
