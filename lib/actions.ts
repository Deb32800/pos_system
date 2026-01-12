// Authentication is now handled via API routes
// This file is kept for compatibility but auth logic has moved to /app/api/auth/*

export async function signOut() {
  // Auth is handled via API routes - use /api/auth/logout
}

export async function getCurrentUser() {
  // Use /api/auth/session endpoint
  return null
}
