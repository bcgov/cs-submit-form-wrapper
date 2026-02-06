export interface User {
  iss: string;
  iat: number;
  exp: number;
  aud: string;
  sub: string;
  GivenName: string;
  Surname: string;
  Email: string;
  Role: string[];
}

<<<<<<< Updated upstream
export const ADMIN = 'Project Administrator';
export const MANAGER = 'Manager';
=======
export const ADMIN = process.env.ADMIN_ROLE_NAME || 'Admin';
export const MANAGER = process.env.MANAGER_ROLE_NAME || 'Manager';
>>>>>>> Stashed changes
