export default function LoadingShell() {
  return (
    <div className="loading-shell" role="status" aria-label="Loading league content">
      <p>Getting the court ready…</p>
      <div aria-hidden="true">
        <div className="skeleton skeleton-heading" />
        <div className="skeleton skeleton-subheading" />
        <div className="skeleton skeleton-hero" />
        <div className="skeleton-grid">{[0, 1, 2, 3].map(index => <div className="skeleton skeleton-card" key={index} />)}</div>
      </div>
    </div>
  );
}
