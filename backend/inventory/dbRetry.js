// A managed Postgres connection (see ../config/postgres.js) can go stale
// between requests — Supabase/NAT silently drop idle TCP sockets — and hand
// back "Connection terminated unexpectedly" on the very next query, even on
// an otherwise-fresh page load. Sequelize's own `retry` option only covers
// ACQUIRING a new pool connection, not a query handed a connection that was
// already checked out and has since gone stale. One retry after a short pause
// is enough to recover; anything else re-throws unchanged.
async function withConnectionRetry(fn) {
  try {
    return await fn();
  } catch (error) {
    const detail = `${error?.name || ''} ${error?.message || ''} ${error?.original?.message || error?.parent?.message || ''}`;
    const transient = /connection terminated unexpectedly|econnreset|epipe|sequelizeconnection|timeout/i.test(detail);
    if (!transient) throw error;
    await new Promise((resolve) => setTimeout(resolve, 250));
    return fn();
  }
}

module.exports = { withConnectionRetry };
