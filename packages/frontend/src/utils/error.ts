export function handleError(error: unknown) {
  console.error(error);
}

export function getErrorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : '操作失败';
}
