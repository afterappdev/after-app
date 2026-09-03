export const DEFAULT_PAGE = 1;
export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;

export function paginate(page?: number, limit?: number) {
  const safePage =
    Number.isInteger(page) && page && page > 0 ? page : DEFAULT_PAGE;
  const rawLimit =
    Number.isInteger(limit) && limit && limit > 0 ? limit : DEFAULT_LIMIT;
  const safeLimit = Math.min(rawLimit, MAX_LIMIT);
  return {
    page: safePage,
    limit: safeLimit,
    skip: (safePage - 1) * safeLimit,
  };
}

export function paginationMeta(page: number, limit: number, total: number) {
  return {
    page,
    limit,
    total,
    totalPages: total === 0 ? 0 : Math.ceil(total / limit),
  };
}
