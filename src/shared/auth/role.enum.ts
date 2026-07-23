export enum Role {
  Admin = 'ADMIN',
  Customer = 'CUSTOMER',
}

export function isRole(value: string): value is Role {
  return (Object.values(Role) as string[]).includes(value);
}
