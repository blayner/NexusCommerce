export interface PageRequest {
  page: number;
  pageSize: number;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export const MAX_PAGE_SIZE = 100;

export function normalizePage(request: Partial<PageRequest>): PageRequest {
  const page = Math.max(1, Math.floor(request.page ?? 1));
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(request.pageSize ?? 20)));
  return { page, pageSize };
}

export function paginate<T>(items: T[], total: number, request: PageRequest): Paginated<T> {
  return {
    items,
    total,
    page: request.page,
    pageSize: request.pageSize,
    totalPages: total === 0 ? 0 : Math.ceil(total / request.pageSize),
  };
}

export function mapPage<T, U>(page: Paginated<T>, fn: (item: T) => U): Paginated<U> {
  return { ...page, items: page.items.map(fn) };
}
