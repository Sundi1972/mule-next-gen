/** The eye-slash: hidden from everyone else. */
export function EyeOff({ size = 10, strokeWidth = 2.4 }: { size?: number; strokeWidth?: number }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.7 5.1A10.7 10.7 0 0 1 21.9 11.7a1 1 0 0 1 0 .7 10.7 10.7 0 0 1-1.4 2.5" />
      <path d="M14.1 14.2a3 3 0 0 1-4.2-4.2" />
      <path d="M17.5 17.5A10.7 10.7 0 0 1 2.1 12.3a1 1 0 0 1 0-.7 10.7 10.7 0 0 1 4.4-5.1" />
      <path d="M2 2l20 20" />
    </svg>
  );
}

/** Only you see this: the eye-slash, with its words unless `text` is empty, when a screen reader still hears them. */
export function OnlyYou({ text = 'Only you' }: { text?: string }) {
  return (
    <span
      className="inline-flex items-center gap-0.5 rounded-chip bg-holo-soft px-1 text-[10px] font-semibold leading-4 text-holo @min-[1100px]/shell:text-xs"
      {...(!text ? { role: 'img', 'aria-label': 'Only you see this' } : {})}
    >
      <EyeOff />
      {text}
    </span>
  );
}
