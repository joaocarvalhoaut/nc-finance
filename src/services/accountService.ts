import type { User } from "@supabase/supabase-js";
import type { AccountProfile } from "../types";

const buildDisplayName = (user: User | null) => {
  if (!user) {
    return "";
  }

  const metadataName =
    typeof user.user_metadata?.full_name === "string"
      ? user.user_metadata.full_name.trim()
      : "";

  if (metadataName) {
    return metadataName;
  }

  const emailPrefix = (user.email || "").split("@")[0]?.trim();
  return emailPrefix || "Conta autenticada";
};

export const getAccountProfile = (user: User | null): AccountProfile | null => {
  if (!user?.id || !user.email) {
    return null;
  }

  return {
    userId: user.id,
    email: user.email,
    displayName: buildDisplayName(user)
  };
};
