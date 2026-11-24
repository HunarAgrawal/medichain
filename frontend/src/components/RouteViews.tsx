import { Link, isRouteErrorResponse, useRouteError } from "react-router";

import { buttonClass } from "./ui/classes";
import { errorText } from "../lib/errors";

export function NotFound({
  message = "This page does not exist or you do not have access to it.",
}) {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <h1 className="text-ink-strong font-serif text-4xl tracking-[-0.02em]">Page not found</h1>
      <p className="text-muted mt-3 text-sm">{message}</p>
      <Link to="/" className={`${buttonClass("secondary")} mt-6`}>
        Go to Medichain
      </Link>
    </div>
  );
}

export function RouteError() {
  const error = useRouteError();
  if (isRouteErrorResponse(error) && error.status === 404) return <NotFound />;
  return <NotFound message={errorText(error)} />;
}
