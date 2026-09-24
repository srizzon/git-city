/** Three pixel blocks pulsing in sequence. Inherits the text color. */
export default function PixelSpinner({ size = 6 }: { size?: number }) {
  return (
    <span role="status" aria-label="Loading" className="inline-flex items-center gap-[3px] align-middle">
      {[0, 150, 300].map((delay) => (
        <span
          key={delay}
          className="animate-pulse bg-current motion-reduce:animate-none"
          style={{ width: size, height: size, animationDelay: `${delay}ms`, animationDuration: "900ms" }}
        />
      ))}
    </span>
  );
}

/** Button content while a request is in flight: spinner + a verb ("Inviting"). */
export function Pending({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center justify-center gap-2">
      <PixelSpinner size={5} />
      <span>{label}</span>
    </span>
  );
}
