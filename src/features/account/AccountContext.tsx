import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getCurrentAccount } from "./api";
import type { AccountData } from "./api";

interface AccountContextValue {
  account: AccountData | null;
  isLoading: boolean;
  error: Error | null;
  setAccount: (account: AccountData | null) => void;
}

const AccountContext = createContext<AccountContextValue | null>(null);
export const ACCOUNT_QUERY_KEY = ["account", "current"] as const;

export function AccountProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const accountQuery = useQuery({
    queryKey: ACCOUNT_QUERY_KEY,
    queryFn: getCurrentAccount,
    staleTime: 60_000,
    gcTime: 24 * 60 * 60 * 1000,
    retry: false,
  });

  const setAccount = useCallback(
    (account: AccountData | null) => {
      queryClient.setQueryData(ACCOUNT_QUERY_KEY, account);
    },
    [queryClient],
  );

  const value = useMemo<AccountContextValue>(
    () => ({
      account: accountQuery.data ?? null,
      isLoading: accountQuery.isPending,
      error: accountQuery.error instanceof Error ? accountQuery.error : null,
      setAccount,
    }),
    [accountQuery.data, accountQuery.error, accountQuery.isPending, setAccount],
  );

  return (
    <AccountContext.Provider value={value}>{children}</AccountContext.Provider>
  );
}

export function useAccount() {
  const context = useContext(AccountContext);
  if (!context) {
    throw new Error("useAccount must be used inside AccountProvider.");
  }
  return context;
}
