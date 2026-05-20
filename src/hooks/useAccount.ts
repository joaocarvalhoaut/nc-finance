import { useMemo } from "react";
import { getAccountProfile } from "../services/accountService";
import { useSession } from "./useSession";

export const useAccount = () => {
  const sessionState = useSession();

  const account = useMemo(() => getAccountProfile(sessionState.user), [sessionState.user]);

  return {
    ...sessionState,
    account,
    userId: account?.userId || null,
    email: account?.email || "",
    displayName: account?.displayName || ""
  };
};
