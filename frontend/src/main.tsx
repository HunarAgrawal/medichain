import { QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router";

import { meKey } from "./auth/session";
import { ApiError } from "./lib/api";
import { router } from "./router";
import "./styles.css";

const queryClient = new QueryClient({
  queryCache: new QueryCache({
    // A 401 anywhere means the session ended (expired, revoked, signed out elsewhere).
    onError: (error) => {
      if (error instanceof ApiError && error.status === 401) queryClient.setQueryData(meKey, null);
    },
  }),
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: (failures, error) =>
        !(error instanceof ApiError && error.status < 500) && failures < 2,
    },
  },
});

const root = document.getElementById("root");
if (!root) throw new Error("Root element #root not found");

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
