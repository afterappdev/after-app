export function loginReturnPath(relativePath: string): string {
  return relativePath.replace(/^\/+/, '')
}

export function loginNavigationState(relativePath: string) {
  return { state: { from: loginReturnPath(relativePath) } }
}
