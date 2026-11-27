/** Verification image retention rules. The server must commit the new state
 * before queueing actual storage-object deletions, and retry failed deletions. */
export interface VerificationImages {
  nationalIdPath: string;
  selfiePath: string;
  /** Profile photos are retained and must never be queued for deletion here. */
  profilePath: string;
}

function disposablePaths(images: VerificationImages, protectedPaths: string[]): string[] {
  const protectedSet = new Set(protectedPaths.filter(Boolean));
  return [...new Set([images.nationalIdPath, images.selfiePath].filter(path => path && !protectedSet.has(path)))];
}

/** Called after a successful manager approval; profile photo remains intact. */
export function approvedVerificationDeletions(images: VerificationImages): string[] {
  return disposablePaths(images, [images.profilePath]);
}

/** A rejected submission is retained until its replacement is committed. */
export function replacedVerificationDeletions(oldImages: VerificationImages, replacement: VerificationImages): string[] {
  if (!replacement.nationalIdPath || !replacement.selfiePath || !replacement.profilePath) {
    throw new Error('Complete replacement images are required');
  }
  return disposablePaths(oldImages, [oldImages.profilePath, replacement.profilePath, replacement.nationalIdPath, replacement.selfiePath]);
}
