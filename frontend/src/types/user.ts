export type CurrentUserResponse = {
  actor: {
    id: string;
    displayLabel: string | null;
    status: string;
  };
  profile: {
    displayName: string | null;
    email: string | null;
    preferredUsername: string | null;
  };
  preferences: {
    [key: string]: unknown;
  };
  capabilities: {
    canCreateWorkspace: boolean;
    isSobaAdmin: boolean;
  };
};
