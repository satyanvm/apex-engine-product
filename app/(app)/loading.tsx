export default function Loading() {
  return (
    <div className="animate-pulse space-y-4" role="status" aria-label="Loading">
      <div className="h-10 w-56 rounded-md bg-sunken" />
      <div className="h-64 rounded-[10px] bg-sunken" />
    </div>
  );
}
