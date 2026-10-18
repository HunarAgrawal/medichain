import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import App from "./App";
import type { Meta } from "./lib/api";
import type { WalletProvider } from "./lib/chain";

const ADDRESS = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";

const META: Meta = {
  chain_id: 31337,
  contract_address: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
  max_upload_mb: 10,
  analysis_types: [
    { id: "brain_tumor", name: "Brain tumor", modality: "MRI", description: "Four classes." },
    { id: "chest_xray", name: "Pneumonia", modality: "Chest X-ray", description: "Two classes." },
  ],
};

// Sign-in crosses several async hops (wallet, API, ethers); allow for slow CI machines.
const SIGN_IN = { timeout: 5000 };

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function mockApi() {
  const expires = new Date(Date.now() + 3_600_000).toISOString();
  const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>((url) => {
    if (url.endsWith("/meta")) return Promise.resolve(json(META));
    if (url.endsWith("/auth/challenge")) {
      return Promise.resolve(
        json({ nonce: "a".repeat(32), message: "Sign in", expires_at: expires }),
      );
    }
    if (url.endsWith("/auth/session")) {
      return Promise.resolve(
        json({ token: "session-token", address: ADDRESS, expires_at: expires }),
      );
    }
    return Promise.resolve(json({ detail: "Not found" }, 404));
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function installWallet() {
  let accounts: string[] = [];
  const request = vi.fn(({ method }: { method: string }) => {
    switch (method) {
      case "eth_accounts":
        return Promise.resolve(accounts);
      case "eth_requestAccounts":
        accounts = [ADDRESS];
        return Promise.resolve(accounts);
      case "eth_chainId":
        return Promise.resolve("0x7a69");
      case "personal_sign":
        return Promise.resolve(`0x${"11".repeat(65)}`);
      default:
        return Promise.reject(new Error(`Unexpected wallet call: ${method}`));
    }
  });
  const wallet: WalletProvider = { request, on: vi.fn(), removeListener: vi.fn() };
  window.ethereum = wallet;
  return { request };
}

afterEach(() => {
  delete window.ethereum;
});

describe("App", () => {
  it("offers a retry when the API is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    render(<App />);

    expect(await screen.findByText("The Medichain API is not responding")).toBeInTheDocument();

    mockApi();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("link", { name: /Install MetaMask/ })).toBeInTheDocument();
  });

  it("asks for a browser wallet when none is installed", async () => {
    mockApi();
    render(<App />);

    expect(await screen.findByRole("link", { name: /Install MetaMask/ })).toHaveAttribute(
      "href",
      "https://metamask.io/download/",
    );
  });

  it("signs in with the wallet and opens the analysis form", async () => {
    const fetchMock = mockApi();
    const { request } = installWallet();
    render(<App />);

    await userEvent.click(await screen.findByRole("button", { name: "Sign in with wallet" }));

    expect(
      await screen.findByRole("heading", { name: "New analysis" }, SIGN_IN),
    ).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Brain tumor/ })).toBeChecked();
    expect(screen.getByRole("button", { name: "Analyze scan" })).toBeEnabled();
    expect(request).toHaveBeenCalledWith(expect.objectContaining({ method: "personal_sign" }));
    const sessionCall = fetchMock.mock.calls.find(([url]) => url.endsWith("/auth/session"));
    expect(JSON.parse(sessionCall?.[1]?.body as string)).toMatchObject({ nonce: "a".repeat(32) });
    expect(sessionStorage.getItem("medichain.session")).toContain("session-token");
  });

  it("shows field errors instead of submitting an incomplete form", async () => {
    const fetchMock = mockApi();
    installWallet();
    render(<App />);
    await userEvent.click(await screen.findByRole("button", { name: "Sign in with wallet" }));
    await screen.findByRole("heading", { name: "New analysis" }, SIGN_IN);

    await userEvent.type(screen.getByLabelText("Patient ID"), "bad id");
    await userEvent.click(screen.getByRole("button", { name: "Analyze scan" }));

    expect(screen.getByText("Use 1–64 letters, numbers, hyphens or underscores.")).toBeVisible();
    expect(screen.getByText("Choose a scan to analyze.")).toBeVisible();
    expect(fetchMock.mock.calls.some(([url]) => url.endsWith("/analyses"))).toBe(false);
  });
});
