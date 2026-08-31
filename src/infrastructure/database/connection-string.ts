const legacyStrongSslMode = /([?&]sslmode=)(prefer|require|verify-ca)(?=(&|#|$))/gi;

/**
 * pg-connection-string currently treats these modes as verify-full, but its
 * next major release will follow libpq's weaker distinctions. Make the
 * intended certificate and hostname verification explicit without requiring
 * every deployment secret to be rewritten at the same time.
 */
export function enforceVerifiedPostgresSsl(connectionString: string) {
  return connectionString.replace(legacyStrongSslMode, "$1verify-full");
}
