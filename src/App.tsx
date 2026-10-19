import {
  createHashRouter,
  Link,
  Navigate,
  RouterProvider,
} from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppLayout, PageFrame } from "./components/AppLayout";
import { EmptyState } from "./components/States";
import { CardDetailsPage } from "./features/cards/CardDetailsPage";
import { CardSearchPage } from "./features/cards/CardSearchPage";
import { FavouritesProvider } from "./features/favourites/FavouritesProvider";
import { FavouritesPage } from "./features/favourites/FavouritesPage";
import { ApitcgExplorerPage } from "./features/apitcg/ApitcgExplorerPage";
import { PackSimulatorPage } from "./features/packs/PackSimulatorPage";
import { SetPage } from "./features/sets/SetPage";
import { SetsPage } from "./features/sets/SetsPage";
import { CurrencyProvider } from "./lib/pricing/CurrencyContext";
import { LanguageProvider } from "./lib/tcgdex/LanguageContext";
import { useLanguage } from "./lib/tcgdex/useLanguage";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 10 * 60 * 1000,
    },
  },
});

function NotFoundPage() {
  return (
    <PageFrame>
      <EmptyState title="Page not found">
        <Link to="/sets">Return to the set catalogue</Link>
      </EmptyState>
    </PageFrame>
  );
}

const router = createHashRouter([
  {
    path: "/",
    element: <AppLayout />,
    children: [
      { index: true, element: <Navigate to="/sets" replace /> },
      { path: "sets", element: <SetsPage /> },
      { path: "sets/:setId", element: <SetPage /> },
      { path: "cards", element: <CardSearchPage /> },
      { path: "cards/:cardId", element: <CardDetailsPage /> },
      { path: "favourites", element: <FavouritesPage /> },
      { path: "apitcg", element: <ApitcgExplorerPage /> },
      { path: "packs", element: <PackSimulatorPage /> },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
]);

function AppContent() {
  const { language } = useLanguage();

  return (
    <QueryClientProvider client={queryClient}>
      <FavouritesProvider language={language}>
        <RouterProvider router={router} />
      </FavouritesProvider>
    </QueryClientProvider>
  );
}

export default function App() {
  return (
    <CurrencyProvider>
      <LanguageProvider>
        <AppContent />
      </LanguageProvider>
    </CurrencyProvider>
  );
}
