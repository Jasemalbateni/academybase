/**
 * Unified lib-level cache invalidation.
 *
 * Clears all module-level Promise caches that survive across navigations.
 * Call this during sign-out, alongside any UI-level caches (e.g. clearSidebarCache).
 *
 * Does NOT clear clearSidebarCache — that lives in the Sidebar component since
 * it also caches display data (academy name, logo, role) that is not a lib concern.
 */

import { clearAcademyIdCache } from "./academyId";
import { clearMembershipCache } from "./roles";

export function clearLibCaches(): void {
  clearAcademyIdCache();
  clearMembershipCache();
}
