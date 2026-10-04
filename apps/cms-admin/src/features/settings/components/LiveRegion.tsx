/** A visually hidden, polite status region. Render one per page and feed it `useAnnouncer`. */
export const LiveRegion: React.FC<{ message: string }> = ({ message }) => (
  <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
    {message}
  </div>
);
LiveRegion.displayName = 'LiveRegion';
