interface ConnectionStatusBannerProps {
  tone?: 'warning' | 'danger';
  message: string;
}

export function ConnectionStatusBanner({ tone = 'warning', message }: ConnectionStatusBannerProps) {
  return (
    <section className={`connection-banner connection-banner-${tone}`} role="status" aria-live="polite">
      <p className="eyebrow">Connection status</p>
      <p>{message}</p>
    </section>
  );
}
