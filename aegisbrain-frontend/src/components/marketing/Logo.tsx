export default function Logo({ size = 28 }: { size?: number }) {
  // A shield split by a horizontal seam: the gate.
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M12 2 20.5 5.4V12c0 4.7-3.5 8.2-8.5 10C7 20.2 3.5 16.7 3.5 12V5.4L12 2Z"
        stroke="#2B54F0"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M3.5 12h17" stroke="#2B54F0" strokeWidth="1.8" />
    </svg>
  );
}