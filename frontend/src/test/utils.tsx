import { type ReactElement, type ReactNode } from "react";
import { render, type RenderOptions } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { App as AntApp, ConfigProvider } from "antd";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { AuthProvider } from "@/app/auth";
import { antdTheme } from "@/app/theme";

export function createTestQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
}

interface Options extends Omit<RenderOptions, "wrapper"> {
  route?: string;
  path?: string;
  withAuth?: boolean;
}

/** Render with React Query, Ant Design, router and (optionally) the real AuthProvider. */
export function renderWithProviders(ui: ReactElement, { route = "/", path, withAuth = true, ...options }: Options = {}) {
  const client = createTestQueryClient();
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <ConfigProvider theme={antdTheme}>
      <AntApp>
        <QueryClientProvider client={client}>
          <MemoryRouter initialEntries={[route]}>
            {withAuth ? <AuthProvider>{path ? <Routes><Route path={path} element={children} /></Routes> : children}</AuthProvider> : path ? <Routes><Route path={path} element={children} /></Routes> : children}
          </MemoryRouter>
        </QueryClientProvider>
      </AntApp>
    </ConfigProvider>
  );
  return { client, ...render(ui, { wrapper: Wrapper, ...options }) };
}
