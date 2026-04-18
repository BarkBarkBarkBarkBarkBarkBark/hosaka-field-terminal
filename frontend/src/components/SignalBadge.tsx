type Props = { label: string };

export function SignalBadge({ label }: Props) {
  return (
    <span className="signal-badge" title="signal status">
      <span className="signal-dot" aria-hidden />
      <span className="signal-label">{label}</span>
    </span>
  );
}
