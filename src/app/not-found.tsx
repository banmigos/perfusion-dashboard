import Link from "next/link";

export default function NotFound() {
  return (
    <div className="max-w-xl">
      <h1 className="font-condensed text-4xl font-semibold text-fg">
        No page here.
      </h1>
      <p className="mt-3 text-sm text-muted">
        The program may have been archived or its address changed. Find it in{" "}
        <Link href="/programs" className="text-accent hover:underline">
          Programs
        </Link>
        , or go back to the{" "}
        <Link href="/" className="text-accent hover:underline">
          overview
        </Link>
        .
      </p>
    </div>
  );
}
